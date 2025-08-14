import { spawn, SpawnOptions } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import { createHash } from 'crypto';

export interface SecureExecutionResult {
	success: boolean;
	stdout: string;
	stderr: string;
	exitCode: number;
	duration: number;
	command: string;
}

export interface SecureCommandConfig {
	command: string;
	args: string[];
	cwd?: string;
	timeout?: number;
	maxOutputSize?: number;
	allowedCommands?: string[];
	env?: Record<string, string>;
}

export class SecureCommandExecutor {
	private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
	private static readonly DEFAULT_MAX_OUTPUT = 1024 * 1024; // 1MB
	private static readonly ALLOWED_COMMANDS = new Set([
		'tmux',
		'python3',
		'python',
		'node',
		'npm',
		'yarn',
		'git',
		'gh',
		'bash',
		'sh',
		'sleep',
		'echo',
		'cat',
		'grep',
		'find',
		'ls',
		'pwd',
		'whoami',
		'chmod',
		'mkdir',
		'touch',
		'rm'
	]);

	private static readonly DANGEROUS_PATTERNS = [
		/;\s*[|&]/,          // Command chaining with pipes/background
		/\$\([^)]*\)/,       // Command substitution
		/`[^`]*`/,           // Backtick command substitution  
		/\${[^}]*}/,         // Parameter expansion
		/>[>]?\s*\/dev/,     // Device redirects
		/\|\s*\w/,           // Pipe to command
		/&&|\|\|/,           // Logical operators
		/;\s*\w/,            // Semicolon command separation
		/\\[`$()]/           // Dangerous escape sequences (backticks, dollar, parentheses) - excludes safe escapes like \", \\, \n, \t, \r
	];

	/**
	 * Validate command against security policy
	 */
	private static validateCommand(command: string, args: string[]): void {
		// Check if command is in allowlist
		const baseCommand = path.basename(command);
		if (!this.ALLOWED_COMMANDS.has(baseCommand)) {
			throw new Error(`Command '${baseCommand}' not in allowed command list`);
		}

		// Check for dangerous patterns in command and args
		const fullCommand = [command, ...args].join(' ');
		for (const pattern of this.DANGEROUS_PATTERNS) {
			if (pattern.test(fullCommand)) {
				throw new Error(`Command contains dangerous pattern: ${pattern.source}`);
			}
		}

		// Additional validation for specific commands
		if (baseCommand === 'bash' || baseCommand === 'sh') {
			// Only allow specific safe shell commands
			if (!args.includes('-c') || args.length < 2) {
				throw new Error('Shell commands must use -c flag with explicit command');
			}
		}

		if (baseCommand === 'rm') {
			// Prevent recursive deletion of critical paths
			const dangerousPaths = ['/', '/usr', '/etc', '/var', '/home', '~'];
			const rmArgs = args.join(' ');
			if (args.includes('-r') || args.includes('-rf')) {
				for (const dangerousPath of dangerousPaths) {
					if (rmArgs.includes(dangerousPath)) {
						throw new Error(`Recursive deletion of ${dangerousPath} is prohibited`);
					}
				}
			}
		}
	}

	/**
	 * Sanitize arguments to prevent injection
	 */
	private static sanitizeArgs(args: string[]): string[] {
		return args.map(arg => {
			// Remove null bytes
			arg = arg.replace(/\0/g, '');
			
			// Limit argument length
			if (arg.length > 1000) {
				throw new Error('Argument too long (max 1000 characters)');
			}
			
			return arg;
		});
	}

	/**
	 * Execute command with comprehensive security controls
	 */
	static async executeSecure(config: SecureCommandConfig): Promise<SecureExecutionResult> {
		const startTime = Date.now();
		
		try {
			// Validate and sanitize inputs
			SecureCommandExecutor.validateCommand(config.command, config.args);
			const sanitizedArgs = SecureCommandExecutor.sanitizeArgs(config.args);
			
			// Set up execution options
			const options: SpawnOptions = {
				cwd: config.cwd || process.cwd(),
				env: { 
					...process.env, 
					...(config.env || {}),
					// Remove dangerous environment variables
					LD_PRELOAD: undefined,
					PATH: process.env.PATH // Use system PATH only
				},
				stdio: ['pipe', 'pipe', 'pipe'],
				timeout: config.timeout || SecureCommandExecutor.DEFAULT_TIMEOUT,
				killSignal: 'SIGTERM'
			};

			// Execute command
			const result = await SecureCommandExecutor.spawnCommand(config.command, sanitizedArgs, options, config.maxOutputSize);
			
			return {
				success: result.exitCode === 0,
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
				duration: Date.now() - startTime,
				command: `${config.command} ${sanitizedArgs.join(' ')}`
			};
			
		} catch (error) {
			return {
				success: false,
				stdout: '',
				stderr: error.message,
				exitCode: -1,
				duration: Date.now() - startTime,
				command: `${config.command} ${config.args.join(' ')}`
			};
		}
	}

	/**
	 * Low-level command spawning with output size limits
	 */
	private static async spawnCommand(
		command: string, 
		args: string[], 
		options: SpawnOptions,
		maxOutputSize?: number
	): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		return new Promise((resolve, reject) => {
			const maxSize = maxOutputSize || SecureCommandExecutor.DEFAULT_MAX_OUTPUT;
			let stdout = '';
			let stderr = '';
			let stdoutSize = 0;
			let stderrSize = 0;
			
			const child = spawn(command, args, options);
			
			// Handle timeout
			const timeout = setTimeout(() => {
				child.kill('SIGTERM');
				// Escalate to SIGKILL if process doesn't terminate
				setTimeout(() => child.kill('SIGKILL'), 5000);
				reject(new Error(`Command timeout after ${options.timeout}ms`));
			}, options.timeout);

			child.stdout?.on('data', (data) => {
				const chunk = data.toString();
				stdoutSize += chunk.length;
				
				if (stdoutSize > maxSize) {
					child.kill('SIGTERM');
					reject(new Error(`Command output exceeded ${maxSize} bytes`));
					return;
				}
				
				stdout += chunk;
			});

			child.stderr?.on('data', (data) => {
				const chunk = data.toString();
				stderrSize += chunk.length;
				
				if (stderrSize > maxSize) {
					child.kill('SIGTERM');
					reject(new Error(`Command error output exceeded ${maxSize} bytes`));
					return;
				}
				
				stderr += chunk;
			});

			child.on('close', (code) => {
				clearTimeout(timeout);
				resolve({
					exitCode: code || 0,
					stdout: stdout.trim(),
					stderr: stderr.trim()
				});
			});

			child.on('error', (error) => {
				clearTimeout(timeout);
				reject(error);
			});
		});
	}

	/**
	 * Execute tmux command with specific validation
	 */
	static async executeTmux(action: string, args: string[] = [], options?: Partial<SecureCommandConfig>): Promise<SecureExecutionResult> {
		const tmuxArgs = [action, ...args];
		
		// Additional tmux-specific validation
		const allowedTmuxActions = [
			'list-sessions', 'list-windows', 'list-panes', 
			'capture-pane', 'send-keys', 'display-message',
			'new-session', 'new-window', 'rename-window',
			'kill-session', 'kill-window'
		];
		
		if (!allowedTmuxActions.includes(action)) {
			throw new Error(`Tmux action '${action}' not allowed`);
		}

		return SecureCommandExecutor.executeSecure({
			command: 'tmux',
			args: tmuxArgs,
			timeout: 10000, // 10 seconds for tmux commands
			maxOutputSize: 512 * 1024, // 512KB for tmux output
			...options
		});
	}

	/**
	 * Execute git command with specific validation
	 */
	static async executeGit(action: string, args: string[] = [], options?: Partial<SecureCommandConfig>): Promise<SecureExecutionResult> {
		const gitArgs = [action, ...args];
		
		// Additional git-specific validation
		const allowedGitActions = [
			'status', 'diff', 'log', 'add', 'commit', 'push', 'pull',
			'checkout', 'branch', 'remote', 'config', 'clean'
		];
		
		if (!allowedGitActions.includes(action)) {
			throw new Error(`Git action '${action}' not allowed`);
		}

		// Prevent dangerous git operations
		if (action === 'clean' && args.includes('-fd')) {
			throw new Error('Forced directory cleanup not allowed');
		}

		return SecureCommandExecutor.executeSecure({
			command: 'git',
			args: gitArgs,
			timeout: 30000, // 30 seconds for git commands
			...options
		});
	}

	/**
	 * Generate command execution audit hash
	 */
	static generateAuditHash(command: string, args: string[], cwd?: string): string {
		const data = `${command}:${args.join(':')}:${cwd || process.cwd()}:${Date.now()}`;
		return createHash('sha256').update(data).digest('hex').substring(0, 16);
	}
}

/**
 * Convenience functions for common operations
 */
export const secureExec = SecureCommandExecutor.executeSecure;
export const secureTmux = SecureCommandExecutor.executeTmux;
export const secureGit = SecureCommandExecutor.executeGit;