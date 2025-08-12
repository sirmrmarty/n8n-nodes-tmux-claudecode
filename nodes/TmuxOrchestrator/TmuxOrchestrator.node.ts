import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { execSync, spawn } from 'child_process';
import * as path from 'path';
import { TmuxBridge, TmuxBridgeConfig } from '../../utils/tmuxBridge';
import { PathResolver } from '../../utils/paths';

export class TmuxOrchestrator implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Tmux Orchestrator',
		name: 'tmuxOrchestrator',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Orchestrate Claude AI agents through tmux sessions',
		defaults: {
			name: 'Tmux Orchestrator',
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
						name: 'Deploy Agent',
						value: 'deployAgent',
						description: 'Start a new Claude agent in a tmux session',
					},
					{
						name: 'Send Message',
						value: 'sendMessage',
						description: 'Send a message to an existing agent',
					},
					{
						name: 'Suggest Subagent',
						value: 'suggestSubagent',
						description: 'Suggest subagent usage to improve parallel execution',
					},
					{
						name: 'Capture Output',
						value: 'captureOutput',
						description: 'Get recent output from an agent window',
					},
					{
						name: 'Get Status',
						value: 'getStatus',
						description: 'Check agent health and activity',
					},
					{
						name: 'List Sessions',
						value: 'listSessions',
						description: 'List all active tmux sessions',
					},
					{
						name: 'Terminate Agent',
						value: 'terminateAgent',
						description: 'Cleanly shutdown an agent',
					},
				],
				default: 'deployAgent',
			},
			// Deploy Agent parameters
			{
				displayName: 'Session Name',
				name: 'sessionName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['deployAgent'],
					},
				},
				description: 'Name for the tmux session',
			},
			{
				displayName: 'Project Path',
				name: 'projectPath',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['deployAgent'],
					},
				},
				description: 'Path to the project directory',
			},
			{
				displayName: 'Agent Role',
				name: 'agentRole',
				type: 'options',
				options: [
					{
						name: 'Developer',
						value: 'developer',
					},
					{
						name: 'Project Manager',
						value: 'projectManager',
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
					{
						name: 'Documentation Writer',
						value: 'docWriter',
					},
				],
				default: 'developer',
				displayOptions: {
					show: {
						operation: ['deployAgent'],
					},
				},
				description: 'Role for the agent',
			},
			{
				displayName: 'Initial Briefing',
				name: 'initialBriefing',
				type: 'string',
				typeOptions: {
					rows: 5,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['deployAgent'],
					},
				},
				description: 'Initial instructions for the agent',
			},
			// Send Message and Suggest Subagent parameters
			{
				displayName: 'Target Window',
				name: 'targetWindow',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage', 'suggestSubagent', 'captureOutput', 'terminateAgent'],
					},
				},
				description: 'Target window in format session:window (e.g., my-project:0)',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
					},
				},
				description: 'Message to send to the agent',
			},
			// Suggest Subagent parameters
			{
				displayName: 'Agent Type',
				name: 'agentType',
				type: 'options',
				options: [
					{
						name: 'Project Manager',
						value: 'pm',
					},
					{
						name: 'Developer/Engineer',
						value: 'developer',
					},
					{
						name: 'General',
						value: 'general',
					},
				],
				default: 'general',
				displayOptions: {
					show: {
						operation: ['suggestSubagent'],
					},
				},
				description: 'Type of agent to suggest subagents to',
			},
			{
				displayName: 'Context',
				name: 'suggestionContext',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['suggestSubagent'],
					},
				},
				description: 'Optional context for the suggestion (e.g., "handling multiple features")',
			},
			// Capture Output parameters
			{
				displayName: 'Number of Lines',
				name: 'numLines',
				type: 'number',
				default: 50,
				displayOptions: {
					show: {
						operation: ['captureOutput'],
					},
				},
				description: 'Number of lines to capture from the window',
			},
			// Get Status parameters
			{
				displayName: 'Session Filter',
				name: 'sessionFilter',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['getStatus', 'listSessions'],
					},
				},
				description: 'Optional filter for session names',
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
					case 'deployAgent':
						result = await TmuxOrchestrator.prototype.deployAgent(this, i);
						break;
					case 'sendMessage':
						result = await TmuxOrchestrator.prototype.sendMessage(this, i, bridge);
						break;
					case 'suggestSubagent':
						result = await TmuxOrchestrator.prototype.suggestSubagent(this, i, bridge);
						break;
					case 'captureOutput':
						result = await TmuxOrchestrator.prototype.captureOutput(this, i);
						break;
					case 'getStatus':
						result = await TmuxOrchestrator.prototype.getStatus(this, i);
						break;
					case 'listSessions':
						result = await TmuxOrchestrator.prototype.listSessions(this, i);
						break;
					case 'terminateAgent':
						result = await TmuxOrchestrator.prototype.terminateAgent(this, i);
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

	private async deployAgent(context: IExecuteFunctions, itemIndex: number): Promise<any> {
		const sessionName = context.getNodeParameter('sessionName', itemIndex) as string;
		const projectPath = context.getNodeParameter('projectPath', itemIndex, '') as string;
		const agentRole = context.getNodeParameter('agentRole', itemIndex) as string;
		const initialBriefing = context.getNodeParameter('initialBriefing', itemIndex, '') as string;

		try {
			// Create tmux session
			const createCmd = projectPath
				? `tmux new-session -d -s ${sessionName} -c "${projectPath}"`
				: `tmux new-session -d -s ${sessionName}`;
			
			execSync(createCmd);

			// Rename window based on role
			execSync(`tmux rename-window -t ${sessionName}:0 "Claude-${agentRole}"`);

			// Start Claude
			execSync(`tmux send-keys -t ${sessionName}:0 "claude" Enter`);
			
			// Wait for Claude to start
			await new Promise(resolve => setTimeout(resolve, 5000));

			// Send initial briefing if provided
			if (initialBriefing) {
				const briefing = this.formatBriefingForRole(agentRole, initialBriefing);
				execSync(`tmux send-keys -t ${sessionName}:0 "${briefing.replace(/"/g, '\\"')}" Enter`);
			}

			return {
				success: true,
				sessionName,
				window: `${sessionName}:0`,
				role: agentRole,
				projectPath,
				message: `Agent deployed successfully in session ${sessionName}`,
			};
		} catch (error) {
			throw new Error(`Failed to deploy agent: ${error.message}`);
		}
	}

	private async sendMessage(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const targetWindow = context.getNodeParameter('targetWindow', itemIndex) as string;
		const message = context.getNodeParameter('message', itemIndex) as string;

		try {
			await bridge.sendClaudeMessage(targetWindow, message);

			return {
				success: true,
				targetWindow,
				messageSent: message,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to send message: ${error.message}`);
		}
	}

	private async suggestSubagent(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const targetWindow = context.getNodeParameter('targetWindow', itemIndex) as string;
		const agentType = context.getNodeParameter('agentType', itemIndex) as 'pm' | 'developer' | 'general';
		const suggestionContext = context.getNodeParameter('suggestionContext', itemIndex, '') as string;

		try {
			await bridge.suggestSubagent(targetWindow, agentType, suggestionContext || undefined);

			return {
				success: true,
				targetWindow,
				agentType,
				context: suggestionContext,
				message: `Subagent suggestion sent to ${targetWindow}`,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to suggest subagent: ${error.message}`);
		}
	}

	private async captureOutput(context: IExecuteFunctions, itemIndex: number): Promise<any> {
		const targetWindow = context.getNodeParameter('targetWindow', itemIndex) as string;
		const numLines = context.getNodeParameter('numLines', itemIndex, 50) as number;

		try {
			const output = execSync(`tmux capture-pane -t ${targetWindow} -p -S -${numLines}`).toString();

			return {
				success: true,
				targetWindow,
				linesCaptures: numLines,
				output,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to capture output: ${error.message}`);
		}
	}

	private async getStatus(context: IExecuteFunctions, itemIndex: number): Promise<any> {
		const sessionFilter = context.getNodeParameter('sessionFilter', itemIndex, '') as string;

		try {
			// Get all sessions
			const sessionsOutput = execSync('tmux list-sessions -F "#{session_name}:#{session_attached}"').toString();
			const sessions = sessionsOutput.trim().split('\n');

			const status = [];
			for (const sessionLine of sessions) {
				if (!sessionLine) continue;
				
				const [sessionName, attached] = sessionLine.split(':');
				
				// Apply filter if provided
				if (sessionFilter && !sessionName.includes(sessionFilter)) continue;

				// Get windows for this session
				const windowsOutput = execSync(`tmux list-windows -t ${sessionName} -F "#{window_index}:#{window_name}:#{window_active}"`).toString();
				const windows = windowsOutput.trim().split('\n').map(line => {
					const [index, name, active] = line.split(':');
					return {
						index: parseInt(index),
						name,
						active: active === '1',
					};
				});

				status.push({
					sessionName,
					attached: attached === '1',
					windows,
				});
			}

			return {
				success: true,
				sessions: status,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to get status: ${error.message}`);
		}
	}

	private async listSessions(context: IExecuteFunctions, itemIndex: number): Promise<any> {
		const sessionFilter = context.getNodeParameter('sessionFilter', itemIndex, '') as string;

		try {
			const output = execSync('tmux list-sessions').toString();
			const sessions = output.trim().split('\n');

			const sessionList = sessions
				.filter(line => !sessionFilter || line.includes(sessionFilter))
				.map(line => {
					const match = line.match(/^([^:]+):/);
					return match ? match[1] : null;
				})
				.filter(Boolean);

			return {
				success: true,
				sessions: sessionList,
				count: sessionList.length,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			// No sessions running
			if (error.message.includes('no server running')) {
				return {
					success: true,
					sessions: [],
					count: 0,
					timestamp: new Date().toISOString(),
				};
			}
			throw new Error(`Failed to list sessions: ${error.message}`);
		}
	}

	private async terminateAgent(context: IExecuteFunctions, itemIndex: number): Promise<any> {
		const targetWindow = context.getNodeParameter('targetWindow', itemIndex) as string;

		try {
			// First, capture the conversation for logging
			const output = execSync(`tmux capture-pane -t ${targetWindow} -p -S -`).toString();
			
			// Kill the window
			execSync(`tmux kill-window -t ${targetWindow}`);

			return {
				success: true,
				terminatedWindow: targetWindow,
				conversationLog: output,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to terminate agent: ${error.message}`);
		}
	}

	private formatBriefingForRole(role: string, briefing: string): string {
		const roleInstructions = {
			developer: `You are a Developer agent. Focus on implementation, code quality, and technical solutions.
IMPORTANT: You have the Task tool available to deploy specialized subagents for parallel execution!
Consider using subagents for debugging (debugger), testing (test-automator), or code review (code-reviewer).`,
			projectManager: `You are a Project Manager. Maintain high standards, coordinate team members, and ensure project success.
CRITICAL: Maximize parallel execution by using the Task tool with specialized subagents!
Deploy subagents for development (developer), testing (qa-expert), and research (research-analyst).`,
			qaEngineer: `You are a QA Engineer. Focus on testing, validation, and quality assurance.
TIP: Use the Task tool to deploy subagents for comprehensive testing!
Consider test-automator for automated tests, performance-engineer for load testing, or penetration-tester for security.`,
			devops: `You are a DevOps engineer. Handle infrastructure, deployment, and operational concerns.
EFFICIENCY: Deploy subagents for specialized tasks using the Task tool!
Use kubernetes-specialist for K8s, terraform-engineer for IaC, or cloud-architect for cloud design.`,
			codeReviewer: `You are a Code Reviewer. Analyze code for quality, security, and best practices.
ACCELERATE: Use subagents to review different aspects in parallel!
Deploy security-auditor for security, performance-engineer for performance, or refactoring-specialist for improvements.`,
			docWriter: `You are a Documentation Writer. Create clear, comprehensive technical documentation.
SCALE: Use subagents to document different areas simultaneously!
Deploy api-documenter for APIs, technical-writer for guides, or research-analyst for background research.`,
		};

		const subagentReminder = `\n\nREMEMBER: Don't try to do everything yourself! Use the Task tool to deploy specialized subagents for parallel execution. This multiplies your effectiveness and accelerates delivery.`;

		return `${roleInstructions[role] || ''}\n\n${briefing}${subagentReminder}`;
	}
}