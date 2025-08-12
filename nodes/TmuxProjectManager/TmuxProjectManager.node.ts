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
						operation: ['assignTask', 'getProgress', 'validateQuality', 'createTeamMember', 'dailyStandup'],
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

		try {
			// Define windows based on team size
			const windows = this.getWindowsForTeamSize(teamSize);
			
			// Create the session with windows
			await bridge.createSession(projectName, projectPath, windows);

			// Deploy Project Manager
			execSync(`tmux send-keys -t ${projectName}:0 "claude" Enter`);
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

			// Start Claude agent
			execSync(`tmux send-keys -t ${projectSession}:${newWindowIndex} "claude" Enter`);
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

PROJECT SPECIFICATION:
${projectSpec}

First, analyze the project requirements and identify opportunities for parallel execution with subagents. Don't try to do everything yourself - delegate to specialists!`;
	}

	private async deployInitialTeam(projectName: string, teamSize: string, bridge: TmuxBridge): Promise<void> {
		// This would deploy additional team members based on team size
		// Implementation depends on specific requirements
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
}