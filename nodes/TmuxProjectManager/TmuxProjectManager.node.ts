import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { execSync } from 'child_process';
import { TmuxBridge, TmuxBridgeConfig } from '../../utils/tmuxBridge';
import { PathResolver } from '../../utils/paths';

export class TmuxProjectManager implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Tmux Project Manager',
		name: 'tmuxProjectManager',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage projects and coordinate agents in tmux sessions',
		defaults: {
			name: 'Tmux Project Manager',
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
						description: 'Initialize a new project with PM and team',
					},
					{
						name: 'Assign Task',
						value: 'assignTask',
						description: 'Delegate work to team members',
					},
					{
						name: 'Get Progress',
						value: 'getProgress',
						description: 'Track project completion and status',
					},
					{
						name: 'Validate Quality',
						value: 'validateQuality',
						description: 'Run PM quality checks on work',
					},
					{
						name: 'Create Team Member',
						value: 'createTeamMember',
						description: 'Add a new team member to the project',
					},
					{
						name: 'Daily Standup',
						value: 'dailyStandup',
						description: 'Collect status updates from all team members',
					},
					{
						name: 'Check Project Completion',
						value: 'checkCompletion',
						description: 'Monitor project for completion signals and readiness',
					},
					{
						name: 'Push to Remote',
						value: 'pushToRemote',
						description: 'Push worktree branch to remote repository',
					},
					{
						name: 'Create Pull Request',
						value: 'createPullRequest',
						description: 'Create GitHub pull request for completed project',
					},
					{
						name: 'Complete Project',
						value: 'completeProject',
						description: 'Full project completion workflow with PR creation',
					},
				],
				default: 'createProject',
			},
			// Create Project parameters
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
				displayName: 'Use Git Worktree',
				name: 'useWorktree',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['createProject'],
					},
				},
				description: 'Create project as a git worktree instead of a regular repository',
			},
			{
				displayName: 'Project Path',
				name: 'projectPath',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['createProject'],
					},
				},
				description: 'Path to the project directory',
			},
			{
				displayName: 'Project Specification',
				name: 'projectSpec',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['createProject'],
					},
				},
				description: 'Project requirements and specifications',
			},
			{
				displayName: 'Team Size',
				name: 'teamSize',
				type: 'options',
				options: [
					{
						name: 'Small (PM + 1 Dev)',
						value: 'small',
					},
					{
						name: 'Medium (PM + 2 Devs + QA)',
						value: 'medium',
					},
					{
						name: 'Large (PM + Lead + 2 Devs + QA + DevOps)',
						value: 'large',
					},
				],
				default: 'small',
				displayOptions: {
					show: {
						operation: ['createProject'],
					},
				},
				description: 'Initial team size',
			},
			// Assign Task parameters
			{
				displayName: 'Project Session',
				name: 'projectSession',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['assignTask', 'getProgress', 'validateQuality', 'createTeamMember', 'dailyStandup', 'checkCompletion', 'pushToRemote', 'createPullRequest', 'completeProject'],
					},
				},
				description: 'Tmux session name of the project',
			},
			{
				displayName: 'Task Description',
				name: 'taskDescription',
				type: 'string',
				typeOptions: {
					rows: 5,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['assignTask'],
					},
				},
				description: 'Description of the task to assign',
			},
			{
				displayName: 'Target Agent',
				name: 'targetAgent',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['assignTask'],
					},
				},
				description: 'Window index or name of the target agent',
			},
			{
				displayName: 'Priority',
				name: 'priority',
				type: 'options',
				options: [
					{
						name: 'High',
						value: 'HIGH',
					},
					{
						name: 'Medium',
						value: 'MED',
					},
					{
						name: 'Low',
						value: 'LOW',
					},
				],
				default: 'MED',
				displayOptions: {
					show: {
						operation: ['assignTask'],
					},
				},
				description: 'Task priority level',
			},
			// Create Team Member parameters
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
						name: 'QA Engineer',
						value: 'qaEngineer',
					},
					{
						name: 'DevOps',
						value: 'devops',
					},
					{
						name: 'Code Reviewer',
						value: 'codeReviewer',
					},
				],
				default: 'developer',
				displayOptions: {
					show: {
						operation: ['createTeamMember'],
					},
				},
				description: 'Role for the new team member',
			},
			// Validate Quality parameters
			{
				displayName: 'Validation Type',
				name: 'validationType',
				type: 'options',
				options: [
					{
						name: 'Code Review',
						value: 'codeReview',
					},
					{
						name: 'Test Coverage',
						value: 'testCoverage',
					},
					{
						name: 'Performance',
						value: 'performance',
					},
					{
						name: 'Security',
						value: 'security',
					},
					{
						name: 'Documentation',
						value: 'documentation',
					},
				],
				default: 'codeReview',
				displayOptions: {
					show: {
						operation: ['validateQuality'],
					},
				},
				description: 'Type of quality validation to perform',
			},
			// Pull Request parameters
			{
				displayName: 'PR Title',
				name: 'prTitle',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['createPullRequest', 'completeProject'],
					},
				},
				description: 'Title for the pull request',
			},
			{
				displayName: 'PR Description',
				name: 'prDescription',
				type: 'string',
				typeOptions: {
					rows: 5,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['createPullRequest', 'completeProject'],
					},
				},
				description: 'Description for the pull request',
			},
			{
				displayName: 'Target Branch',
				name: 'targetBranch',
				type: 'string',
				default: 'main',
				displayOptions: {
					show: {
						operation: ['pushToRemote', 'createPullRequest', 'completeProject'],
					},
				},
				description: 'Target branch for the pull request',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;
		
		// Get credentials if available
		let bridgeConfig: TmuxBridgeConfig = {};
		const pathResolver = new PathResolver();
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
						result = await TmuxProjectManager.prototype.createProject(this, i, bridge);
						break;
					case 'assignTask':
						result = await TmuxProjectManager.prototype.assignTask(this, i, bridge);
						break;
					case 'getProgress':
						result = await TmuxProjectManager.prototype.getProgress(this, i, bridge);
						break;
					case 'validateQuality':
						result = await TmuxProjectManager.prototype.validateQuality(this, i, bridge);
						break;
					case 'createTeamMember':
						result = await TmuxProjectManager.prototype.createTeamMember(this, i, bridge);
						break;
					case 'dailyStandup':
						result = await TmuxProjectManager.prototype.dailyStandup(this, i, bridge);
						break;
					case 'checkCompletion':
						result = await TmuxProjectManager.prototype.checkCompletion(this, i, bridge);
						break;
					case 'pushToRemote':
						result = await TmuxProjectManager.prototype.pushToRemote(this, i, bridge);
						break;
					case 'createPullRequest':
						result = await TmuxProjectManager.prototype.createPullRequest(this, i, bridge);
						break;
					case 'completeProject':
						result = await TmuxProjectManager.prototype.completeProject(this, i, bridge);
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

	private async createProject(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectName = context.getNodeParameter('projectName', itemIndex) as string;
		const projectPath = context.getNodeParameter('projectPath', itemIndex) as string;
		const projectSpec = context.getNodeParameter('projectSpec', itemIndex, '') as string;
		const teamSize = context.getNodeParameter('teamSize', itemIndex) as string;
		const useWorktree = context.getNodeParameter('useWorktree', itemIndex, false) as boolean;

		try {
			// Handle worktree creation if enabled
			let actualProjectPath = projectPath;
			let worktreeBranch = '';
			
			if (useWorktree) {
				// Get worktree configuration from credentials
				let worktreeConfig: any = {};
				try {
					const credentials = await context.getCredentials('tmuxOrchestratorApi');
					if (credentials?.worktreeConfig) {
						worktreeConfig = credentials.worktreeConfig as any;
					}
				} catch {
					// Use defaults
				}
				
				const parentRepo = worktreeConfig.parentRepoPath || projectPath;
				const worktreeBase = worktreeConfig.worktreeBasePath || '~/worktrees';
				const mainBranch = worktreeConfig.mainBranch || 'main';
				worktreeBranch = `feature/${projectName}-${Date.now()}`;
				
				// Create worktree
				actualProjectPath = `${worktreeBase}/${projectName}`;
				
				// Ensure parent repo exists and is on main branch
				try {
					execSync(`cd ${parentRepo} && git checkout ${mainBranch} && git pull`, { stdio: 'pipe' });
				} catch (error) {
					// If parent repo doesn't exist, create it
					execSync(`git init ${parentRepo} && cd ${parentRepo} && git checkout -b ${mainBranch}`, { stdio: 'pipe' });
				}
				
				// Create the worktree
				try {
					execSync(`cd ${parentRepo} && git worktree add -b ${worktreeBranch} ${actualProjectPath}`, { stdio: 'pipe' });
				} catch (error) {
					throw new Error(`Failed to create worktree: ${error.message}`);
				}
			}
			
			// Define windows based on team size
			const windows = this.getWindowsForTeamSize(teamSize);
			
			// Create the session with windows
			await bridge.createSession(projectName, actualProjectPath, windows);

			// Get credentials for proper agent configuration
			let claudeCommand = 'claude';
			let subagentConfig = '';
			let worktreeConfig: any = {};
			
			try {
				const credentials = await context.getCredentials('tmuxOrchestratorApi');
				
				// Build claude command with subagent support
				if (credentials?.subagentConfig) {
					const subagentCfg = credentials.subagentConfig as any;
					if (subagentCfg.enableAllSubagents) {
						subagentConfig = '--subagents all';
					} else if (subagentCfg.customSubagents) {
						subagentConfig = `--subagents ${subagentCfg.customSubagents}`;
					}
				}
				
				// Get worktree configuration
				if (credentials?.worktreeConfig) {
					worktreeConfig = credentials.worktreeConfig as any;
				}
				
				// Add additional command options
				if (credentials?.claudeCommandOptions) {
					claudeCommand += ` ${credentials.claudeCommandOptions}`;
				}
				
				// Use custom claude command if specified
				if (credentials?.claudeCommand) {
					claudeCommand = credentials.claudeCommand as string;
				}
			} catch {
				// Credentials not configured, use defaults
			}
			
			// Build the full command
			const fullCommand = `${claudeCommand} ${subagentConfig}`.trim();
			
			// Deploy Project Manager with proper configuration
			execSync(`tmux send-keys -t ${projectName}:0 "${fullCommand}" Enter`);
			await new Promise(resolve => setTimeout(resolve, 5000));

			// Send PM briefing
			const pmBriefing = this.createPMBriefing(projectSpec, teamSize);
			await bridge.sendClaudeMessage(`${projectName}:0`, pmBriefing);

			// Deploy initial team members based on size
			if (teamSize !== 'small') {
				await this.deployInitialTeam(projectName, teamSize, bridge);
			}

			return {
				success: true,
				projectName,
				projectPath,
				sessionCreated: projectName,
				windows,
				teamSize,
				message: `Project ${projectName} created successfully with ${teamSize} team`,
			};
		} catch (error) {
			throw new Error(`Failed to create project: ${error.message}`);
		}
	}

	private async assignTask(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectSession = context.getNodeParameter('projectSession', itemIndex) as string;
		const taskDescription = context.getNodeParameter('taskDescription', itemIndex) as string;
		const targetAgent = context.getNodeParameter('targetAgent', itemIndex, '') as string;
		const priority = context.getNodeParameter('priority', itemIndex) as string;

		try {
			const taskId = `TASK-${Date.now()}`;
			const taskMessage = `
TASK ${taskId}: New Assignment
Assigned to: ${targetAgent || 'Next available'}
Priority: ${priority}
Objective: ${taskDescription}
Success Criteria:
- Complete implementation
- Tests pass
- Code reviewed
- Documentation updated
Please acknowledge receipt and provide ETA.`;

			// Send to PM first
			await bridge.sendClaudeMessage(`${projectSession}:0`, 
				`Please assign the following task to the team:\n${taskMessage}`);

			// If specific target, also send directly
			if (targetAgent) {
				await bridge.sendClaudeMessage(`${projectSession}:${targetAgent}`, taskMessage);
			}

			return {
				success: true,
				taskId,
				projectSession,
				targetAgent,
				priority,
				taskDescription,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to assign task: ${error.message}`);
		}
	}

	private async getProgress(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectSession = context.getNodeParameter('projectSession', itemIndex) as string;

		try {
			// Get all windows in the session
			const sessions = await bridge.getTmuxSessions();
			const projectSessionData = sessions.find(s => s.name === projectSession);
			
			if (!projectSessionData) {
				throw new Error(`Session ${projectSession} not found`);
			}

			// Request status from PM
			await bridge.sendClaudeMessage(`${projectSession}:0`, 
				'STATUS UPDATE REQUEST: Please provide current project status including completed tasks, in-progress work, and any blockers.');

			// Wait for response
			await new Promise(resolve => setTimeout(resolve, 3000));

			// Capture PM response
			const pmOutput = await bridge.captureWindowContent(projectSession, 0, 100);

			// Collect status from all team members
			const teamStatus = [];
			for (const window of projectSessionData.windows) {
				if (window.windowIndex > 0) { // Skip PM window
					const windowOutput = await bridge.captureWindowContent(
						projectSession, 
						window.windowIndex, 
						50
					);
					
					// Safely process the window output with type checking
					let lastActivity: string;
					try {
						if (typeof windowOutput === 'string' && windowOutput.length > 0) {
							lastActivity = windowOutput.split('\n').slice(-10).join('\n');
						} else {
							lastActivity = windowOutput ? `Window activity in unexpected format: ${typeof windowOutput}` : 'No activity available';
						}
					} catch (error) {
						lastActivity = `Error processing window activity: ${error.message}`;
					}
					
					teamStatus.push({
						window: window.windowName,
						index: window.windowIndex,
						lastActivity,
					});
				}
			}

			// Safely process the PM output with type checking
			let pmStatus: string;
			try {
				if (typeof pmOutput === 'string' && pmOutput.length > 0) {
					pmStatus = pmOutput.split('\n').slice(-30).join('\n');
				} else {
					pmStatus = pmOutput ? `PM status in unexpected format: ${typeof pmOutput}` : 'No PM status available';
				}
			} catch (error) {
				pmStatus = `Error processing PM status: ${error.message}`;
			}

			return {
				success: true,
				projectSession,
				pmStatus,
				teamStatus,
				windowCount: projectSessionData.windows.length,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to get progress: ${error.message}`);
		}
	}

	private async validateQuality(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectSession = context.getNodeParameter('projectSession', itemIndex) as string;
		const validationType = context.getNodeParameter('validationType', itemIndex) as string;

		try {
			const validationChecklist = this.getValidationChecklist(validationType);
			
			// Send validation request to PM
			await bridge.sendClaudeMessage(`${projectSession}:0`, 
				`QUALITY VALIDATION REQUEST
Type: ${validationType}
Please perform the following quality checks:
${validationChecklist}
Report any issues found and overall quality score.`);

			// Wait for validation
			await new Promise(resolve => setTimeout(resolve, 5000));

			// Capture validation results
			const validationOutput = await bridge.captureWindowContent(projectSession, 0, 100);

			// Safely process the validation output with type checking
			let pmResponse: string;
			try {
				if (typeof validationOutput === 'string' && validationOutput.length > 0) {
					pmResponse = validationOutput.split('\n').slice(-50).join('\n');
				} else {
					pmResponse = validationOutput ? `Validation response in unexpected format: ${typeof validationOutput}` : 'No validation response available';
				}
			} catch (error) {
				pmResponse = `Error processing validation response: ${error.message}`;
			}

			return {
				success: true,
				projectSession,
				validationType,
				validationRequested: true,
				checklist: validationChecklist,
				pmResponse,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to validate quality: ${error.message}`);
		}
	}

	private async createTeamMember(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectSession = context.getNodeParameter('projectSession', itemIndex) as string;
		const memberRole = context.getNodeParameter('memberRole', itemIndex) as string;

		try {
			// Get current windows
			const sessions = await bridge.getTmuxSessions();
			const projectSessionData = sessions.find(s => s.name === projectSession);
			
			if (!projectSessionData) {
				throw new Error(`Session ${projectSession} not found`);
			}

			const newWindowIndex = projectSessionData.windows.length;
			const windowName = `Claude-${memberRole}`;

			// Create new window
			execSync(`tmux new-window -t ${projectSession} -n "${windowName}"`);

			// Get credentials for proper agent configuration
			let claudeCommand = 'claude';
			let subagentConfig = '';
			
			try {
				const credentials = await context.getCredentials('tmuxOrchestratorApi');
				
				// Build claude command with subagent support
				if (credentials?.subagentConfig) {
					const subagentCfg = credentials.subagentConfig as any;
					if (subagentCfg.enableAllSubagents) {
						subagentConfig = '--subagents all';
					} else if (subagentCfg.customSubagents) {
						subagentConfig = `--subagents ${subagentCfg.customSubagents}`;
					}
				}
				
				// Add additional command options
				if (credentials?.claudeCommandOptions) {
					claudeCommand += ` ${credentials.claudeCommandOptions}`;
				}
				
				// Use custom claude command if specified
				if (credentials?.claudeCommand) {
					claudeCommand = credentials.claudeCommand as string;
				}
			} catch {
				// Credentials not configured, use defaults
			}
			
			// Build the full command
			const fullCommand = `${claudeCommand} ${subagentConfig}`.trim();
			
			// Start Claude agent with proper configuration
			execSync(`tmux send-keys -t ${projectSession}:${newWindowIndex} "${fullCommand}" Enter`);
			await new Promise(resolve => setTimeout(resolve, 5000));

			// Send role briefing
			const roleBriefing = this.getRoleBriefing(memberRole);
			await bridge.sendClaudeMessage(`${projectSession}:${newWindowIndex}`, roleBriefing);

			// Notify PM
			await bridge.sendClaudeMessage(`${projectSession}:0`, 
				`New team member added: ${memberRole} in window ${newWindowIndex}. Please brief them on current project status and assign initial tasks.`);

			return {
				success: true,
				projectSession,
				memberRole,
				windowIndex: newWindowIndex,
				windowName,
				message: `${memberRole} added to project ${projectSession}`,
			};
		} catch (error) {
			throw new Error(`Failed to create team member: ${error.message}`);
		}
	}

	private async dailyStandup(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectSession = context.getNodeParameter('projectSession', itemIndex) as string;

		try {
			// Get all windows
			const sessions = await bridge.getTmuxSessions();
			const projectSessionData = sessions.find(s => s.name === projectSession);
			
			if (!projectSessionData) {
				throw new Error(`Session ${projectSession} not found`);
			}

			const standupResults = [];

			// Request status from each team member
			for (const window of projectSessionData.windows) {
				if (window.windowIndex > 0) { // Skip PM window for now
					await bridge.sendClaudeMessage(
						`${projectSession}:${window.windowIndex}`,
						`DAILY STANDUP: Please provide:
1. What you completed yesterday
2. What you're working on today
3. Any blockers or issues`
					);
				}
			}

			// Wait for responses
			await new Promise(resolve => setTimeout(resolve, 5000));

			// Collect responses
			for (const window of projectSessionData.windows) {
				const output = await bridge.captureWindowContent(
					projectSession,
					window.windowIndex,
					50
				);
				
				// Safely process the captured output with type checking
				let status: string;
				try {
					if (typeof output === 'string' && output.length > 0) {
						status = output.split('\n').slice(-20).join('\n');
					} else {
						status = output ? `Standup status in unexpected format: ${typeof output}` : 'No standup response available';
					}
				} catch (error) {
					status = `Error processing standup status: ${error.message}`;
				}
				
				standupResults.push({
					window: window.windowName,
					index: window.windowIndex,
					status,
				});
			}

			// Send summary to PM
			const summary = standupResults.map(r => {
				// Extra safety: ensure status is string before processing
				const statusText = typeof r.status === 'string' ? r.status : String(r.status || 'No status');
				return `${r.window}: ${statusText.split('\n').slice(-5).join(' ')}`;
			}).join('\n\n');
			
			await bridge.sendClaudeMessage(`${projectSession}:0`, 
				`STANDUP SUMMARY:\n${summary}\n\nPlease review and address any blockers.`);

			return {
				success: true,
				projectSession,
				standupResults,
				teamSize: projectSessionData.windows.length,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to conduct standup: ${error.message}`);
		}
	}

	private getWindowsForTeamSize(teamSize: string): string[] {
		switch (teamSize) {
			case 'small':
				return ['Project-Manager', 'Developer'];
			case 'medium':
				return ['Project-Manager', 'Developer-1', 'Developer-2', 'QA-Engineer'];
			case 'large':
				return ['Project-Manager', 'Tech-Lead', 'Developer-1', 'Developer-2', 'QA-Engineer', 'DevOps'];
			default:
				return ['Project-Manager'];
		}
	}

	private createPMBriefing(projectSpec: string, teamSize: string): string {
		return `You are the Project Manager for this project. Your responsibilities:

1. **Quality Standards**: Maintain exceptionally high standards. No shortcuts, no compromises.
2. **Team Management**: You have a ${teamSize} team. Coordinate their work efficiently.
3. **Progress Tracking**: Monitor velocity, identify blockers, report status.
4. **Risk Management**: Identify and mitigate risks proactively.
5. **Git Discipline**: Ensure all team members commit every 30 minutes.
6. **🚀 SUBAGENT DEPLOYMENT**: Maximize parallel execution by using the Task tool with specialized subagents!

CRITICAL: You have access to the Task tool which can deploy specialized subagents:
• For development: subagent_type='developer', 'frontend-developer', 'backend-developer'
• For testing: subagent_type='qa-expert', 'test-automator', 'performance-engineer'
• For research: subagent_type='research-analyst', 'search-specialist'
• For review: subagent_type='code-reviewer', 'security-auditor'

Example: Task tool with prompt='Create comprehensive test suite for authentication' and subagent_type='test-automator'

🎯 **COMPLETION CRITERIA - CRITICAL**:
When ALL project objectives are met and code is ready for production:
1. Respond with exactly "PROJECT COMPLETE" in your message
2. Ensure all deliverables are finished and tested
3. Confirm QA has approved all changes
4. This triggers automatic PR creation and project finalization

**AUTONOMOUS WORKFLOW**:
This project uses autonomous completion monitoring. When you signal "PROJECT COMPLETE":
- System automatically pushes code to remote repository
- Creates pull request with project summary
- Notifies stakeholders of completion
- Archives project session

PROJECT SPECIFICATION:
${projectSpec}

First, analyze the project requirements and identify opportunities for parallel execution with subagents. When everything is complete, use the exact phrase "PROJECT COMPLETE" to trigger autonomous finalization!`;
	}

	private async deployInitialTeam(projectName: string, teamSize: string, bridge: TmuxBridge): Promise<void> {
		// Get credentials for proper agent configuration
		let claudeCommand = 'claude';
		let subagentConfig = '';
		
		// Note: credentials would need to be passed from calling context
		// For now, using defaults with subagent support enabled
		subagentConfig = '--subagents all';
		
		// Build the full command
		const fullCommand = `${claudeCommand} ${subagentConfig}`.trim();
		
		// Deploy team members based on team size
		const deployAgent = async (windowIndex: number, role: string) => {
			// Start Claude agent
			execSync(`tmux send-keys -t ${projectName}:${windowIndex} "${fullCommand}" Enter`);
			await new Promise(resolve => setTimeout(resolve, 5000));
			
			// Send role briefing
			const roleBriefing = this.getRoleBriefing(role);
			await bridge.sendClaudeMessage(`${projectName}:${windowIndex}`, roleBriefing);
		};
		
		switch (teamSize) {
			case 'medium':
				// Deploy Developer-1
				await deployAgent(1, 'developer');
				// Deploy Developer-2
				await deployAgent(2, 'developer');
				// Deploy QA Engineer
				await deployAgent(3, 'qaEngineer');
				break;
			case 'large':
				// Deploy Tech Lead
				await deployAgent(1, 'developer');
				// Deploy Developer-1
				await deployAgent(2, 'developer');
				// Deploy Developer-2
				await deployAgent(3, 'developer');
				// Deploy QA Engineer
				await deployAgent(4, 'qaEngineer');
				// Deploy DevOps
				await deployAgent(5, 'devops');
				break;
			case 'small':
			default:
				// Deploy single Developer
				await deployAgent(1, 'developer');
				break;
		}
		
		// Notify PM about team deployment
		await bridge.sendClaudeMessage(`${projectName}:0`, 
			`Team deployment complete. ${teamSize} team is ready. Please brief team members on project tasks.`);
	}

	private getValidationChecklist(validationType: string): string {
		const checklists = {
			codeReview: `- Code follows project conventions
- No obvious bugs or issues
- Error handling is comprehensive
- Code is readable and maintainable
- No security vulnerabilities`,
			testCoverage: `- All functions have tests
- Edge cases are covered
- Tests are passing
- Coverage meets minimum threshold
- Integration tests included`,
			performance: `- Response times are acceptable
- No memory leaks
- Database queries optimized
- Caching implemented where needed
- Load testing passed`,
			security: `- No hardcoded secrets
- Input validation present
- SQL injection prevention
- XSS protection
- Authentication/authorization correct`,
			documentation: `- README is complete
- API documentation updated
- Code comments present
- Architecture documented
- Deployment guide available`,
		};

		return checklists[validationType] || 'General quality check';
	}

	private getRoleBriefing(role: string): string {
		const briefings = {
			developer: `You are a Developer on this project. Focus on:
- Writing clean, maintainable code
- Following project conventions
- Committing every 30 minutes
- Collaborating with team members
- Reporting blockers immediately`,
			qaEngineer: `You are the QA Engineer. Your responsibilities:
- Write comprehensive tests
- Validate all features
- Report bugs clearly
- Ensure quality standards
- Automate testing where possible`,
			devops: `You are the DevOps engineer. Focus on:
- CI/CD pipeline setup
- Infrastructure as code
- Monitoring and logging
- Performance optimization
- Security best practices`,
			codeReviewer: `You are the Code Reviewer. Your duties:
- Review all code changes
- Ensure best practices
- Check for security issues
- Validate documentation
- Provide constructive feedback`,
		};

		return briefings[role] || 'You are a team member on this project.';
	}

	private async checkCompletion(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectSession = context.getNodeParameter('projectSession', itemIndex) as string;

		try {
			// Get all windows
			const sessions = await bridge.getTmuxSessions();
			const projectSessionData = sessions.find(s => s.name === projectSession);
			
			if (!projectSessionData) {
				throw new Error(`Session ${projectSession} not found`);
			}

			// Check PM for completion signals
			await bridge.sendClaudeMessage(`${projectSession}:0`, 
				'STATUS REQUEST: Please report if project is complete and ready for pull request. Respond with "PROJECT COMPLETE" if all objectives are met and code is ready for PR.');

			// Wait for response
			await new Promise(resolve => setTimeout(resolve, 3000));

			// Capture PM response
			const pmOutput = await bridge.captureWindowContent(projectSession, 0, 50);
			
			let pmResponse = '';
			try {
				if (typeof pmOutput === 'string' && pmOutput.length > 0) {
					pmResponse = pmOutput.split('\n').slice(-20).join('\n');
				} else {
					pmResponse = 'No response available';
				}
			} catch (error) {
				pmResponse = `Error processing PM response: ${error.message}`;
			}

			// Check for completion signals
			const completionSignals = [
				'PROJECT COMPLETE',
				'project complete',
				'ready for PR',
				'ready for pull request',
				'objectives met',
				'deliverables complete'
			];

			const isComplete = completionSignals.some(signal => 
				pmResponse.toLowerCase().includes(signal.toLowerCase())
			);

			// Also check QA status
			let qaApproved = false;
			try {
				const qaOutput = await bridge.captureWindowContent(projectSession, 1, 20);
				if (typeof qaOutput === 'string') {
					qaApproved = qaOutput.toLowerCase().includes('approved') || 
								qaOutput.toLowerCase().includes('qa approved') ||
								qaOutput.toLowerCase().includes('tests passed');
				}
			} catch {
				// QA window might not exist
			}

			return {
				success: true,
				projectSession,
				isComplete,
				qaApproved,
				pmResponse,
				readyForPR: isComplete && qaApproved,
				timestamp: new Date().toISOString(),
				recommendations: isComplete ? ['Project appears complete - consider creating PR'] : ['Project still in progress'],
			};
		} catch (error) {
			throw new Error(`Failed to check completion: ${error.message}`);
		}
	}

	private async pushToRemote(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectSession = context.getNodeParameter('projectSession', itemIndex) as string;
		const targetBranch = context.getNodeParameter('targetBranch', itemIndex) as string;

		try {
			// Get project path from session data or use working directory
			const sessions = await bridge.getTmuxSessions();
			const projectSessionData = sessions.find(s => s.name === projectSession);
			
			if (!projectSessionData) {
				throw new Error(`Session ${projectSession} not found`);
			}

			// Get current working directory from the session
			await bridge.sendCommandToWindow(projectSession, 0, 'pwd');
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const output = await bridge.captureWindowContent(projectSession, 0, 5);
			let projectPath = '';
			if (typeof output === 'string') {
				const lines = output.trim().split('\n');
				projectPath = lines[lines.length - 1].trim();
			}

			if (!projectPath || projectPath === '') {
				throw new Error('Could not determine project path');
			}

			// Get the current branch name
			const branchNameCmd = `cd ${projectPath} && git branch --show-current`;
			await bridge.sendCommandToWindow(projectSession, 0, branchNameCmd);
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const branchOutput = await bridge.captureWindowContent(projectSession, 0, 5);
			let currentBranch = '';
			if (typeof branchOutput === 'string') {
				const lines = branchOutput.trim().split('\n');
				currentBranch = lines[lines.length - 1].trim();
			}

			if (!currentBranch) {
				throw new Error('Could not determine current branch');
			}

			// Push to remote
			const pushCmd = `cd ${projectPath} && git add . && git commit -m "Final commit before PR" && git push -u origin ${currentBranch}`;
			await bridge.sendCommandToWindow(projectSession, 0, pushCmd);
			
			// Wait for push to complete
			await new Promise(resolve => setTimeout(resolve, 5000));
			
			// Check if push was successful
			const pushOutput = await bridge.captureWindowContent(projectSession, 0, 10);
			let pushSuccess = false;
			if (typeof pushOutput === 'string') {
				pushSuccess = pushOutput.includes('To ') && 
							 (pushOutput.includes('new branch') || pushOutput.includes('up to date'));
			}

			return {
				success: pushSuccess,
				projectSession,
				projectPath,
				currentBranch,
				targetBranch,
				pushed: pushSuccess,
				message: pushSuccess ? `Successfully pushed ${currentBranch} to origin` : 'Push may have failed - check output',
				pushOutput: typeof pushOutput === 'string' ? pushOutput.split('\n').slice(-10).join('\n') : 'No output',
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to push to remote: ${error.message}`);
		}
	}

	private async createPullRequest(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectSession = context.getNodeParameter('projectSession', itemIndex) as string;
		const prTitle = context.getNodeParameter('prTitle', itemIndex, '') as string;
		const prDescription = context.getNodeParameter('prDescription', itemIndex, '') as string;
		const targetBranch = context.getNodeParameter('targetBranch', itemIndex) as string;

		try {
			// Get project path
			await bridge.sendCommandToWindow(projectSession, 0, 'pwd');
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const output = await bridge.captureWindowContent(projectSession, 0, 5);
			let projectPath = '';
			if (typeof output === 'string') {
				const lines = output.trim().split('\n');
				projectPath = lines[lines.length - 1].trim();
			}

			// Get current branch
			const branchCmd = `cd ${projectPath} && git branch --show-current`;
			await bridge.sendCommandToWindow(projectSession, 0, branchCmd);
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const branchOutput = await bridge.captureWindowContent(projectSession, 0, 5);
			let currentBranch = '';
			if (typeof branchOutput === 'string') {
				const lines = branchOutput.trim().split('\n');
				currentBranch = lines[lines.length - 1].trim();
			}

			// Generate PR title if not provided
			const finalTitle = prTitle || `Feature: ${projectSession} implementation`;
			
			// Generate PR description if not provided
			const finalDescription = prDescription || `
## Summary
Implementation of ${projectSession} project.

## Changes
- Project implementation completed
- QA validation passed
- Ready for review

## Test Plan
- All tests passing
- QA approval obtained

🤖 Generated with Claude Code Tmux Orchestrator
			`.trim();

			// Create PR using GitHub CLI
			const prCmd = `cd ${projectPath} && gh pr create --title "${finalTitle}" --body "${finalDescription}" --base ${targetBranch} --head ${currentBranch}`;
			await bridge.sendCommandToWindow(projectSession, 0, prCmd);
			
			// Wait for PR creation
			await new Promise(resolve => setTimeout(resolve, 5000));
			
			// Check PR creation result
			const prOutput = await bridge.captureWindowContent(projectSession, 0, 15);
			let prSuccess = false;
			let prUrl = '';
			
			if (typeof prOutput === 'string') {
				prSuccess = prOutput.includes('https://github.com') || prOutput.includes('pull request created');
				
				// Extract PR URL
				const urlMatch = prOutput.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
				if (urlMatch) {
					prUrl = urlMatch[0];
				}
			}

			// Notify PM of PR creation
			if (prSuccess) {
				await bridge.sendClaudeMessage(`${projectSession}:0`, 
					`🎉 SUCCESS: Pull request created successfully!\n\nPR URL: ${prUrl}\n\nTitle: ${finalTitle}\n\nThe project is now ready for review and merge.`);
			}

			return {
				success: prSuccess,
				projectSession,
				projectPath,
				currentBranch,
				targetBranch,
				prTitle: finalTitle,
				prDescription: finalDescription,
				prUrl,
				prCreated: prSuccess,
				message: prSuccess ? `PR created successfully: ${prUrl}` : 'PR creation may have failed - check output',
				prOutput: typeof prOutput === 'string' ? prOutput.split('\n').slice(-10).join('\n') : 'No output',
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to create pull request: ${error.message}`);
		}
	}

	private async completeProject(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const projectSession = context.getNodeParameter('projectSession', itemIndex) as string;
		const prTitle = context.getNodeParameter('prTitle', itemIndex, '') as string;
		const prDescription = context.getNodeParameter('prDescription', itemIndex, '') as string;
		const targetBranch = context.getNodeParameter('targetBranch', itemIndex) as string;

		try {
			// Step 1: Check completion status
			const completionResult = await this.checkCompletion(context, itemIndex, bridge);
			
			if (!completionResult.readyForPR) {
				return {
					success: false,
					projectSession,
					step: 'completion_check',
					isComplete: completionResult.isComplete,
					qaApproved: completionResult.qaApproved,
					message: 'Project not ready for completion. PM must signal completion and QA must approve.',
					recommendations: [
						'Ensure PM reports "PROJECT COMPLETE"',
						'Verify QA has approved all changes',
						'Check that all deliverables are finished'
					],
				};
			}

			// Step 2: Push to remote
			const pushResult = await this.pushToRemote(context, itemIndex, bridge);
			
			if (!pushResult.success) {
				return {
					success: false,
					projectSession,
					step: 'push_to_remote',
					pushResult,
					message: 'Failed to push changes to remote repository',
				};
			}

			// Step 3: Create pull request
			const prResult = await this.createPullRequest(context, itemIndex, bridge);

			// Notify team of completion
			if (prResult.success) {
				await bridge.sendClaudeMessage(`${projectSession}:0`, 
					`🚀 PROJECT COMPLETED SUCCESSFULLY!\n\nPull Request: ${prResult.prUrl}\n\nNext Steps:\n- Review and merge the PR\n- Deploy to production\n- Project archival\n\nGreat work team! 🎉`);
			}

			return {
				success: prResult.success,
				projectSession,
				completedSteps: [
					{ step: 'completion_check', success: true, result: completionResult },
					{ step: 'push_to_remote', success: pushResult.success, result: pushResult },
					{ step: 'create_pull_request', success: prResult.success, result: prResult },
				],
				finalResult: prResult,
				projectCompleted: prResult.success,
				prUrl: prResult.prUrl,
				message: prResult.success 
					? `Project completed successfully! PR created: ${prResult.prUrl}` 
					: 'Project completion workflow encountered issues',
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to complete project: ${error.message}`);
		}
	}
}