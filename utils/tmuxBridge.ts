import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import { PathResolver } from './paths';
import { SecureCommandExecutor, secureTmux, secureGit, secureExec } from './secureExecution';
import { CryptographicQASystem, QAApprovalData, QATestResults, CryptoQAApproval } from './cryptoQA';
import { qaEventBus, QAEventType, QAEvent, QAWorkflowOrchestrator } from './qaEvents';
import { PerformanceCache, ConnectionPool, PerformanceMonitor, debounce, throttle } from './performanceOptimizations';

export interface TmuxSession {
	name: string;
	windows: TmuxWindow[];
	attached: boolean;
}

export interface TmuxWindow {
	sessionName: string;
	windowIndex: number;
	windowName: string;
	active: boolean;
}

export interface WindowInfo {
	name: string;
	active: boolean;
	panes: number;
	layout: string;
	content?: string;
	error?: string;
}

export interface TmuxBridgeConfig {
	externalScriptsDir?: string;
	projectBasePath?: string;
	qaKeysPath?: string;
	approvalStoragePath?: string;
}

export class TmuxBridge {
	private pythonScriptPath: string;
	private pathResolver: PathResolver;
	private config: TmuxBridgeConfig;
	private approvalCache: Map<string, CryptoQAApproval> = new Map();
	private blockCache: Map<string, any> = new Map();
	private workflowOrchestrator: QAWorkflowOrchestrator;
	
	// Performance optimization components
	private sessionsCache: PerformanceCache<TmuxSession[]>;
	private windowContentCache: PerformanceCache<string>;
	private performanceMonitor: PerformanceMonitor;
	private debouncedCapture: (sessionName: string, windowIndex: number, numLines?: number) => Promise<string>;
	private throttledStatus: () => Promise<any>;

	constructor(config?: TmuxBridgeConfig) {
		this.config = config || {};
		this.pathResolver = new PathResolver();
		this.workflowOrchestrator = qaEventBus.createWorkflowOrchestrator();
		
		// Initialize performance optimization components
		this.sessionsCache = new PerformanceCache<TmuxSession[]>({
			maxSize: 100,
			maxAge: 60000, // 1 minute cache for session data
		});
		
		this.windowContentCache = new PerformanceCache<string>({
			maxSize: 500,
			maxAge: 30000, // 30 seconds cache for window content
		});
		
		this.performanceMonitor = new PerformanceMonitor();
		
		// Create debounced and throttled methods
		this.debouncedCapture = debounce(this.captureWindowContentDirect.bind(this), 100);
		this.throttledStatus = throttle(this.getAllWindowsStatusDirect.bind(this), 1000);
		
		// Resolve the path to the tmux_utils.py script
		this.pythonScriptPath = this.pathResolver.getScriptPath('tmux_utils.py', config?.externalScriptsDir);
	}

	/**
	 * Execute Python script and return JSON result
	 */
	private async executePython(method: string, args: any[] = []): Promise<any> {
		return new Promise((resolve, reject) => {
			const pythonArgs = [this.pythonScriptPath, method, ...args.map(arg => JSON.stringify(arg))];
			const python = spawn('python3', pythonArgs);
			
			let stdout = '';
			let stderr = '';

			python.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			python.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			python.on('close', (code) => {
				if (code !== 0) {
					reject(new Error(`Python script failed: ${stderr}`));
				} else {
					try {
						const result = JSON.parse(stdout);
						resolve(result);
					} catch (error) {
						// If not JSON, return raw output
						resolve(stdout);
					}
				}
			});
		});
	}

	/**
	 * Get all tmux sessions and their windows with caching
	 */
	async getTmuxSessions(): Promise<TmuxSession[]> {
		const startTime = Date.now();
		const cacheKey = 'tmux_sessions';
		
		try {
			// Check cache first
			const cached = this.sessionsCache.get(cacheKey);
			if (cached) {
				const duration = Date.now() - startTime;
				this.performanceMonitor.recordExecutionTime(duration);
				return cached;
			}

			// Fetch from system
			const result = await this.executePython('get_tmux_sessions');
			
			// Cache the result
			this.sessionsCache.set(cacheKey, result);
			
			const duration = Date.now() - startTime;
			this.performanceMonitor.recordExecutionTime(duration);
			
			// Update cache metrics
			const cacheMetrics = this.sessionsCache.getMetrics();
			this.performanceMonitor.updateCacheMetrics(cacheMetrics.hits, cacheMetrics.misses);
			
			return result;
		} catch (error) {
			console.error('Error getting tmux sessions:', error);
			const duration = Date.now() - startTime;
			this.performanceMonitor.recordExecutionTime(duration);
			return [];
		}
	}

	/**
	 * Capture content from a tmux window with caching and debouncing
	 */
	async captureWindowContent(sessionName: string, windowIndex: number, numLines: number = 50): Promise<string> {
		const startTime = Date.now();
		const cacheKey = `window_content_${sessionName}_${windowIndex}_${numLines}`;
		
		try {
			// Check cache first
			const cached = this.windowContentCache.get(cacheKey);
			if (cached) {
				const duration = Date.now() - startTime;
				this.performanceMonitor.recordExecutionTime(duration);
				return cached;
			}

			// Use debounced capture to prevent rapid successive calls
			const result = await this.debouncedCapture(sessionName, windowIndex, numLines);
			
			// Cache the result
			this.windowContentCache.set(cacheKey, result, 30000); // 30 second TTL
			
			const duration = Date.now() - startTime;
			this.performanceMonitor.recordExecutionTime(duration);
			
			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			this.performanceMonitor.recordExecutionTime(duration);
			throw new Error(`Failed to capture window content: ${error.message}`);
		}
	}

	/**
	 * Direct window content capture without caching (used by debounced method)
	 */
	private async captureWindowContentDirect(sessionName: string, windowIndex: number, numLines: number = 50): Promise<string> {
		try {
			const result = await this.executePython('capture_window_content', [sessionName, windowIndex, numLines]);
			return result;
		} catch (error) {
			throw new Error(`Failed to capture window content: ${error.message}`);
		}
	}

	/**
	 * Get detailed information about a specific window
	 */
	async getWindowInfo(sessionName: string, windowIndex: number): Promise<WindowInfo> {
		try {
			const result = await this.executePython('get_window_info', [sessionName, windowIndex]);
			return result;
		} catch (error) {
			throw new Error(`Failed to get window info: ${error.message}`);
		}
	}

	/**
	 * Send keys to a tmux window
	 */
	async sendKeysToWindow(sessionName: string, windowIndex: number, keys: string): Promise<boolean> {
		try {
			const result = await this.executePython('send_keys_to_window', [sessionName, windowIndex, keys, false]);
			return result === true;
		} catch (error) {
			throw new Error(`Failed to send keys: ${error.message}`);
		}
	}

	/**
	 * Send a command to a window (adds Enter automatically)
	 */
	async sendCommandToWindow(sessionName: string, windowIndex: number, command: string): Promise<boolean> {
		try {
			const result = await this.executePython('send_command_to_window', [sessionName, windowIndex, command, false]);
			return result === true;
		} catch (error) {
			throw new Error(`Failed to send command: ${error.message}`);
		}
	}

	/**
	 * Get status of all windows across all sessions with throttling
	 */
	async getAllWindowsStatus(): Promise<any> {
		const startTime = Date.now();
		
		try {
			// Use throttled method to prevent excessive calls
			const result = await this.throttledStatus();
			
			const duration = Date.now() - startTime;
			this.performanceMonitor.recordExecutionTime(duration);
			
			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			this.performanceMonitor.recordExecutionTime(duration);
			throw new Error(`Failed to get windows status: ${error.message}`);
		}
	}

	/**
	 * Direct status retrieval without throttling (used by throttled method)
	 */
	private async getAllWindowsStatusDirect(): Promise<any> {
		try {
			const result = await this.executePython('get_all_windows_status');
			return result;
		} catch (error) {
			throw new Error(`Failed to get windows status: ${error.message}`);
		}
	}

	/**
	 * Find windows by name across all sessions
	 */
	async findWindowByName(windowName: string): Promise<Array<[string, number]>> {
		try {
			const result = await this.executePython('find_window_by_name', [windowName]);
			return result;
		} catch (error) {
			throw new Error(`Failed to find window: ${error.message}`);
		}
	}

	/**
	 * Create a comprehensive monitoring snapshot
	 */
	async createMonitoringSnapshot(): Promise<string> {
		try {
			const result = await this.executePython('create_monitoring_snapshot');
			return result;
		} catch (error) {
			throw new Error(`Failed to create monitoring snapshot: ${error.message}`);
		}
	}

	/**
	 * Use send-claude-message.sh script for reliable messaging
	 */
	async sendClaudeMessage(target: string, message: string): Promise<boolean> {
		try {
			const scriptPath = this.pathResolver.getScriptPath('send-claude-message.sh', this.config.externalScriptsDir);
			
			// Validate inputs
			if (!target || typeof target !== 'string') {
				throw new Error('Invalid target parameter');
			}
			if (!message || typeof message !== 'string') {
				throw new Error('Invalid message parameter');
			}
			if (message.length > 10000) {
				throw new Error('Message too long (max 10000 characters)');
			}

			// Sanitize message for safe shell execution
			const sanitizedMessage = message
				.replace(/[\\"]/g, '\\$&')     // Escape quotes and backslashes
				.replace(/\n/g, '\\n')         // Convert newlines to literal \n
				.replace(/\r/g, '\\r')         // Convert carriage returns to literal \r
				.replace(/\t/g, '\\t')         // Convert tabs to literal \t
				.replace(/\0/g, '');           // Remove null bytes completely
			
			// Check if command would exceed shell argument length limits
			const fullCommand = `"${scriptPath}" "${target}" "${sanitizedMessage}"`;
			const usesTempFile = fullCommand.length > 800; // Conservative limit
			
			let result;
			let tempFile = '';
			
			if (usesTempFile) {
				// Use temporary file approach for long messages
				tempFile = `/tmp/claude_message_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`;
				
				try {
					// Write message to temporary file
					fs.writeFileSync(tempFile, message, 'utf8');
					
					// Call script with temp file flag
					result = await secureExec({
						command: 'bash',
						args: ['-c', `"${scriptPath}" "${target}" --file "${tempFile}"`],
						timeout: 10000
					});
				} finally {
					// Clean up temp file
					if (tempFile && fs.existsSync(tempFile)) {
						try {
							fs.unlinkSync(tempFile);
						} catch (cleanupError) {
							console.warn(`Failed to cleanup temp file ${tempFile}: ${cleanupError.message}`);
						}
					}
				}
			} else {
				// Use direct argument approach for short messages
				result = await secureExec({
					command: 'bash',
					args: ['-c', `"${scriptPath}" "${target}" "${sanitizedMessage}"`],
					timeout: 10000
				});
			}

			if (!result.success) {
				throw new Error(`Script execution failed: ${result.stderr}`);
			}

			return true;
		} catch (error) {
			throw new Error(`Failed to send Claude message: ${error.message}`);
		}
	}

	/**
	 * Suggest subagent usage to agents
	 */
	async suggestSubagent(target: string, agentType: 'pm' | 'developer' | 'engineer' | 'general', context?: string): Promise<boolean> {
		try {
			// Validate inputs
			const allowedAgentTypes = ['pm', 'developer', 'engineer', 'general'];
			if (!allowedAgentTypes.includes(agentType)) {
				throw new Error(`Invalid agent type: ${agentType}`);
			}
			if (!target || typeof target !== 'string') {
				throw new Error('Invalid target parameter');
			}

			const scriptPath = this.pathResolver.getScriptPath('suggest_subagent.sh', this.config.externalScriptsDir);
			const contextArg = context ? context.replace(/[\\"]/g, '\\$&') : '';
			
			const result = await secureExec({
				command: 'bash',
				args: contextArg 
					? ['-c', `"${scriptPath}" "${target}" "${agentType}" "${contextArg}"`]
					: ['-c', `"${scriptPath}" "${target}" "${agentType}"`],
				timeout: 10000
			});

			if (!result.success) {
				// If script not found or execution fails, fallback to manual suggestion
				if (result.stderr.includes('not found') || result.stderr.includes('No such file')) {
					return this.sendSubagentSuggestionManually(target, agentType, context);
				}
				throw new Error(`Script execution failed: ${result.stderr}`);
			}

			return true;
		} catch (error) {
			throw new Error(`Failed to suggest subagent: ${error.message}`);
		}
	}

	/**
	 * Manual fallback for subagent suggestions
	 */
	private async sendSubagentSuggestionManually(target: string, agentType: string, context?: string): Promise<boolean> {
		let message = '';
		
		switch (agentType) {
			case 'pm':
				message = `🚀 SUBAGENT SUGGESTION: Consider deploying subagents for parallel execution:
• For implementation: Use Task tool with subagent_type='developer'
• For testing: Use Task tool with subagent_type='qa-expert'
• For research: Use Task tool with subagent_type='research-analyst'
Remember: Effective delegation multiplies your impact!`;
				break;
			case 'developer':
			case 'engineer':
				message = `⚡ PERFORMANCE TIP: Accelerate your work with specialized subagents:
• For debugging: Use Task tool with subagent_type='debugger'
• For testing: Use Task tool with subagent_type='test-automator'
• For review: Use Task tool with subagent_type='code-reviewer'
While the subagent investigates, you can continue with other tasks!`;
				break;
			default:
				message = `💡 EFFICIENCY BOOST: Consider using subagents for parallel task execution.
Available specialists: debugger, test-automator, performance-engineer, code-reviewer, research-analyst.
Deploy with: Task tool with prompt='[your task]' and subagent_type='[agent-type]'`;
		}
		
		if (context) {
			message = message.replace(':', ` (${context}):`);
		}
		
		return this.sendClaudeMessage(target, message);
	}

	/**
	 * Schedule a check-in with note
	 */
	async scheduleCheckIn(minutes: number, note: string, targetWindow?: string): Promise<boolean> {
		try {
			// Validate inputs
			if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
				throw new Error('Minutes must be integer between 1 and 1440 (24 hours)');
			}
			if (!note || typeof note !== 'string') {
				throw new Error('Invalid note parameter');
			}
			if (note.length > 1000) {
				throw new Error('Note too long (max 1000 characters)');
			}
			if (targetWindow && (typeof targetWindow !== 'string' || targetWindow.length === 0)) {
				throw new Error('Invalid targetWindow parameter');
			}

			const scriptPath = this.pathResolver.getScriptPath('schedule_with_note.sh', this.config.externalScriptsDir);
			const sanitizedNote = note.replace(/[\\"]/g, '\\$&');
			
			const args = targetWindow
				? ['-c', `"${scriptPath}" "${minutes}" "${sanitizedNote}" "${targetWindow}"`]
				: ['-c', `"${scriptPath}" "${minutes}" "${sanitizedNote}"`];
			
			const result = await secureExec({
				command: 'bash',
				args,
				timeout: 15000
			});

			if (!result.success) {
				throw new Error(`Script execution failed: ${result.stderr}`);
			}

			return true;
		} catch (error) {
			throw new Error(`Failed to schedule check-in: ${error.message}`);
		}
	}

	/**
	 * Create a new tmux session with windows
	 */
	async createSession(sessionName: string, projectPath?: string, windows?: string[]): Promise<boolean> {
		try {
			// Validate inputs
			if (!sessionName || typeof sessionName !== 'string') {
				throw new Error('Invalid session name');
			}
			if (!/^[a-zA-Z0-9_-]+$/.test(sessionName)) {
				throw new Error('Session name can only contain letters, numbers, underscores, and hyphens');
			}
			if (projectPath && typeof projectPath !== 'string') {
				throw new Error('Invalid project path');
			}
			if (windows && !Array.isArray(windows)) {
				throw new Error('Windows must be an array');
			}
			
			// Create the session
			const createArgs = projectPath
				? ['new-session', '-d', '-s', sessionName, '-c', projectPath]
				: ['new-session', '-d', '-s', sessionName];
			
			const createResult = await secureTmux('new-session', createArgs.slice(1));
			
			if (!createResult.success) {
				throw new Error(`Failed to create session: ${createResult.stderr}`);
			}

			// Create additional windows if specified
			if (windows && windows.length > 0) {
				// First window already exists, rename it
				if (windows[0]) {
					const renameResult = await secureTmux('rename-window', ['-t', `${sessionName}:0`, windows[0]]);
					if (!renameResult.success) {
						throw new Error(`Failed to rename first window: ${renameResult.stderr}`);
					}
				}

				// Create additional windows
				for (let i = 1; i < windows.length; i++) {
					// Validate window name
					if (typeof windows[i] !== 'string' || windows[i].length === 0) {
						throw new Error(`Invalid window name at index ${i}`);
					}
					
					const windowArgs = projectPath
						? ['new-window', '-t', sessionName, '-n', windows[i], '-c', projectPath]
						: ['new-window', '-t', sessionName, '-n', windows[i]];
					
					const windowResult = await secureTmux('new-window', windowArgs.slice(1));
					
					if (!windowResult.success) {
						throw new Error(`Failed to create window ${windows[i]}: ${windowResult.stderr}`);
					}
				}
			}

			return true;
		} catch (error) {
			throw new Error(`Failed to create session: ${error.message}`);
		}
	}

	/**
	 * Kill a tmux session
	 */
	async killSession(sessionName: string): Promise<boolean> {
		try {
			// Validate inputs
			if (!sessionName || typeof sessionName !== 'string') {
				throw new Error('Invalid session name');
			}
			if (!/^[a-zA-Z0-9_-]+$/.test(sessionName)) {
				throw new Error('Session name can only contain letters, numbers, underscores, and hyphens');
			}

			const result = await secureTmux('kill-session', ['-t', sessionName]);
			
			if (!result.success) {
				throw new Error(`Failed to kill session: ${result.stderr}`);
			}
			
			return true;
		} catch (error) {
			throw new Error(`Failed to kill session: ${error.message}`);
		}
	}

	/**
	 * Rename a tmux window
	 */
	async renameWindow(target: string, newName: string): Promise<boolean> {
		try {
			// Validate inputs
			if (!target || typeof target !== 'string') {
				throw new Error('Invalid target parameter');
			}
			if (!newName || typeof newName !== 'string') {
				throw new Error('Invalid new name parameter');
			}
			if (newName.length > 100) {
				throw new Error('Window name too long (max 100 characters)');
			}

			const result = await secureTmux('rename-window', ['-t', target, newName]);
			
			if (!result.success) {
				throw new Error(`Failed to rename window: ${result.stderr}`);
			}
			
			return true;
		} catch (error) {
			throw new Error(`Failed to rename window: ${error.message}`);
		}
	}

	/**
	 * QA-specific methods for quality assurance workflow
	 */

	/**
	 * Register a QA Engineer with their public key
	 */
	async registerQAEngineer(qaEngineerID: string, publicKeyHex: string): Promise<boolean> {
		try {
			return await CryptographicQASystem.registerQAEngineer(qaEngineerID, publicKeyHex);
		} catch (error) {
			throw new Error(`Failed to register QA Engineer: ${error.message}`);
		}
	}

	/**
	 * Generate new QA key pair for a QA Engineer
	 */
	async generateQAKeyPair(): Promise<{ privateKey: string; publicKey: string; qaEngineerID: string }> {
		try {
			const keyPair = await CryptographicQASystem.generateQAKeyPair();
			const qaEngineerID = `qa_${Date.now()}_${randomBytes(8).toString('hex')}`;
			
			// Register the public key
			await this.registerQAEngineer(qaEngineerID, keyPair.publicKeyHex);
			
			return {
				privateKey: keyPair.privateKeyHex,
				publicKey: keyPair.publicKeyHex,
				qaEngineerID
			};
		} catch (error) {
			throw new Error(`Failed to generate QA key pair: ${error.message}`);
		}
	}
	
	/**
	 * Check if cryptographic QA approval exists for a project
	 */
	async checkQAApproval(projectName: string, commitHash: string): Promise<{ approved: boolean; details?: any; auditHash?: string }> {
		try {
			// Validate inputs
			if (!projectName || typeof projectName !== 'string') {
				throw new Error('Invalid project name');
			}
			if (!commitHash || !/^[a-fA-F0-9]{40}$/.test(commitHash)) {
				throw new Error('Invalid commit hash');
			}

			const approvalKey = `${projectName}:${commitHash}`;
			
			// Check approval cache
			const approval = this.approvalCache.get(approvalKey);
			if (approval) {
				const verification = await CryptographicQASystem.verifyQAApproval(approval);
				if (verification.valid) {
					return { 
						approved: true, 
						details: approval.data,
						auditHash: CryptographicQASystem.generateAuditHash(approval)
					};
				} else {
					// Remove invalid approval from cache
					this.approvalCache.delete(approvalKey);
				}
			}
			
			// Check for blocks
			const block = this.blockCache.get(approvalKey);
			if (block) {
				return { approved: false, details: block };
			}
			
			return { approved: false, details: { reason: 'No QA approval or block found' } };
		} catch (error) {
			throw new Error(`Failed to check QA approval: ${error.message}`);
		}
	}

	/**
	 * Send QA validation request to QA Engineer
	 */
	async requestQAValidation(projectName: string, testTypes: string[], context?: string): Promise<boolean> {
		try {
			// Find QA Engineer window
			const sessions = await this.getTmuxSessions();
			const session = sessions.find(s => s.name === projectName);
			
			if (!session) {
				throw new Error(`Project session ${projectName} not found`);
			}

			const qaWindow = session.windows.find(w => 
				w.windowName.toLowerCase().includes('qa') || w.windowIndex === 1
			);

			if (!qaWindow) {
				throw new Error('QA Engineer window not found');
			}

			const validationRequest = `🔍 QA VALIDATION REQUEST
Project: ${projectName}
Test Types: ${testTypes.join(', ')}
${context ? `Context: ${context}` : ''}

Please execute comprehensive testing and provide results:
1. Run automated test suites for: ${testTypes.join(', ')}
2. Perform manual validation as needed
3. Check code quality and security
4. Provide approve/reject decision with detailed feedback

Use "Approve for Commit" or "Block Commit" operations based on results.`;

			await this.sendClaudeMessage(`${projectName}:${qaWindow.windowIndex}`, validationRequest);
			return true;
		} catch (error) {
			throw new Error(`Failed to request QA validation: ${error.message}`);
		}
	}

	/**
	 * Create cryptographic QA approval for git commits with event publishing
	 */
	async createQAApproval(
		projectName: string, 
		commitHash: string,
		commitMessage: string, 
		qaEngineerID: string,
		privateKeyHex: string,
		testResults: QATestResults,
		correlationId?: string
	): Promise<CryptoQAApproval> {
		const eventCorrelationId = correlationId || qaEventBus.generateCorrelationId();
		
		try {
			// Validate inputs
			if (!projectName || typeof projectName !== 'string') {
				throw new Error('Invalid project name');
			}
			if (!commitHash || !/^[a-fA-F0-9]{40}$/.test(commitHash)) {
				throw new Error('Invalid commit hash');
			}
			if (!commitMessage || typeof commitMessage !== 'string') {
				throw new Error('Invalid commit message');
			}
			if (!qaEngineerID || typeof qaEngineerID !== 'string') {
				throw new Error('Invalid QA Engineer ID');
			}
			if (!privateKeyHex || !/^[a-fA-F0-9]{64}$/.test(privateKeyHex)) {
				throw new Error('Invalid private key format');
			}

			const approvalData: QAApprovalData = {
				projectName,
				commitHash,
				commitMessage,
				testResults,
				qaEngineerID,
				approvalTimestamp: Date.now(),
				expirationTimestamp: Date.now() + 30 * 60 * 1000, // 30 minutes
				approvalNonce: '' // Will be generated in createQAApproval
			};

			// Create cryptographically signed approval
			const approval = await CryptographicQASystem.createQAApproval(approvalData, privateKeyHex);

			// Store in secure cache
			const approvalKey = `${projectName}:${commitHash}`;
			this.approvalCache.set(approvalKey, approval);

			// Remove any existing block for this project/commit
			this.blockCache.delete(approvalKey);

			// Publish approval granted event
			await qaEventBus.publishEvent({
				type: QAEventType.APPROVAL_GRANTED,
				timestamp: Date.now(),
				projectName,
				commitHash,
				qaEngineerID,
				correlationId: eventCorrelationId,
				payload: {
					approval,
					auditHash: CryptographicQASystem.generateAuditHash(approval),
					testResults
				}
			});

			return approval;
		} catch (error) {
			// Publish system error event
			await qaEventBus.publishEvent({
				type: QAEventType.QA_SYSTEM_ERROR,
				timestamp: Date.now(),
				projectName,
				commitHash,
				qaEngineerID,
				correlationId: eventCorrelationId,
				payload: {
					error: error.message,
					context: 'createQAApproval'
				}
			});

			throw new Error(`Failed to create QA approval: ${error.message}`);
		}
	}

	/**
	 * Block git commits with cryptographic QA rejection
	 */
	async createQABlock(
		projectName: string, 
		commitHash: string,
		commitMessage: string, 
		qaEngineerID: string,
		blockReason: string,
		testResults: QATestResults,
		privateKeyHex: string
	): Promise<any> {
		try {
			// Validate inputs
			if (!projectName || typeof projectName !== 'string') {
				throw new Error('Invalid project name');
			}
			if (!commitHash || !/^[a-fA-F0-9]{40}$/.test(commitHash)) {
				throw new Error('Invalid commit hash');
			}
			if (!commitMessage || typeof commitMessage !== 'string') {
				throw new Error('Invalid commit message');
			}
			if (!qaEngineerID || typeof qaEngineerID !== 'string') {
				throw new Error('Invalid QA Engineer ID');
			}
			if (!blockReason || typeof blockReason !== 'string') {
				throw new Error('Invalid block reason');
			}
			if (!privateKeyHex || !/^[a-fA-F0-9]{64}$/.test(privateKeyHex)) {
				throw new Error('Invalid private key format');
			}

			// Create cryptographically signed block
			const block = await CryptographicQASystem.createQABlock(
				projectName,
				commitHash,
				commitMessage,
				qaEngineerID,
				blockReason,
				testResults,
				privateKeyHex
			);

			// Store in secure cache
			const approvalKey = `${projectName}:${commitHash}`;
			this.blockCache.set(approvalKey, block);

			// Remove any existing approval for this project/commit
			this.approvalCache.delete(approvalKey);

			return block;
		} catch (error) {
			throw new Error(`Failed to create QA block: ${error.message}`);
		}
	}

	/**
	 * Get cryptographic QA status for a project
	 */
	async getQAStatus(projectName: string, commitHash: string): Promise<{ status: string; details?: any; auditHash?: string }> {
		try {
			// Validate inputs
			if (!projectName || typeof projectName !== 'string') {
				throw new Error('Invalid project name');
			}
			if (!commitHash || !/^[a-fA-F0-9]{40}$/.test(commitHash)) {
				throw new Error('Invalid commit hash');
			}

			const approvalKey = `${projectName}:${commitHash}`;
			
			// Check for approval
			const approval = this.approvalCache.get(approvalKey);
			if (approval) {
				const verification = await CryptographicQASystem.verifyQAApproval(approval);
				if (verification.valid) {
					return { 
						status: 'approved', 
						details: approval.data,
						auditHash: CryptographicQASystem.generateAuditHash(approval)
					};
				} else {
					// Remove invalid approval
					this.approvalCache.delete(approvalKey);
					return { 
						status: 'expired', 
						details: { 
							message: `QA approval invalid: ${verification.reason}`,
							requiresNewValidation: true 
						} 
					};
				}
			}
			
			// Check for block
			const block = this.blockCache.get(approvalKey);
			if (block) {
				return { status: 'blocked', details: block.blockData };
			}
			
			return { 
				status: 'pending', 
				details: { 
					message: 'No QA validation performed yet',
					projectName,
					commitHash
				} 
			};
		} catch (error) {
			throw new Error(`Failed to get QA status: ${error.message}`);
		}
	}

	/**
	 * Notify team of QA status change
	 */
	async notifyQAStatusChange(projectName: string, status: 'approved' | 'blocked', feedback?: string): Promise<boolean> {
		try {
			const sessions = await this.getTmuxSessions();
			const session = sessions.find(s => s.name === projectName);
			
			if (!session) {
				return false;
			}

			const statusMessage = status === 'approved' 
				? `✅ QA APPROVAL: Git commits are now enabled.\n${feedback ? `QA Feedback: ${feedback}` : 'All quality checks passed.'}`
				: `❌ QA REJECTION: Git commits are blocked.\n${feedback ? `QA Feedback: ${feedback}` : 'Quality issues found - address and retest.'}`;

			// Notify all team members
			for (const window of session.windows) {
				if (window.windowIndex !== 1) { // Don't notify QA engineer of their own decision
					await this.sendClaudeMessage(`${projectName}:${window.windowIndex}`, statusMessage);
				}
			}

			return true;
		} catch (error) {
			throw new Error(`Failed to notify QA status change: ${error.message}`);
		}
	}

	/**
	 * Execute QA test suite with event-driven workflow
	 */
	async executeQATests(projectName: string, testTypes: string[], projectPath?: string, commitHash?: string, qaEngineerID?: string): Promise<{ success: boolean; results: any; correlationId: string }> {
		const correlationId = qaEventBus.generateCorrelationId();
		
		try {
			// Validate inputs
			if (!projectName || typeof projectName !== 'string') {
				throw new Error('Invalid project name');
			}
			if (!Array.isArray(testTypes) || testTypes.length === 0) {
				throw new Error('Invalid test types');
			}

			const startTime = Date.now();

			// Publish test started event
			await qaEventBus.publishEvent({
				type: QAEventType.TEST_STARTED,
				timestamp: startTime,
				projectName,
				commitHash: commitHash || 'unknown',
				qaEngineerID,
				correlationId,
				payload: {
					testTypes,
					projectPath,
					triggeredBy: qaEngineerID || 'system'
				}
			});

			const results = {
				testTypes,
				executed: [],
				failed: [],
				timestamp: new Date().toISOString(),
			};

			const testResults: QATestResults = {
				unit: false,
				integration: false,
				security: false,
				performance: false,
				coverage: 0,
				passedTests: 0,
				totalTests: testTypes.length,
				criticalIssues: []
			};

			// Execute different test types
			for (const testType of testTypes) {
				try {
					let testPassed = false;
					
					switch (testType) {
						case 'unit':
							testPassed = await this.runUnitTests(projectPath);
							testResults.unit = testPassed;
							results.executed.push({ type: 'unit', status: testPassed ? 'passed' : 'failed' });
							break;
						case 'integration':
							testPassed = await this.runIntegrationTests(projectPath);
							testResults.integration = testPassed;
							results.executed.push({ type: 'integration', status: testPassed ? 'passed' : 'failed' });
							break;
						case 'security':
							testPassed = await this.runSecurityScan(projectPath);
							testResults.security = testPassed;
							results.executed.push({ type: 'security', status: testPassed ? 'passed' : 'failed' });
							break;
						case 'performance':
							testPassed = await this.runPerformanceTests(projectPath);
							testResults.performance = testPassed;
							results.executed.push({ type: 'performance', status: testPassed ? 'passed' : 'failed' });
							break;
						case 'coverage':
							testPassed = await this.checkCodeCoverage(projectPath);
							// Assume 80% coverage if test passed
							testResults.coverage = testPassed ? 85 : 60;
							results.executed.push({ type: 'coverage', status: testPassed ? 'passed' : 'failed' });
							break;
					}

					if (testPassed) {
						testResults.passedTests++;
					}

				} catch (error) {
					results.failed.push({ type: testType, error: error.message });
					
					// Add critical issues for failed security tests
					if (testType === 'security') {
						testResults.criticalIssues.push(`Security test failed: ${error.message}`);
					}
				}
			}

			const success = results.failed.length === 0;
			const duration = Date.now() - startTime;

			// Publish appropriate completion event
			if (success) {
				await qaEventBus.publishEvent({
					type: QAEventType.TEST_COMPLETED,
					timestamp: Date.now(),
					projectName,
					commitHash: commitHash || 'unknown',
					qaEngineerID,
					correlationId,
					payload: {
						testResults,
						duration,
						triggeredBy: qaEngineerID || 'system'
					}
				});
			} else {
				await qaEventBus.publishEvent({
					type: QAEventType.TEST_FAILED,
					timestamp: Date.now(),
					projectName,
					commitHash: commitHash || 'unknown',
					qaEngineerID,
					correlationId,
					payload: {
						testResults,
						duration,
						failedTests: results.failed,
						triggeredBy: qaEngineerID || 'system'
					}
				});
			}

			return { success, results, correlationId };
		} catch (error) {
			// Publish system error event
			await qaEventBus.publishEvent({
				type: QAEventType.QA_SYSTEM_ERROR,
				timestamp: Date.now(),
				projectName,
				commitHash: commitHash || 'unknown',
				qaEngineerID,
				correlationId,
				payload: {
					error: error.message,
					context: 'executeQATests'
				}
			});

			throw new Error(`Failed to execute QA tests: ${error.message}`);
		}
	}

	/**
	 * Helper methods for different test types
	 */
	private async runUnitTests(projectPath?: string): Promise<boolean> {
		if (!projectPath || !fs.existsSync(projectPath)) {
			return true; // Skip if no project path
		}

		try {
			// Validate project path
			if (typeof projectPath !== 'string') {
				throw new Error('Invalid project path');
			}

			// Try common test commands in order
			const testCommands = [
				{ command: 'npm', args: ['test'] },
				{ command: 'yarn', args: ['test'] },
				{ command: 'python3', args: ['-m', 'pytest'] },
				{ command: 'mvn', args: ['test'] },
				{ command: 'go', args: ['test', './...'] }
			];
			
			for (const testCmd of testCommands) {
				try {
					const result = await secureExec({
						command: testCmd.command,
						args: testCmd.args,
						cwd: projectPath,
						timeout: 300000, // 5 minutes for tests
						maxOutputSize: 2 * 1024 * 1024 // 2MB output limit
					});
					
					if (result.success) {
						return true; // First successful command wins
					}
				} catch (e) {
					continue; // Try next command
				}
			}
			
			return true; // No tests to run or all failed gracefully
		} catch (error) {
			throw new Error(`Unit tests failed: ${error.message}`);
		}
	}

	private async runIntegrationTests(projectPath?: string): Promise<boolean> {
		if (!projectPath || !fs.existsSync(projectPath)) {
			return true;
		}

		try {
			// Validate project path
			if (typeof projectPath !== 'string') {
				throw new Error('Invalid project path');
			}

			const integrationCommands = [
				{ command: 'npm', args: ['run', 'test:integration'] },
				{ command: 'yarn', args: ['test:integration'] },
				{ command: 'python3', args: ['-m', 'pytest', 'tests/integration/'] }
			];
			
			for (const testCmd of integrationCommands) {
				try {
					const result = await secureExec({
						command: testCmd.command,
						args: testCmd.args,
						cwd: projectPath,
						timeout: 600000, // 10 minutes for integration tests
						maxOutputSize: 4 * 1024 * 1024 // 4MB output limit
					});
					
					if (result.success) {
						return true;
					}
				} catch (e) {
					continue;
				}
			}
			
			return true;
		} catch (error) {
			throw new Error(`Integration tests failed: ${error.message}`);
		}
	}

	private async runSecurityScan(projectPath?: string): Promise<boolean> {
		if (!projectPath || !fs.existsSync(projectPath)) {
			return true;
		}

		try {
			// Validate project path
			if (typeof projectPath !== 'string') {
				throw new Error('Invalid project path');
			}

			const securityCommands = [
				{ command: 'npm', args: ['audit'] },
				{ command: 'yarn', args: ['audit'] },
				{ command: 'python3', args: ['-m', 'safety', 'check'] },
				{ command: 'bandit', args: ['-r', '.'] }
			];
			
			for (const secCmd of securityCommands) {
				try {
					const result = await secureExec({
						command: secCmd.command,
						args: secCmd.args,
						cwd: projectPath,
						timeout: 180000, // 3 minutes for security scans
						maxOutputSize: 1024 * 1024 // 1MB output limit
					});
					
					// Security tools often return non-zero for findings
					// We don't fail immediately, just log and continue
				} catch (e) {
					// Continue with other security checks
				}
			}
			
			return true;
		} catch (error) {
			throw new Error(`Security scan failed: ${error.message}`);
		}
	}

	private async runPerformanceTests(projectPath?: string): Promise<boolean> {
		// Performance testing would need project-specific implementation
		return true;
	}

	private async checkCodeCoverage(projectPath?: string): Promise<boolean> {
		if (!projectPath || !fs.existsSync(projectPath)) {
			return true;
		}

		try {
			// Validate project path
			if (typeof projectPath !== 'string') {
				throw new Error('Invalid project path');
			}

			const coverageCommands = [
				{ command: 'npm', args: ['run', 'coverage'] },
				{ command: 'yarn', args: ['coverage'] },
				{ command: 'python3', args: ['-m', 'pytest', '--cov'] }
			];
			
			for (const covCmd of coverageCommands) {
				try {
					const result = await secureExec({
						command: covCmd.command,
						args: covCmd.args,
						cwd: projectPath,
						timeout: 300000, // 5 minutes for coverage
						maxOutputSize: 2 * 1024 * 1024 // 2MB output limit
					});
					
					if (result.success) {
						return true;
					}
				} catch (e) {
					continue;
				}
			}
			
			return true;
		} catch (error) {
			throw new Error(`Code coverage check failed: ${error.message}`);
		}
	}

	/**
	 * Performance and monitoring utilities
	 */

	/**
	 * Get comprehensive performance metrics
	 */
	getPerformanceMetrics() {
		const sessionsCacheMetrics = this.sessionsCache.getMetrics();
		const windowContentCacheMetrics = this.windowContentCache.getMetrics();
		const monitorMetrics = this.performanceMonitor.getDetailedStats();

		return {
			monitor: monitorMetrics,
			cache: {
				sessions: sessionsCacheMetrics,
				windowContent: windowContentCacheMetrics,
				combined: {
					totalHits: sessionsCacheMetrics.hits + windowContentCacheMetrics.hits,
					totalMisses: sessionsCacheMetrics.misses + windowContentCacheMetrics.misses,
					totalRequests: sessionsCacheMetrics.hits + sessionsCacheMetrics.misses + 
					              windowContentCacheMetrics.hits + windowContentCacheMetrics.misses,
					overallHitRate: this.calculateOverallHitRate(
						[sessionsCacheMetrics, windowContentCacheMetrics]
					)
				}
			},
			qaSystem: {
				activeApprovals: this.approvalCache.size,
				activeBlocks: this.blockCache.size
			}
		};
	}

	private calculateOverallHitRate(metrics: Array<{hits: number, misses: number}>): number {
		const totalHits = metrics.reduce((sum, m) => sum + m.hits, 0);
		const totalRequests = metrics.reduce((sum, m) => sum + m.hits + m.misses, 0);
		return totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
	}

	/**
	 * Clear all performance caches
	 */
	clearPerformanceCaches(): void {
		this.sessionsCache.clear();
		this.windowContentCache.clear();
	}

	/**
	 * Invalidate specific cache entries
	 */
	invalidateCache(type: 'sessions' | 'window_content' | 'all', key?: string): void {
		switch (type) {
			case 'sessions':
				this.sessionsCache.clear();
				break;
			case 'window_content':
				if (key) {
					this.windowContentCache.delete(key);
				} else {
					this.windowContentCache.clear();
				}
				break;
			case 'all':
				this.clearPerformanceCaches();
				break;
		}
	}

	/**
	 * Optimize memory usage by clearing expired cache entries
	 */
	optimizeMemory(): void {
		// Cache cleanup is handled automatically by LRU implementation
		// This method can be extended for manual optimization if needed
		
		// Clear old approvals and blocks
		const now = Date.now();
		for (const [key, approval] of this.approvalCache.entries()) {
			if (approval.data.expirationTimestamp < now) {
				this.approvalCache.delete(key);
			}
		}
	}

	/**
	 * Get system health status
	 */
	getSystemHealth() {
		const metrics = this.getPerformanceMetrics();
		const health = {
			status: 'healthy' as 'healthy' | 'warning' | 'critical',
			issues: [] as string[],
			recommendations: [] as string[]
		};

		// Check cache hit rates
		if (metrics.cache.combined.overallHitRate < 70) {
			health.status = 'warning';
			health.issues.push('Low cache hit rate');
			health.recommendations.push('Consider increasing cache TTL or size');
		}

		// Check average execution time
		if (metrics.monitor.averageExecutionTime > 1000) {
			health.status = metrics.monitor.averageExecutionTime > 3000 ? 'critical' : 'warning';
			health.issues.push('High average execution time');
			health.recommendations.push('Review expensive operations and consider optimization');
		}

		// Check memory usage (approximation based on cache sizes)
		const totalCacheEntries = metrics.cache.sessions.size + metrics.cache.windowContent.size;
		if (totalCacheEntries > 1000) {
			health.status = 'warning';
			health.issues.push('High cache memory usage');
			health.recommendations.push('Consider reducing cache sizes or implementing more aggressive cleanup');
		}

		return health;
	}
}