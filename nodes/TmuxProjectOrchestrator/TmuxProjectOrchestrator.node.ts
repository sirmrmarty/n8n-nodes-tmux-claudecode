import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { secureTmux, secureExec } from '../../utils/secureExecution';
import { TmuxBridge, TmuxBridgeConfig } from '../../utils/tmuxBridge';
import { PathResolver } from '../../utils/paths';
import * as fs from 'fs';
import * as path from 'path';

export class TmuxProjectOrchestrator implements INodeType {
	private pathResolver: PathResolver = new PathResolver();
	private static staticPathResolver: PathResolver = new PathResolver();

	description: INodeTypeDescription = {
		displayName: 'Tmux Project Orchestrator',
		name: 'tmuxProjectOrchestrator',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Unified project management with mandatory QA validation',
		defaults: {
			name: 'Tmux Project Orchestrator',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'tmuxOrchestratorApi',
				required: false,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Create Project',
						value: 'createProject',
						description: 'Initialize project from idea with AI planning',
					},
					{
						name: 'Approve Plan',
						value: 'approvePlan',
						description: 'Approve and start executing project plan',
					},
					{
						name: 'Get Status',
						value: 'getStatus',
						description: 'Get comprehensive project status with QA metrics',
					},
					{
						name: 'Generate Report',
						value: 'generateReport',
						description: 'Generate detailed project report with quality metrics',
					},
					{
						name: 'Schedule Task',
						value: 'scheduleTask',
						description: 'Schedule new task with QA requirements',
					},
					{
						name: 'Manage Team',
						value: 'manageTeam',
						description: 'Add/remove team members (QA always required)',
					},
					{
						name: 'Run QA Tests',
						value: 'runQATests',
						description: 'Execute comprehensive QA test suite',
					},
					{
						name: 'Approve for Commit',
						value: 'approveCommit',
						description: 'QA approval to enable git commits',
					},
					{
						name: 'Block Commit',
						value: 'blockCommit',
						description: 'Block git commits with QA feedback',
					},
				],
				default: 'createProject',
			},
			// Create Project parameters
			{
				displayName: 'Project Idea',
				name: 'projectIdea',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['createProject'],
					},
				},
				description: 'Describe your project idea - AI will generate a comprehensive plan',
			},
			{
				displayName: 'Project Name',
				name: 'projectName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['createProject'],
					},
				},
				description: 'Name for the project',
			},
			{
				displayName: 'Project Path',
				name: 'projectPath',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['createProject'],
					},
				},
				description: 'Path to the project directory',
			},
			{
				displayName: 'Quality Requirements',
				name: 'qualityRequirements',
				type: 'options',
				options: [
					{
						name: 'Standard (Unit + Integration Tests)',
						value: 'standard',
					},
					{
						name: 'High (+ Security + Performance)',
						value: 'high',
					},
					{
						name: 'Critical (+ All Tests + Manual QA)',
						value: 'critical',
					},
				],
				default: 'standard',
				displayOptions: {
					show: {
						operation: ['createProject'],
					},
				},
				description: 'Quality validation level required',
			},
			// Approve Plan parameters
			{
				displayName: 'Session Name',
				name: 'sessionName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['approvePlan', 'getStatus', 'generateReport', 'scheduleTask', 'manageTeam', 'runQATests', 'approveCommit', 'blockCommit'],
					},
				},
				description: 'Project session name',
			},
			{
				displayName: 'Plan Modifications',
				name: 'planModifications',
				type: 'string',
				typeOptions: {
					rows: 5,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['approvePlan'],
					},
				},
				description: 'Any modifications to the generated plan (optional)',
			},
			// Schedule Task parameters
			{
				displayName: 'Task Description',
				name: 'taskDescription',
				type: 'string',
				typeOptions: {
					rows: 5,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['scheduleTask'],
					},
				},
				description: 'Description of the task to schedule',
			},
			{
				displayName: 'Requires QA Testing',
				name: 'requiresQA',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['scheduleTask'],
					},
				},
				description: 'Whether this task requires QA validation before commit',
			},
			{
				displayName: 'Target Agent',
				name: 'targetAgent',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['scheduleTask'],
					},
				},
				description: 'Specific agent to assign task to (optional)',
			},
			// Manage Team parameters
			{
				displayName: 'Team Action',
				name: 'teamAction',
				type: 'options',
				options: [
					{
						name: 'Add Member',
						value: 'add',
					},
					{
						name: 'Remove Member',
						value: 'remove',
					},
					{
						name: 'List Team',
						value: 'list',
					},
					{
						name: 'Daily Standup',
						value: 'standup',
					},
				],
				default: 'add',
				displayOptions: {
					show: {
						operation: ['manageTeam'],
					},
				},
				description: 'Team management action to perform',
			},
			{
				displayName: 'Member Role',
				name: 'memberRole',
				type: 'options',
				options: [
					{
						name: 'Developer',
						value: 'developer',
					},
					{
						name: 'Senior Developer',
						value: 'seniorDeveloper',
					},
					{
						name: 'DevOps Engineer',
						value: 'devops',
					},
					{
						name: 'Security Engineer',
						value: 'security',
					},
					{
						name: 'Performance Engineer',
						value: 'performance',
					},
				],
				default: 'developer',
				displayOptions: {
					show: {
						operation: ['manageTeam'],
						teamAction: ['add'],
					},
				},
				description: 'Role for the new team member (QA Engineer always present)',
			},
			{
				displayName: 'Window/Agent Index',
				name: 'windowIndex',
				type: 'number',
				default: 1,
				displayOptions: {
					show: {
						operation: ['manageTeam'],
						teamAction: ['remove'],
					},
				},
				description: 'Window index of agent to remove (cannot remove PM or QA)',
			},
			// QA Testing parameters
			{
				displayName: 'Test Types',
				name: 'testTypes',
				type: 'multiOptions',
				options: [
					{
						name: 'Unit Tests',
						value: 'unit',
					},
					{
						name: 'Integration Tests',
						value: 'integration',
					},
					{
						name: 'Security Scan',
						value: 'security',
					},
					{
						name: 'Performance Tests',
						value: 'performance',
					},
					{
						name: 'Manual Testing',
						value: 'manual',
					},
					{
						name: 'Code Coverage',
						value: 'coverage',
					},
				],
				default: ['unit', 'integration'],
				displayOptions: {
					show: {
						operation: ['runQATests'],
					},
				},
				description: 'Types of tests to run',
			},
			// Commit Approval parameters
			{
				displayName: 'Commit Message',
				name: 'commitMessage',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['approveCommit', 'blockCommit'],
					},
				},
				description: 'Git commit message to approve/block',
			},
			{
				displayName: 'QA Feedback',
				name: 'qaFeedback',
				type: 'string',
				typeOptions: {
					rows: 5,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['approveCommit', 'blockCommit'],
					},
				},
				description: 'QA feedback for the commit',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;
		
		// Get credentials if available
		let bridgeConfig: TmuxBridgeConfig = {};
		try {
			const credentials = await this.getCredentials('tmuxOrchestratorApi');
			if (credentials?.useExternalScripts && credentials?.scriptsDirectory) {
				bridgeConfig.externalScriptsDir = credentials.scriptsDirectory as string;
			}
			if (credentials?.projectBasePath) {
				bridgeConfig.projectBasePath = credentials.projectBasePath as string;
			}
		} catch {
			// Credentials not configured, use defaults
		}
		
		const bridge = new TmuxBridge(bridgeConfig);

		for (let i = 0; i < items.length; i++) {
			try {
				let result: any = {};

				switch (operation) {
					case 'createProject':
						result = await TmuxProjectOrchestrator.handleCreateProject(this, i, bridge);
						break;
					case 'approvePlan':
						result = await TmuxProjectOrchestrator.handleApprovePlan(this, i, bridge);
						break;
					case 'getStatus':
						result = await TmuxProjectOrchestrator.handleGetStatus(this, i, bridge);
						break;
					case 'generateReport':
						result = await TmuxProjectOrchestrator.handleGenerateReport(this, i, bridge);
						break;
					case 'scheduleTask':
						result = await TmuxProjectOrchestrator.handleScheduleTask(this, i, bridge);
						break;
					case 'manageTeam':
						result = await TmuxProjectOrchestrator.handleManageTeam(this, i, bridge);
						break;
					case 'runQATests':
						result = await TmuxProjectOrchestrator.handleRunQATests(this, i, bridge);
						break;
					case 'approveCommit':
						result = await TmuxProjectOrchestrator.handleApproveCommit(this, i, bridge);
						break;
					case 'blockCommit':
						result = await TmuxProjectOrchestrator.handleBlockCommit(this, i, bridge);
						break;
				}

				returnData.push({
					json: result,
					pairedItem: i,
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
						pairedItem: i,
					});
				} else {
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex: i,
					});
				}
			}
		}

		return [returnData];
	}

	static async handleCreateProject(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectIdea = context.getNodeParameter('projectIdea', itemIndex) as string;
		const projectName = context.getNodeParameter('projectName', itemIndex) as string;
		const projectPath = context.getNodeParameter('projectPath', itemIndex, '') as string;
		const qualityRequirements = context.getNodeParameter('qualityRequirements', itemIndex) as string;

		try {
			// Define windows with mandatory QA engineer
			const windows = TmuxProjectOrchestrator.getQAIntegratedWindows(qualityRequirements);
			
			// Create the session with windows
			await bridge.createSession(projectName, projectPath, windows);

			// Deploy Project Manager with QA-aware briefing
			// Validate projectName to prevent injection
			if (!projectName || typeof projectName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(projectName)) {
				throw new Error('Invalid project name - must contain only letters, numbers, underscores, and hyphens');
			}
			const pmResult = await secureTmux('send-keys', ['-t', `${projectName}:0`, 'claude', 'Enter']);
			if (!pmResult.success) {
				throw new Error(`Failed to deploy Project Manager: ${pmResult.stderr}`);
			}
			await new Promise(resolve => setTimeout(resolve, 5000));

			// Generate intelligent project plan using AI
			const aiPrompt = TmuxProjectOrchestrator.generateAIProjectPrompt(projectIdea, qualityRequirements);
			await bridge.sendClaudeMessage(`${projectName}:0`, aiPrompt);

			// Wait for AI to generate plan
			await new Promise(resolve => setTimeout(resolve, 10000));

			// Capture the generated plan
			const generatedPlan = await bridge.captureWindowContent(projectName, 0, 200);

			// Deploy QA Engineer (mandatory)
			// projectName already validated above
			const qaResult = await secureTmux('send-keys', ['-t', `${projectName}:1`, 'claude', 'Enter']);
			if (!qaResult.success) {
				throw new Error(`Failed to deploy QA Engineer: ${qaResult.stderr}`);
			}
			await new Promise(resolve => setTimeout(resolve, 5000));

			const qaBriefing = TmuxProjectOrchestrator.getQAEngineerBriefing(qualityRequirements);
			await bridge.sendClaudeMessage(`${projectName}:1`, qaBriefing);

			// Initialize agent shells with proper command handling
			await TmuxProjectOrchestrator.initializeAgentShells(projectName, windows, bridge);

			// Set up git hooks for QA validation
			await TmuxProjectOrchestrator.setupQAGitHooks(projectPath, projectName);

			// Safely process the generated plan with type checking
			let planSummary: string;
			try {
				if (typeof generatedPlan === 'string' && generatedPlan.length > 0) {
					// Extract last 50 lines as summary
					planSummary = generatedPlan.split('\n').slice(-50).join('\n');
				} else if (generatedPlan) {
					// Handle non-string content (should be rare after bridge fix)
					planSummary = `Plan generated but in unexpected format: ${typeof generatedPlan}`;
				} else {
					planSummary = 'Plan generation completed but no content captured. Check Project Manager window for details.';
				}
			} catch (error) {
				planSummary = `Error processing generated plan: ${error.message}. Raw plan available in Project Manager window.`;
			}

			// Create project state file
			const projectState = {
				name: projectName,
				path: projectPath,
				qualityRequirements,
				created: new Date().toISOString(),
				status: 'planning',
				plan: generatedPlan || 'Plan generation in progress',
				qaApprovalRequired: true,
				commitBlocked: true,
			};

			const stateFile = TmuxProjectOrchestrator.safeTempFileWrite(projectName, 'state.json', JSON.stringify(projectState, null, 2));

			return {
				success: true,
				projectName,
				projectPath,
				sessionCreated: projectName,
				windows,
				qualityRequirements,
				generatedPlan: planSummary,
				status: 'Plan generated - awaiting approval',
				nextStep: 'Review the generated plan and use "Approve Plan" operation to proceed',
				qaIntegrated: true,
				stateFile,
				message: `Project ${projectName} created with QA integration. Plan generated and ready for approval.`,
			};
		} catch (error) {
			throw new Error(`Failed to create project: ${error.message}`);
		}
	}

	static async handleApprovePlan(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const sessionName = context.getNodeParameter('sessionName', itemIndex) as string;
		const planModifications = context.getNodeParameter('planModifications', itemIndex, '') as string;

		try {
			// Load project state
			const stateFile = `/tmp/${sessionName}_state.json`;
			if (!fs.existsSync(stateFile)) {
				throw new Error('Project state not found. Create project first.');
			}

			const projectState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

			// Send plan approval to PM
			let approvalMessage = `PLAN APPROVED: Begin project execution immediately.

Quality Requirements: ${projectState.qualityRequirements}
QA Integration: All commits require QA approval before git operations.`;

			if (planModifications.trim()) {
				approvalMessage += `\n\nPLAN MODIFICATIONS:\n${planModifications}`;
			}

			approvalMessage += `\n\nIMPORTANT QA WORKFLOW:
1. All code changes must be reviewed by QA Engineer (Window 1)
2. No git commits allowed without QA approval
3. QA runs automated tests + manual validation
4. QA provides approve/reject decision with feedback

Begin coordinating with your QA Engineer for the development workflow.`;

			await bridge.sendClaudeMessage(`${sessionName}:0`, approvalMessage);

			// Notify QA Engineer
			await bridge.sendClaudeMessage(`${sessionName}:1`, 
				`PROJECT PLAN APPROVED: Development starting now.
				
Your role: Validate ALL code changes before git commits.
Quality Level: ${projectState.qualityRequirements}
Process: Monitor development, run tests, provide approval/rejection.

Stay alert for development completion notifications.`);

			// Update project state
			projectState.status = 'active';
			projectState.approved = new Date().toISOString();
			projectState.modifications = planModifications;
			fs.writeFileSync(stateFile, JSON.stringify(projectState, null, 2));

			return {
				success: true,
				projectName: sessionName,
				status: 'active',
				planApproved: true,
				modifications: planModifications || 'None',
				qaWorkflowActive: true,
				message: `Plan approved. Project ${sessionName} is now active with mandatory QA validation.`,
				nextSteps: [
					'Monitor progress with "Get Status" operation',
					'QA Engineer will validate all commits',
					'Use "Schedule Task" to add new tasks',
				],
			};
		} catch (error) {
			throw new Error(`Failed to approve plan: ${error.message}`);
		}
	}

	private static getQAIntegratedWindows(qualityLevel: string): string[] {
		// Always include PM and QA Engineer
		const baseWindows = ['Project-Manager', 'QA-Engineer'];
		
		switch (qualityLevel) {
			case 'standard':
				return [...baseWindows, 'Developer'];
			case 'high':
				return [...baseWindows, 'Senior-Developer', 'Security-Engineer'];
			case 'critical':
				return [...baseWindows, 'Tech-Lead', 'Senior-Developer', 'Security-Engineer', 'Performance-Engineer'];
			default:
				return baseWindows;
		}
	}

	private static generateAIProjectPrompt(projectIdea: string, qualityLevel: string): string {
		return `You are an expert Project Manager. Generate a comprehensive project plan for:

PROJECT IDEA:
${projectIdea}

REQUIREMENTS:
- Quality Level: ${qualityLevel}
- QA Integration: Mandatory testing before all commits
- Team Coordination: Multi-agent collaboration required

Generate a detailed plan including:
1. **Project Overview & Objectives**
2. **Technical Architecture & Approach**
3. **Development Phases with QA Gates**
4. **Quality Assurance Strategy**
5. **Risk Assessment & Mitigation**
6. **Success Criteria & Deliverables**
7. **Timeline with QA Validation Points**

Focus on:
- Clear deliverables and success metrics
- QA validation requirements at each phase
- Risk identification and mitigation strategies
- Specific testing and quality requirements
- Team coordination and communication plan

Provide a actionable, comprehensive plan that can be executed immediately upon approval.`;
	}

	private static getQAEngineerBriefing(qualityLevel: string): string {
		const testRequirements = {
			standard: 'Unit tests, Integration tests, Basic security checks',
			high: 'Unit + Integration + Security scans + Performance testing',
			critical: 'Comprehensive testing suite + Manual QA + Security audits + Performance validation',
		};

		return `You are the QA Engineer for this project. Your responsibilities are CRITICAL:

QUALITY LEVEL: ${qualityLevel}
TEST REQUIREMENTS: ${testRequirements[qualityLevel] || testRequirements.standard}

🚨 MANDATORY QA WORKFLOW:
1. **Pre-Commit Validation**: ALL code changes require your approval
2. **Git Blocking**: Commits are blocked until you provide sign-off
3. **Test Execution**: Run automated test suites for every change
4. **Manual Testing**: Perform exploratory testing as needed
5. **Quality Gates**: Enforce quality thresholds and standards

TESTING RESPONSIBILITIES:
- Monitor all development activity
- Run test suites when developers complete features
- Validate security, performance, and functionality
- Provide clear approve/reject decisions with feedback
- Block commits that don't meet quality standards

COMMUNICATION:
- Respond promptly to testing requests
- Provide detailed feedback on failures
- Coordinate with PM on quality metrics
- Report quality issues and recommendations

Remember: YOU are the gatekeeper for code quality. No compromises on quality standards.`;
	}

	private static async initializeAgentShells(projectName: string, windows: string[], bridge: TmuxBridge): Promise<void> {
		try {
			// Source the agent aliases script in each window
			const aliasesPath = path.resolve(__dirname, '../../utils/agent_aliases.sh');
			
			for (let i = 0; i < windows.length; i++) {
				const windowName = windows[i];
				
				// Wait a bit for window to be ready
				await new Promise(resolve => setTimeout(resolve, 2000));
				
				// Source the aliases script
				await bridge.sendCommandToWindow(projectName, i, `source "${aliasesPath}"`);
				
				// Set appropriate AGENT_ROLE environment variable
				let role = 'developer';
				if (windowName.toLowerCase().includes('project') || windowName.toLowerCase().includes('manager') || i === 0) {
					role = 'project-manager';
				} else if (windowName.toLowerCase().includes('qa') || windowName.toLowerCase().includes('test') || i === 1) {
					role = 'qa-engineer';
				}
				
				await bridge.sendCommandToWindow(projectName, i, `export AGENT_ROLE="${role}"`);
				
				// Update PS1 to show role
				await bridge.sendCommandToWindow(projectName, i, `export PS1="[${role}] \\u@\\h:\\w\\$ "`);
				
				// Clear screen and show welcome message
				await bridge.sendCommandToWindow(projectName, i, 'clear');
				await bridge.sendCommandToWindow(projectName, i, `echo "Agent shell initialized as: ${role}"`);
				await bridge.sendCommandToWindow(projectName, i, 'echo "Available commands: STATUS, PROGRESS [%], BLOCKERS [description]"');
			}
		} catch (error) {
			console.warn('Failed to initialize agent shells:', error.message);
			// Continue anyway - this is not a critical failure
		}
	}

	private static async setupQAGitHooks(projectPath: string, projectName: string): Promise<void> {
		if (!projectPath || !fs.existsSync(projectPath)) {
			return; // Skip if no valid project path
		}

		// Security: Validate project name to prevent injection attacks
		if (!TmuxProjectOrchestrator.validateProjectName(projectName)) {
			throw new Error('Invalid project name: contains dangerous characters');
		}

		try {
			// Security: Validate project path using PathResolver
			const resolvedProjectPath = path.resolve(projectPath);
			if (!TmuxProjectOrchestrator.validateProjectPath(resolvedProjectPath)) {
				throw new Error('Invalid project path: directory traversal detected');
			}

			// Security: Use PathResolver to safely construct git hooks directory path
			const gitHooksDir = TmuxProjectOrchestrator.staticPathResolver.validateAndResolvePath(resolvedProjectPath, '.git/hooks');
			
			if (!fs.existsSync(gitHooksDir)) {
				return; // Not a git repository or hooks directory doesn't exist
			}

			// Security: Additional validation that gitHooksDir is within project bounds
			if (!TmuxProjectOrchestrator.staticPathResolver.isPathSafe(gitHooksDir, resolvedProjectPath)) {
				throw new Error('Git hooks directory path traversal detected');
			}

			const preCommitHook = `#!/bin/bash
# QA Validation Pre-commit Hook
# Generated by TmuxProjectOrchestrator

PROJECT_NAME="${projectName}"
QA_APPROVAL_FILE="/tmp/\${PROJECT_NAME}_qa_approval.flag"

echo "🔍 QA Validation Required - Checking approval status..."

if [ ! -f "\$QA_APPROVAL_FILE" ]; then
    echo "❌ COMMIT BLOCKED: QA approval required"
    echo "   Request QA validation using 'Run QA Tests' operation"
    echo "   QA Engineer must approve using 'Approve for Commit' operation"
    exit 1
fi

echo "✅ QA Approved - Commit allowed"
rm "\$QA_APPROVAL_FILE"  # Remove approval flag after use
exit 0`;

			// Security: Use PathResolver to safely construct pre-commit hook path
			const preCommitPath = TmuxProjectOrchestrator.staticPathResolver.validateAndResolvePath(gitHooksDir, 'pre-commit');
			
			// Security: Final validation that pre-commit path is within git hooks directory
			if (!TmuxProjectOrchestrator.staticPathResolver.isPathSafe(preCommitPath, gitHooksDir)) {
				throw new Error('Pre-commit hook path traversal detected');
			}

			// Security: Validate file doesn't already exist with dangerous content
			if (fs.existsSync(preCommitPath)) {
				const stats = fs.statSync(preCommitPath);
				if (!stats.isFile()) {
					throw new Error('Pre-commit hook path exists but is not a regular file');
				}
			}

			// Write the hook file with secure permissions
			fs.writeFileSync(preCommitPath, preCommitHook, { mode: 0o755 });
			
			// Security: Verify the written file path is still safe
			const writtenStats = fs.statSync(preCommitPath);
			if (!writtenStats.isFile()) {
				throw new Error('Written pre-commit hook is not a regular file');
			}

			// Securely set executable permissions using validated path
			const chmodResult = await secureExec({
				command: 'chmod',
				args: ['+x', preCommitPath],
				timeout: 5000
			});
			if (!chmodResult.success) {
				throw new Error(`Failed to set executable permissions: ${chmodResult.stderr}`);
			}

		} catch (error) {
			// Git hooks setup failed, but don't fail the whole operation
			console.warn('Failed to setup git hooks:', error.message);
		}
	}

	/**
	 * Validate project name to prevent injection attacks
	 * @param projectName - Project name to validate
	 * @returns true if project name is safe
	 */
	private static validateProjectName(projectName: string): boolean {
		if (!projectName || typeof projectName !== 'string') {
			return false;
		}
		
		// Check for dangerous characters and patterns
		const dangerousPatterns = [
			/[\r\n]/,           // Line breaks
			/[;&|`$()]/,        // Shell metacharacters
			/\.\.[\/\\]/,       // Directory traversal
			/[\0]/,             // Null bytes
			/[<>:"|?*]/,        // Invalid filename characters
			/^[\s]*$/,          // Only whitespace
		];
		
		for (const pattern of dangerousPatterns) {
			if (pattern.test(projectName)) {
				return false;
			}
		}
		
		// Check length limits
		if (projectName.length > 255) {
			return false;
		}
		
		return true;
	}

	/**
	 * Validate project path to ensure it's within allowed boundaries
	 * @param projectPath - Project path to validate
	 * @returns true if path is safe
	 */
	private static validateProjectPath(projectPath: string): boolean {
		if (!projectPath || typeof projectPath !== 'string') {
			return false;
		}
		
		try {
			// Get base project path from configuration
			const basePath = TmuxProjectOrchestrator.staticPathResolver.getProjectBasePath();
			const resolvedBasePath = path.resolve(basePath);
			
			// Validate that project path is within allowed base directory
			return TmuxProjectOrchestrator.staticPathResolver.isPathSafe(projectPath, resolvedBasePath);
		} catch {
			return false;
		}
	}

	/**
	 * Create a safe temporary file path with validation
	 * @param sessionName - Session name to use in filename
	 * @param suffix - File suffix/extension
	 * @returns Safe temporary file path
	 */
	private static createSafeTempPath(sessionName: string, suffix: string): string {
		if (!TmuxProjectOrchestrator.validateProjectName(sessionName)) {
			throw new Error('Invalid session name for temp file');
		}
		
		if (!suffix || typeof suffix !== 'string' || suffix.length > 50) {
			throw new Error('Invalid file suffix');
		}
		
		// Sanitize suffix to prevent path traversal
		const safeSuffix = suffix.replace(/[^a-zA-Z0-9._-]/g, '_');
		
		// Create safe filename with session name
		const safeSessionName = sessionName.replace(/[^a-zA-Z0-9._-]/g, '_');
		const filename = `${safeSessionName}_${safeSuffix}`;
		
		// Use system temp directory with validation
		const tempDir = '/tmp';
		const tempPath = path.join(tempDir, filename);
		
		// Final validation that path is safe
		if (!TmuxProjectOrchestrator.staticPathResolver.isPathSafe(tempPath, tempDir)) {
			throw new Error('Temp file path validation failed');
		}
		
		return tempPath;
	}

	/**
	 * Safely write to a temporary file with validation
	 * @param sessionName - Session name for file
	 * @param suffix - File suffix
	 * @param data - Data to write
	 * @returns Path to written file
	 */
	private static safeTempFileWrite(sessionName: string, suffix: string, data: string): string {
		const safePath = TmuxProjectOrchestrator.createSafeTempPath(sessionName, suffix);
		
		// Write with secure permissions
		fs.writeFileSync(safePath, data, { mode: 0o644 });
		
		return safePath;
	}

	/**
	 * Safely read from a temporary file with validation
	 * @param sessionName - Session name for file
	 * @param suffix - File suffix
	 * @returns File content or null if doesn't exist
	 */
	private safeTempFileRead(sessionName: string, suffix: string): string | null {
		const safePath = TmuxProjectOrchestrator.createSafeTempPath(sessionName, suffix);
		
		if (!fs.existsSync(safePath)) {
			return null;
		}
		
		// Verify it's a regular file
		const stats = fs.statSync(safePath);
		if (!stats.isFile()) {
			throw new Error('Temp path exists but is not a regular file');
		}
		
		return fs.readFileSync(safePath, 'utf8');
	}

	// Additional methods for other operations will be implemented
	static async handleGetStatus(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const sessionName = context.getNodeParameter('sessionName', itemIndex) as string;
		
		try {
			const stateFile = `/tmp/${sessionName}_state.json`;
			const projectState = fs.existsSync(stateFile) 
				? JSON.parse(fs.readFileSync(stateFile, 'utf8'))
				: { name: sessionName, status: 'unknown' };

			// Get session details
			const sessions = await bridge.getTmuxSessions();
			const session = sessions.find(s => s.name === sessionName);
			
			if (!session) {
				throw new Error(`Session ${sessionName} not found`);
			}

			// Check QA approval status
			const qaApprovalFile = `/tmp/${sessionName}_qa_approval.flag`;
			const qaApproved = fs.existsSync(qaApprovalFile);

			// Request status from all team members
			const statusRequests = session.windows.map(async (window, index) => {
				await bridge.sendClaudeMessage(
					`${sessionName}:${window.windowIndex}`,
					'STATUS REQUEST: Provide current work status, progress, and any blockers.'
				);
			});

			await Promise.all(statusRequests);
			await new Promise(resolve => setTimeout(resolve, 5000));

			// Collect responses
			const teamStatus = [];
			for (const window of session.windows) {
				const output = await bridge.captureWindowContent(sessionName, window.windowIndex, 50);
				
				// Safely process the captured output with type checking
				let statusText: string;
				try {
					if (typeof output === 'string' && output.length > 0) {
						statusText = output.split('\n').slice(-20).join('\n');
					} else {
						statusText = output ? `Status data in unexpected format: ${typeof output}` : 'No status available';
					}
				} catch (error) {
					statusText = `Error processing status: ${error.message}`;
				}
				
				teamStatus.push({
					window: window.windowName,
					index: window.windowIndex,
					role: TmuxProjectOrchestrator.identifyAgentRole(window.windowName),
					status: statusText,
					active: window.active,
				});
			}

			return {
				success: true,
				projectName: sessionName,
				projectStatus: projectState.status || 'active',
				qaApprovalStatus: qaApproved ? 'approved' : 'pending',
				commitBlocked: !qaApproved,
				qualityLevel: projectState.qualityRequirements || 'unknown',
				teamCount: session.windows.length,
				teamStatus,
				lastUpdated: new Date().toISOString(),
				recommendations: TmuxProjectOrchestrator.generateStatusRecommendations(teamStatus, qaApproved),
			};
		} catch (error) {
			throw new Error(`Failed to get status: ${error.message}`);
		}
	}

	static async handleGenerateReport(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const sessionName = context.getNodeParameter('sessionName', itemIndex) as string;

		try {
			const stateFile = `/tmp/${sessionName}_state.json`;
			const projectState = fs.existsSync(stateFile) 
				? JSON.parse(fs.readFileSync(stateFile, 'utf8'))
				: { name: sessionName };

			// Get comprehensive session data
			const sessions = await bridge.getTmuxSessions();
			const session = sessions.find(s => s.name === sessionName);
			
			if (!session) {
				throw new Error(`Session ${sessionName} not found`);
			}

			// Collect detailed activity from all windows
			const detailedActivities = [];
			for (const window of session.windows) {
				const content = await bridge.captureWindowContent(sessionName, window.windowIndex, 200);
				
				// Safely process the captured content with type checking
				let lines: string[] = [];
				let lastActivity = 'No activity captured';
				
				try {
					if (typeof content === 'string' && content.length > 0) {
						lines = content.split('\n');
						lastActivity = lines.slice(-10).join('\n');
					} else if (content) {
						lines = []; // Empty array for non-string content
						lastActivity = `Activity data in unexpected format: ${typeof content}`;
					}
				} catch (error) {
					lines = [];
					lastActivity = `Error processing activity: ${error.message}`;
				}
				
				// Analyze activity patterns (safely)
				const commandCount = lines.filter(l => l.startsWith('$') || l.startsWith('>')).length;
				const errorCount = lines.filter(l => /error|exception|failed/i.test(l)).length;
				const testResults = TmuxProjectOrchestrator.extractTestResults(lines);
				const commitActivity = TmuxProjectOrchestrator.extractGitActivity(lines);

				detailedActivities.push({
					agent: window.windowName,
					role: TmuxProjectOrchestrator.identifyAgentRole(window.windowName),
					index: window.windowIndex,
					commandsExecuted: commandCount,
					errorsDetected: errorCount,
					testResults,
					gitActivity: commitActivity,
					lastActivity,
					productivity: TmuxProjectOrchestrator.calculateProductivity(lines),
				});
			}

			// Check QA metrics
			const qaApprovalFile = `/tmp/${sessionName}_qa_approval.flag`;
			const qaBlockFile = `/tmp/${sessionName}_qa_block.json`;
			const qaStatus = fs.existsSync(qaApprovalFile) ? 'approved' : 
						   fs.existsSync(qaBlockFile) ? 'blocked' : 'pending';

			// Calculate overall metrics
			const totalCommands = detailedActivities.reduce((sum, a) => sum + a.commandsExecuted, 0);
			const totalErrors = detailedActivities.reduce((sum, a) => sum + a.errorsDetected, 0);
			const avgProductivity = detailedActivities.reduce((sum, a) => sum + a.productivity, 0) / detailedActivities.length;

			// Generate recommendations
			const recommendations = TmuxProjectOrchestrator.generateProjectRecommendations(detailedActivities, qaStatus, projectState);

			const report = {
				success: true,
				projectName: sessionName,
				reportType: 'Comprehensive Project Report',
				generatedAt: new Date().toISOString(),
				projectOverview: {
					status: projectState.status || 'active',
					qualityLevel: projectState.qualityRequirements || 'unknown',
					created: projectState.created,
					teamSize: session.windows.length,
				},
				qualityMetrics: {
					qaStatus,
					commitsBlocked: !fs.existsSync(qaApprovalFile),
					qualityGatesActive: true,
					lastQAAction: TmuxProjectOrchestrator.getLastQAAction(sessionName),
				},
				teamPerformance: {
					totalCommands,
					totalErrors,
					averageProductivity: Math.round(avgProductivity * 100) / 100,
					errorRate: totalCommands > 0 ? Math.round((totalErrors / totalCommands) * 100 * 100) / 100 : 0,
				},
				agentDetails: detailedActivities,
				recommendations,
				riskAssessment: TmuxProjectOrchestrator.assessProjectRisks(detailedActivities, qaStatus),
			};

			// Save report to file
			const reportFile = `/tmp/${sessionName}_report_${Date.now()}.json`;
			fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

			return {
				...report,
				reportSavedTo: reportFile,
			};
		} catch (error) {
			throw new Error(`Failed to generate report: ${error.message}`);
		}
	}

	static async handleScheduleTask(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const sessionName = context.getNodeParameter('sessionName', itemIndex) as string;
		const taskDescription = context.getNodeParameter('taskDescription', itemIndex) as string;
		const requiresQA = context.getNodeParameter('requiresQA', itemIndex) as boolean;
		const targetAgent = context.getNodeParameter('targetAgent', itemIndex, '') as string;

		try {
			const taskId = `TASK-${Date.now()}`;
			const taskPriority = TmuxProjectOrchestrator.assessTaskPriority(taskDescription);
			
			// Create task with QA requirements
			const taskMessage = `
🎯 NEW TASK ${taskId}
Priority: ${taskPriority}
QA Required: ${requiresQA ? 'YES - Must pass QA validation before commit' : 'NO'}
Target: ${targetAgent || 'Next available team member'}

OBJECTIVE: ${taskDescription}

${requiresQA ? `
🚨 QA WORKFLOW REQUIRED:
1. Complete implementation
2. Request QA validation using "Run QA Tests"
3. Wait for QA approval before git commit
4. Address any QA feedback if rejected
` : ''}

SUCCESS CRITERIA:
- Implementation complete and tested
${requiresQA ? '- QA approval obtained' : ''}
- Documentation updated
- Code committed (if applicable)

Please acknowledge receipt and provide ETA.`;

			// Send to Project Manager first
			await bridge.sendClaudeMessage(`${sessionName}:0`, 
				`TASK DELEGATION REQUEST:\n${taskMessage}\n\nPlease assign this task to appropriate team member and coordinate execution.`);

			// Send to specific target if specified
			if (targetAgent) {
				try {
					const sessions = await bridge.getTmuxSessions();
					const session = sessions.find(s => s.name === sessionName);
					if (session) {
						const targetWindow = session.windows.find(w => 
							w.windowName.toLowerCase().includes(targetAgent.toLowerCase()) ||
							w.windowIndex.toString() === targetAgent
						);
						
						if (targetWindow) {
							await bridge.sendClaudeMessage(
								`${sessionName}:${targetWindow.windowIndex}`, 
								taskMessage
							);
						}
					}
				} catch (e) {
					// Direct targeting failed, PM will handle assignment
				}
			}

			// Notify QA if task requires validation
			if (requiresQA) {
				const sessions = await bridge.getTmuxSessions();
				const session = sessions.find(s => s.name === sessionName);
				const qaWindow = session?.windows.find(w => 
					w.windowName.toLowerCase().includes('qa') || w.windowIndex === 1
				);

				if (qaWindow) {
					await bridge.sendClaudeMessage(`${sessionName}:${qaWindow.windowIndex}`,
						`📋 QA ALERT: New task scheduled requiring validation.
Task ID: ${taskId}
Description: ${taskDescription}
Priority: ${taskPriority}

Please prepare for testing when development completes.`);
				}
			}

			// Save task to tracking file
			const tasksFile = `/tmp/${sessionName}_tasks.json`;
			let tasks = [];
			if (fs.existsSync(tasksFile)) {
				tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
			}

			tasks.push({
				id: taskId,
				description: taskDescription,
				requiresQA,
				targetAgent: targetAgent || 'unassigned',
				priority: taskPriority,
				status: 'assigned',
				created: new Date().toISOString(),
			});

			fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));

			return {
				success: true,
				taskId,
				sessionName,
				taskDescription,
				requiresQA,
				targetAgent: targetAgent || 'PM will assign',
				priority: taskPriority,
				status: 'Task scheduled and assigned',
				qaNotified: requiresQA,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to schedule task: ${error.message}`);
		}
	}

	static async handleManageTeam(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const sessionName = context.getNodeParameter('sessionName', itemIndex) as string;
		const teamAction = context.getNodeParameter('teamAction', itemIndex) as string;

		try {
			const sessions = await bridge.getTmuxSessions();
			const session = sessions.find(s => s.name === sessionName);
			
			if (!session) {
				throw new Error(`Session ${sessionName} not found`);
			}

			switch (teamAction) {
				case 'add':
					return await TmuxProjectOrchestrator.addTeamMember(context, itemIndex, bridge, session);
				case 'remove':
					return await TmuxProjectOrchestrator.removeTeamMember(context, itemIndex, bridge, session);
				case 'list':
					return await TmuxProjectOrchestrator.listTeamMembers(session);
				case 'standup':
					return await TmuxProjectOrchestrator.conductStandup(bridge, session);
				default:
					throw new Error(`Unknown team action: ${teamAction}`);
			}
		} catch (error) {
			throw new Error(`Failed to manage team: ${error.message}`);
		}
	}

	private static async addTeamMember(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge, session: any): Promise<any> {
		const memberRole = context.getNodeParameter('memberRole', itemIndex) as string;
		const sessionName = session.name;

		try {
			const newWindowIndex = session.windows.length;
			const windowName = TmuxProjectOrchestrator.getWindowNameForRole(memberRole);

			// Validate inputs to prevent injection
			if (!sessionName || typeof sessionName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sessionName)) {
				throw new Error('Invalid session name - must contain only letters, numbers, underscores, and hyphens');
			}
			if (!windowName || typeof windowName !== 'string' || windowName.length > 50) {
				throw new Error('Invalid window name');
			}

			// Create new window securely
			const newWindowResult = await secureTmux('new-window', ['-t', sessionName, '-n', windowName]);
			if (!newWindowResult.success) {
				throw new Error(`Failed to create new window: ${newWindowResult.stderr}`);
			}
			
			// Start Claude agent securely
			const claudeResult = await secureTmux('send-keys', ['-t', `${sessionName}:${newWindowIndex}`, 'claude', 'Enter']);
			if (!claudeResult.success) {
				throw new Error(`Failed to start Claude agent: ${claudeResult.stderr}`);
			}
			await new Promise(resolve => setTimeout(resolve, 5000));

			// Send role briefing
			const roleBriefing = TmuxProjectOrchestrator.getRoleBriefing(memberRole);
			await bridge.sendClaudeMessage(`${sessionName}:${newWindowIndex}`, roleBriefing);

			// Notify PM
			await bridge.sendClaudeMessage(`${sessionName}:0`, 
				`TEAM UPDATE: New ${memberRole} added in window ${newWindowIndex}.
Please brief them on current project status and assign tasks as needed.
Remember: All commits require QA approval from our QA Engineer.`);

			// Notify QA about new team member
			const qaWindow = session.windows.find(w => 
				w.windowName.toLowerCase().includes('qa') || w.windowIndex === 1
			);
			
			if (qaWindow) {
				await bridge.sendClaudeMessage(`${sessionName}:${qaWindow.windowIndex}`,
					`👋 NEW TEAM MEMBER: ${memberRole} joined the project (Window ${newWindowIndex}).
You will need to validate their code changes before git commits.`);
			}

			return {
				success: true,
				sessionName,
				action: 'add',
				memberRole,
				windowIndex: newWindowIndex,
				windowName,
				message: `${memberRole} added to team successfully`,
			};
		} catch (error) {
			throw new Error(`Failed to add team member: ${error.message}`);
		}
	}

	private static async removeTeamMember(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge, session: any): Promise<any> {
		const windowIndex = context.getNodeParameter('windowIndex', itemIndex) as number;
		const sessionName = session.name;

		try {
			// Prevent removal of essential members (PM=0, QA=1)
			if (windowIndex === 0) {
				throw new Error('Cannot remove Project Manager - essential role');
			}
			if (windowIndex === 1) {
				throw new Error('Cannot remove QA Engineer - mandatory for quality assurance');
			}

			const targetWindow = session.windows.find(w => w.windowIndex === windowIndex);
			if (!targetWindow) {
				throw new Error(`Window ${windowIndex} not found`);
			}

			// Capture final status before removal
			const finalStatus = await bridge.captureWindowContent(sessionName, windowIndex, 50);

			// Validate inputs to prevent injection
			if (!sessionName || typeof sessionName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sessionName)) {
				throw new Error('Invalid session name - must contain only letters, numbers, underscores, and hyphens');
			}
			if (!Number.isInteger(windowIndex) || windowIndex < 0) {
				throw new Error('Invalid window index');
			}

			// Kill the window securely
			const killResult = await secureTmux('kill-window', ['-t', `${sessionName}:${windowIndex}`]);
			if (!killResult.success) {
				throw new Error(`Failed to kill window: ${killResult.stderr}`);
			}

			// Notify PM
			await bridge.sendClaudeMessage(`${sessionName}:0`, 
				`TEAM UPDATE: ${targetWindow.windowName} (Window ${windowIndex}) has been removed from the project.
Please redistribute any pending tasks to remaining team members.`);

			// Safely process final status with type checking
			let statusSummary: string;
			try {
				if (typeof finalStatus === 'string' && finalStatus.length > 0) {
					statusSummary = finalStatus.split('\n').slice(-10).join('\n');
				} else {
					statusSummary = finalStatus ? `Final status in unexpected format: ${typeof finalStatus}` : 'No final status captured';
				}
			} catch (error) {
				statusSummary = `Error processing final status: ${error.message}`;
			}

			return {
				success: true,
				sessionName,
				action: 'remove',
				removedWindow: targetWindow.windowName,
				windowIndex,
				finalStatus: statusSummary,
				message: `Team member removed successfully`,
			};
		} catch (error) {
			throw new Error(`Failed to remove team member: ${error.message}`);
		}
	}

	private static async listTeamMembers(session: any): Promise<any> {
		const teamMembers = session.windows.map(window => ({
			index: window.windowIndex,
			name: window.windowName,
			role: TmuxProjectOrchestrator.identifyAgentRole(window.windowName),
			active: window.active,
			essential: window.windowIndex <= 1, // PM and QA are essential
		}));

		const teamSummary = {
			projectManager: teamMembers.find(m => m.index === 0)?.name || 'Not found',
			qaEngineer: teamMembers.find(m => m.index === 1)?.name || 'Not found',
			developers: teamMembers.filter(m => m.index > 1),
			totalMembers: teamMembers.length,
		};

		return {
			success: true,
			sessionName: session.name,
			action: 'list',
			teamMembers,
			teamSummary,
			qaIntegrated: true,
			message: `Team has ${teamMembers.length} members with mandatory QA integration`,
		};
	}

	private static async conductStandup(bridge: TmuxBridge, session: any): Promise<any> {
		const sessionName = session.name;

		try {
			// Request status from each team member
			for (const window of session.windows) {
				await bridge.sendClaudeMessage(
					`${sessionName}:${window.windowIndex}`,
					`📊 DAILY STANDUP: Please provide your status update:

1. What you completed since last standup
2. What you're working on today
3. Any blockers or issues
4. ${window.windowIndex === 1 ? 'QA: Any pending validations or quality concerns' : 'Do you need QA validation for any work?'}

Please respond promptly for team coordination.`
				);
			}

			// Wait for responses
			await new Promise(resolve => setTimeout(resolve, 8000));

			// Collect responses
			const standupResults = [];
			for (const window of session.windows) {
				const output = await bridge.captureWindowContent(sessionName, window.windowIndex, 100);
				
				// Safely process the captured output with type checking
				let standupResponse: string;
				try {
					if (typeof output === 'string' && output.length > 0) {
						const recentLines = output.split('\n').slice(-30);
						
						// Extract standup response
						const standupStart = recentLines.findIndex(line => 
							line.includes('DAILY STANDUP') || line.includes('status update')
						);
						standupResponse = standupStart >= 0 ? 
							recentLines.slice(standupStart).join('\n') : 
							recentLines.slice(-15).join('\n');
					} else {
						standupResponse = output ? `Standup data in unexpected format: ${typeof output}` : 'No standup response captured';
					}
				} catch (error) {
					standupResponse = `Error processing standup response: ${error.message}`;
				}

				standupResults.push({
					agent: window.windowName,
					role: TmuxProjectOrchestrator.identifyAgentRole(window.windowName),
					index: window.windowIndex,
					response: standupResponse,
				});
			}

			// Send summary to PM
			const summary = standupResults.map(r => {
				// Extra safety: ensure response is string before processing
				const responseText = typeof r.response === 'string' ? r.response : String(r.response || 'No response');
				return `${r.agent}: ${responseText.split('\n').slice(-5).join(' ')}`;
			}).join('\n\n');
			
			await bridge.sendClaudeMessage(`${sessionName}:0`, 
				`📊 STANDUP SUMMARY:\n${summary}\n\nPlease review team status and coordinate any necessary actions. Pay special attention to QA workload and any blocked members.`);

			return {
				success: true,
				sessionName,
				action: 'standup',
				standupResults,
				teamSize: session.windows.length,
				timestamp: new Date().toISOString(),
				message: 'Daily standup completed successfully',
			};
		} catch (error) {
			throw new Error(`Failed to conduct standup: ${error.message}`);
		}
	}

	static async handleRunQATests(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const sessionName = context.getNodeParameter('sessionName', itemIndex) as string;
		const testTypes = context.getNodeParameter('testTypes', itemIndex) as string[];

		try {
			// Find QA Engineer window
			const sessions = await bridge.getTmuxSessions();
			const session = sessions.find(s => s.name === sessionName);
			
			if (!session) {
				throw new Error(`Session ${sessionName} not found`);
			}

			const qaWindow = session.windows.find(w => 
				w.windowName.toLowerCase().includes('qa') || w.windowIndex === 1
			);

			if (!qaWindow) {
				throw new Error('QA Engineer window not found');
			}

			// Send test execution request to QA
			const testRequest = `QA TEST EXECUTION REQUEST:
Test Types: ${testTypes.join(', ')}
Execute comprehensive testing and provide results.

Required Actions:
1. Run automated test suites
2. Perform manual testing if specified
3. Generate test report with results
4. Provide approve/reject recommendation

Please begin testing now and report results.`;

			await bridge.sendClaudeMessage(`${sessionName}:${qaWindow.windowIndex}`, testRequest);

			return {
				success: true,
				sessionName,
				testTypes,
				qaWindow: qaWindow.windowName,
				status: 'Test execution initiated',
				message: 'QA tests started. Monitor QA Engineer window for results.',
				nextStep: 'Use "Approve for Commit" or "Block Commit" based on QA results',
			};
		} catch (error) {
			throw new Error(`Failed to run QA tests: ${error.message}`);
		}
	}

	static async handleApproveCommit(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const sessionName = context.getNodeParameter('sessionName', itemIndex) as string;
		const commitMessage = context.getNodeParameter('commitMessage', itemIndex, '') as string;
		const qaFeedback = context.getNodeParameter('qaFeedback', itemIndex, '') as string;

		try {
			// Create QA approval flag
			const approvalData = {
				approved: true,
				timestamp: new Date().toISOString(),
				commitMessage,
				qaFeedback,
			};

			const qaApprovalFile = TmuxProjectOrchestrator.safeTempFileWrite(sessionName, 'qa_approval.flag', JSON.stringify(approvalData, null, 2));

			// Notify team of approval
			await bridge.sendClaudeMessage(`${sessionName}:0`, 
				`✅ QA APPROVAL GRANTED: Git commits are now enabled.
Commit Message: ${commitMessage}
QA Feedback: ${qaFeedback || 'Tests passed successfully'}

You may now proceed with git operations.`);

			return {
				success: true,
				sessionName,
				approved: true,
				commitMessage,
				qaFeedback,
				gitCommitsEnabled: true,
				timestamp: new Date().toISOString(),
				message: 'QA approval granted. Git commits are now enabled.',
			};
		} catch (error) {
			throw new Error(`Failed to approve commit: ${error.message}`);
		}
	}

	static async handleBlockCommit(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const sessionName = context.getNodeParameter('sessionName', itemIndex) as string;
		const commitMessage = context.getNodeParameter('commitMessage', itemIndex, '') as string;
		const qaFeedback = context.getNodeParameter('qaFeedback', itemIndex, '') as string;

		try {
			// Remove any existing approval flag
			const qaApprovalFile = `/tmp/${sessionName}_qa_approval.flag`;
			if (fs.existsSync(qaApprovalFile)) {
				fs.unlinkSync(qaApprovalFile);
			}

			// Create block record
			const blockData = {
				blocked: true,
				timestamp: new Date().toISOString(),
				commitMessage,
				qaFeedback,
			};

			const blockFile = `/tmp/${sessionName}_qa_block.json`;
			fs.writeFileSync(blockFile, JSON.stringify(blockData, null, 2));

			// Notify team of blocking
			await bridge.sendClaudeMessage(`${sessionName}:0`, 
				`❌ QA REJECTION: Git commits are BLOCKED.
Commit Message: ${commitMessage}
QA Feedback: ${qaFeedback}

Please address the QA concerns and request new testing.`);

			return {
				success: true,
				sessionName,
				blocked: true,
				commitMessage,
				qaFeedback,
				gitCommitsBlocked: true,
				timestamp: new Date().toISOString(),
				message: 'Commit blocked by QA. Address feedback and re-test.',
			};
		} catch (error) {
			throw new Error(`Failed to block commit: ${error.message}`);
		}
	}

	private static identifyAgentRole(windowName: string): string {
		const name = windowName.toLowerCase();
		if (name.includes('manager')) return 'project-manager';
		if (name.includes('qa') || name.includes('quality')) return 'qa-engineer';
		if (name.includes('security')) return 'security-engineer';
		if (name.includes('performance')) return 'performance-engineer';
		if (name.includes('devops')) return 'devops-engineer';
		if (name.includes('senior')) return 'senior-developer';
		if (name.includes('lead')) return 'tech-lead';
		if (name.includes('developer') || name.includes('dev')) return 'developer';
		return 'team-member';
	}

	private static generateStatusRecommendations(teamStatus: any[], qaApproved: boolean): string[] {
		const recommendations = [];

		if (!qaApproved) {
			recommendations.push('Run QA tests to enable git commits');
		}

		const blockedAgents = teamStatus.filter(t => 
			t.status.toLowerCase().includes('blocked') || 
			t.status.toLowerCase().includes('waiting')
		);

		if (blockedAgents.length > 0) {
			recommendations.push(`${blockedAgents.length} agents appear blocked - investigate and assist`);
		}

		const inactiveAgents = teamStatus.filter(t => !t.active && t.role !== 'qa-engineer');
		if (inactiveAgents.length > 0) {
			recommendations.push('Some agents are inactive - consider task redistribution');
		}

		if (recommendations.length === 0) {
			recommendations.push('Project appears healthy - continue monitoring');
		}

		return recommendations;
	}

	// Helper methods for analysis and utility functions
	private static extractTestResults(lines: string[]): any {
		const testKeywords = ['test', 'spec', 'passed', 'failed', 'coverage'];
		const testLines = lines.filter(line => 
			testKeywords.some(keyword => line.toLowerCase().includes(keyword))
		);
		
		return {
			testReferences: testLines.length,
			passedTests: testLines.filter(l => l.includes('passed') || l.includes('✓')).length,
			failedTests: testLines.filter(l => l.includes('failed') || l.includes('✗')).length,
		};
	}

	private static extractGitActivity(lines: string[]): any {
		const gitCommands = lines.filter(line => 
			line.includes('git ') || line.includes('commit') || line.includes('push')
		);
		
		return {
			gitCommands: gitCommands.length,
			commits: gitCommands.filter(l => l.includes('commit')).length,
			pushes: gitCommands.filter(l => l.includes('push')).length,
		};
	}

	private static calculateProductivity(lines: string[]): number {
		const nonEmptyLines = lines.filter(l => l.trim()).length;
		const commandLines = lines.filter(l => l.startsWith('$') || l.startsWith('>')).length;
		const errorLines = lines.filter(l => /error|exception|failed/i.test(l)).length;
		
		if (nonEmptyLines === 0) return 0;
		
		// Productivity = (commands - errors) / total lines
		return Math.max(0, (commandLines - errorLines) / nonEmptyLines);
	}

	private static generateProjectRecommendations(activities: any[], qaStatus: string, projectState: any): string[] {
		const recommendations = [];
		
		if (qaStatus === 'blocked') {
			recommendations.push('Address QA feedback to unblock git commits');
		}
		
		if (qaStatus === 'pending') {
			recommendations.push('Run QA tests to validate current work');
		}
		
		const highErrorAgents = activities.filter(a => a.errorsDetected > 5);
		if (highErrorAgents.length > 0) {
			recommendations.push(`${highErrorAgents.length} agents have high error rates - investigate and assist`);
		}
		
		const lowProductivityAgents = activities.filter(a => a.productivity < 0.1);
		if (lowProductivityAgents.length > 0) {
			recommendations.push(`${lowProductivityAgents.length} agents show low productivity - check for blockers`);
		}
		
		return recommendations.length > 0 ? recommendations : ['Project appears healthy - continue monitoring'];
	}

	private static assessProjectRisks(activities: any[], qaStatus: string): any {
		const risks = [];
		
		if (qaStatus === 'blocked') {
			risks.push({ level: 'HIGH', description: 'Git commits blocked by QA - development halted' });
		}
		
		const totalErrors = activities.reduce((sum, a) => sum + a.errorsDetected, 0);
		if (totalErrors > 20) {
			risks.push({ level: 'MEDIUM', description: 'High error count across team - quality concerns' });
		}
		
		const avgProductivity = activities.reduce((sum, a) => sum + a.productivity, 0) / activities.length;
		if (avgProductivity < 0.2) {
			risks.push({ level: 'MEDIUM', description: 'Low team productivity - potential blockers' });
		}
		
		return {
			riskLevel: risks.some(r => r.level === 'HIGH') ? 'HIGH' : 
					  risks.some(r => r.level === 'MEDIUM') ? 'MEDIUM' : 'LOW',
			risks: risks.length > 0 ? risks : [{ level: 'LOW', description: 'No significant risks identified' }],
		};
	}

	private static getLastQAAction(sessionName: string): string {
		const approvalFile = `/tmp/${sessionName}_qa_approval.flag`;
		const blockFile = `/tmp/${sessionName}_qa_block.json`;
		
		if (fs.existsSync(approvalFile)) {
			const stat = fs.statSync(approvalFile);
			return `Approved at ${stat.mtime.toISOString()}`;
		}
		
		if (fs.existsSync(blockFile)) {
			const stat = fs.statSync(blockFile);
			return `Blocked at ${stat.mtime.toISOString()}`;
		}
		
		return 'No QA actions recorded';
	}

	private static assessTaskPriority(description: string): string {
		const highPriorityKeywords = ['urgent', 'critical', 'bug', 'security', 'fix', 'broken'];
		const mediumPriorityKeywords = ['feature', 'enhancement', 'improve', 'optimize'];
		
		const desc = description.toLowerCase();
		
		if (highPriorityKeywords.some(kw => desc.includes(kw))) {
			return 'HIGH';
		}
		
		if (mediumPriorityKeywords.some(kw => desc.includes(kw))) {
			return 'MEDIUM';
		}
		
		return 'NORMAL';
	}

	private static getWindowNameForRole(role: string): string {
		const roleMap = {
			developer: 'Developer',
			seniorDeveloper: 'Senior-Developer',
			devops: 'DevOps-Engineer',
			security: 'Security-Engineer',
			performance: 'Performance-Engineer',
		};
		
		return roleMap[role] || 'Team-Member';
	}

	private static getRoleBriefing(role: string): string {
		const briefings = {
			developer: `You are a Developer on this project. Your responsibilities:

🎯 PRIMARY FOCUS:
- Write clean, maintainable code following project conventions
- Implement features according to specifications
- Collaborate effectively with team members

🚨 QA INTEGRATION MANDATORY:
- ALL your code changes require QA validation before git commits
- Request QA testing using "Run QA Tests" operation when ready
- Address QA feedback promptly and professionally
- No git commits are allowed without QA approval

💡 PRODUCTIVITY TIPS:
- Use the Task tool to deploy subagents for debugging, testing, code review
- Commit frequently (every 30 minutes) once QA approves
- Communicate blockers immediately to PM

Remember: Quality is non-negotiable. Work with QA Engineer to ensure excellence.`,

			seniorDeveloper: `You are a Senior Developer and technical leader. Your responsibilities:

🎯 LEADERSHIP ROLE:
- Provide technical guidance to junior developers
- Design system architecture and technical solutions
- Code review and mentoring
- Handle complex technical challenges

🚨 QA INTEGRATION MANDATORY:
- ALL code changes require QA validation before commits
- Lead by example in following QA processes
- Help team understand quality standards
- Coordinate with QA Engineer on technical testing requirements

💡 ADVANCED CAPABILITIES:
- Deploy specialized subagents for complex debugging, performance analysis
- Design test strategies with QA Engineer
- Optimize team productivity through technical leadership

Quality leadership is your responsibility - ensure team follows QA processes.`,

			devops: `You are a DevOps Engineer responsible for infrastructure and deployment. Your role:

🎯 INFRASTRUCTURE FOCUS:
- CI/CD pipeline setup and maintenance
- Infrastructure as code
- Monitoring and logging systems
- Deployment automation

🚨 QA INTEGRATION MANDATORY:
- Infrastructure changes require QA validation
- Automated testing integration in pipelines
- Deployment gates must include QA approval
- Monitor quality metrics in production

💡 AUTOMATION PRIORITIES:
- Automate QA test execution in CI/CD
- Set up quality gates and deployment controls
- Monitor application and infrastructure health

Ensure infrastructure supports robust QA processes and quality enforcement.`,

			security: `You are a Security Engineer focused on application and infrastructure security:

🎯 SECURITY PRIORITIES:
- Security code reviews and vulnerability assessment
- Infrastructure security hardening
- Compliance and audit requirements
- Threat modeling and risk assessment

🚨 QA INTEGRATION MANDATORY:
- Security changes require QA validation
- Coordinate security testing with QA Engineer
- Ensure security tests are part of QA pipeline
- Document security requirements for QA

💡 SECURITY TESTING:
- Deploy security-focused subagents for penetration testing
- Automate security scanning in development workflow
- Train team on secure coding practices

Security and quality go hand-in-hand - work closely with QA on security validation.`,

			performance: `You are a Performance Engineer optimizing application performance:

🎯 PERFORMANCE FOCUS:
- Application performance optimization
- Load testing and benchmarking
- Performance monitoring and alerting
- Capacity planning

🚨 QA INTEGRATION MANDATORY:
- Performance changes require QA validation
- Include performance tests in QA pipeline
- Set performance benchmarks with QA Engineer
- Monitor performance impact of all changes

💡 PERFORMANCE TESTING:
- Deploy performance testing subagents
- Automate performance regression testing
- Provide performance guidelines to developers

Performance is a quality attribute - ensure all performance work is QA validated.`,
		};

		return briefings[role] || `You are a team member on this project. All work requires QA validation before git commits.`;
	}
}