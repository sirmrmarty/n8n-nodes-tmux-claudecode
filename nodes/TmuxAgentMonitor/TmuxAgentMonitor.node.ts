import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { TmuxBridge, TmuxBridgeConfig } from '../../utils/tmuxBridge';
import { PathResolver } from '../../utils/paths';

export class TmuxAgentMonitor implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Tmux Agent Monitor',
		name: 'tmuxAgentMonitor',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Monitor and analyze tmux agent activity and health',
		defaults: {
			name: 'Tmux Agent Monitor',
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
						name: 'List All Sessions',
						value: 'listAllSessions',
						description: 'Get all active tmux sessions with details',
					},
					{
						name: 'Health Check',
						value: 'healthCheck',
						description: 'Check agent responsiveness and health',
					},
					{
						name: 'Collect Logs',
						value: 'collectLogs',
						description: 'Aggregate agent conversation logs',
					},
					{
						name: 'Detect Blockers',
						value: 'detectBlockers',
						description: 'Identify stuck or blocked agents',
					},
					{
						name: 'Monitor Snapshot',
						value: 'monitorSnapshot',
						description: 'Create comprehensive monitoring snapshot',
					},
					{
						name: 'Find Windows',
						value: 'findWindows',
						description: 'Find windows by name pattern',
					},
					{
						name: 'Activity Report',
						value: 'activityReport',
						description: 'Generate activity report for sessions',
					},
					{
						name: 'Check Subagent Opportunities',
						value: 'checkSubagentOpportunities',
						description: 'Identify agents that could benefit from subagent help',
					},
				],
				default: 'listAllSessions',
			},
			// Health Check parameters
			{
				displayName: 'Target Sessions',
				name: 'targetSessions',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['healthCheck', 'collectLogs', 'detectBlockers', 'activityReport'],
					},
				},
				description: 'Comma-separated list of sessions to check (leave empty for all)',
			},
			{
				displayName: 'Response Timeout',
				name: 'responseTimeout',
				type: 'number',
				default: 10,
				displayOptions: {
					show: {
						operation: ['healthCheck'],
					},
				},
				description: 'Seconds to wait for agent response',
			},
			// Collect Logs parameters
			{
				displayName: 'Lines Per Window',
				name: 'linesPerWindow',
				type: 'number',
				default: 100,
				displayOptions: {
					show: {
						operation: ['collectLogs'],
					},
				},
				description: 'Number of lines to collect from each window',
			},
			{
				displayName: 'Save to File',
				name: 'saveToFile',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['collectLogs'],
					},
				},
				description: 'Save logs to files',
			},
			{
				displayName: 'Output Directory',
				name: 'outputDirectory',
				type: 'string',
				default: '/tmp/tmux-logs',
				displayOptions: {
					show: {
						operation: ['collectLogs'],
						saveToFile: [true],
					},
				},
				description: 'Directory to save log files',
			},
			// Detect Blockers parameters
			{
				displayName: 'Inactivity Threshold',
				name: 'inactivityThreshold',
				type: 'number',
				default: 300,
				displayOptions: {
					show: {
						operation: ['detectBlockers'],
					},
				},
				description: 'Seconds of inactivity to consider agent blocked',
			},
			{
				displayName: 'Error Keywords',
				name: 'errorKeywords',
				type: 'string',
				default: 'error,failed,exception,blocked,stuck,waiting',
				displayOptions: {
					show: {
						operation: ['detectBlockers'],
					},
				},
				description: 'Comma-separated keywords to detect issues',
			},
			// Find Windows parameters
			{
				displayName: 'Window Pattern',
				name: 'windowPattern',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['findWindows'],
					},
				},
				description: 'Pattern to search for in window names',
			},
			// Activity Report parameters
			{
				displayName: 'Report Period',
				name: 'reportPeriod',
				type: 'options',
				options: [
					{
						name: 'Last Hour',
						value: 'hour',
					},
					{
						name: 'Last 24 Hours',
						value: 'day',
					},
					{
						name: 'Last Week',
						value: 'week',
					},
					{
						name: 'All Time',
						value: 'all',
					},
				],
				default: 'hour',
				displayOptions: {
					show: {
						operation: ['activityReport'],
					},
				},
				description: 'Time period for activity report',
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
					case 'listAllSessions':
						result = await TmuxAgentMonitor.prototype.listAllSessions(this, bridge);
						break;
					case 'healthCheck':
						result = await TmuxAgentMonitor.prototype.healthCheck(this, i, bridge);
						break;
					case 'collectLogs':
						result = await TmuxAgentMonitor.prototype.collectLogs(this, i, bridge);
						break;
					case 'detectBlockers':
						result = await TmuxAgentMonitor.prototype.detectBlockers(this, i, bridge);
						break;
					case 'monitorSnapshot':
						result = await TmuxAgentMonitor.prototype.monitorSnapshot(this, bridge);
						break;
					case 'findWindows':
						result = await TmuxAgentMonitor.prototype.findWindows(this, i, bridge);
						break;
					case 'activityReport':
						result = await TmuxAgentMonitor.prototype.activityReport(this, i, bridge);
						break;
					case 'checkSubagentOpportunities':
						result = await TmuxAgentMonitor.prototype.checkSubagentOpportunities(this, i, bridge);
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

	private async listAllSessions(context: IExecuteFunctions, bridge: TmuxBridge): Promise<any> {
		try {
			const sessions = await bridge.getTmuxSessions();
			
			const sessionDetails = sessions.map(session => ({
				name: session.name,
				attached: session.attached,
				windowCount: session.windows.length,
				windows: session.windows.map(w => ({
					index: w.windowIndex,
					name: w.windowName,
					active: w.active,
				})),
			}));

			return {
				success: true,
				sessionCount: sessions.length,
				sessions: sessionDetails,
				totalWindows: sessions.reduce((sum, s) => sum + s.windows.length, 0),
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to list sessions: ${error.message}`);
		}
	}

	private async healthCheck(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const targetSessions = context.getNodeParameter('targetSessions', itemIndex, '') as string;
		const responseTimeout = context.getNodeParameter('responseTimeout', itemIndex, 10) as number;

		try {
			const sessions = await bridge.getTmuxSessions();
			const sessionsToCheck = targetSessions
				? sessions.filter(s => targetSessions.split(',').includes(s.name.trim()))
				: sessions;

			const healthResults = [];

			for (const session of sessionsToCheck) {
				for (const window of session.windows) {
					// Send health check ping
					const pingMessage = `HEALTH CHECK: Please respond with "ACK" if you are operational.`;
					await bridge.sendClaudeMessage(`${session.name}:${window.windowIndex}`, pingMessage);
				}
			}

			// Wait for responses
			await new Promise(resolve => setTimeout(resolve, responseTimeout * 1000));

			// Check responses
			for (const session of sessionsToCheck) {
				for (const window of session.windows) {
					const output = await bridge.captureWindowContent(session.name, window.windowIndex, 20);
					
					// Safely process the captured output with type checking
					let lastLines: string;
					try {
						if (typeof output === 'string' && output.length > 0) {
							lastLines = output.split('\n').slice(-10).join('\n');
						} else {
							lastLines = output ? `Health data in unexpected format: ${typeof output}` : 'No health data available';
						}
					} catch (error) {
						lastLines = `Error processing health data: ${error.message}`;
					}
					
					const isHealthy = lastLines.includes('ACK') || lastLines.includes('operational');
					const hasErrors = /error|exception|failed/i.test(lastLines);
					
					healthResults.push({
						session: session.name,
						window: window.windowName,
						windowIndex: window.windowIndex,
						healthy: isHealthy,
						hasErrors,
						responded: lastLines.includes('HEALTH CHECK'),
						lastActivity: lastLines.substring(0, 200),
					});
				}
			}

			const healthySummary = {
				totalChecked: healthResults.length,
				healthy: healthResults.filter(r => r.healthy).length,
				unhealthy: healthResults.filter(r => !r.healthy).length,
				errors: healthResults.filter(r => r.hasErrors).length,
			};

			return {
				success: true,
				summary: healthySummary,
				details: healthResults,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Health check failed: ${error.message}`);
		}
	}

	private async collectLogs(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const targetSessions = context.getNodeParameter('targetSessions', itemIndex, '') as string;
		const linesPerWindow = context.getNodeParameter('linesPerWindow', itemIndex, 100) as number;
		const saveToFile = context.getNodeParameter('saveToFile', itemIndex, false) as boolean;
		const outputDirectory = context.getNodeParameter('outputDirectory', itemIndex, '/tmp/tmux-logs') as string;

		try {
			const sessions = await bridge.getTmuxSessions();
			const sessionsToLog = targetSessions
				? sessions.filter(s => targetSessions.split(',').includes(s.name.trim()))
				: sessions;

			const logs = [];
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

			for (const session of sessionsToLog) {
				for (const window of session.windows) {
					const content = await bridge.captureWindowContent(
						session.name,
						window.windowIndex,
						linesPerWindow
					);

					const logEntry = {
						session: session.name,
						window: window.windowName,
						windowIndex: window.windowIndex,
						timestamp: new Date().toISOString(),
						content,
					};

					logs.push(logEntry);

					if (saveToFile) {
						const fs = require('fs');
						const path = require('path');
						
						// Create directory if it doesn't exist
						if (!fs.existsSync(outputDirectory)) {
							fs.mkdirSync(outputDirectory, { recursive: true });
						}

						const filename = `${session.name}_${window.windowName}_${timestamp}.log`;
						const filepath = path.join(outputDirectory, filename);
						
						fs.writeFileSync(filepath, content);
						logEntry['savedTo'] = filepath;
					}
				}
			}

			return {
				success: true,
				logsCollected: logs.length,
				logs: logs.map(l => ({
					...l,
					content: l.content.substring(0, 500) + '...', // Truncate for response
				})),
				savedToFiles: saveToFile,
				outputDirectory: saveToFile ? outputDirectory : null,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to collect logs: ${error.message}`);
		}
	}

	private async detectBlockers(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const targetSessions = context.getNodeParameter('targetSessions', itemIndex, '') as string;
		const inactivityThreshold = context.getNodeParameter('inactivityThreshold', itemIndex, 300) as number;
		const errorKeywords = context.getNodeParameter('errorKeywords', itemIndex, 'error,failed,exception,blocked,stuck,waiting') as string;

		try {
			const sessions = await bridge.getTmuxSessions();
			const sessionsToCheck = targetSessions
				? sessions.filter(s => targetSessions.split(',').includes(s.name.trim()))
				: sessions;

			const keywords = errorKeywords.split(',').map(k => k.trim());
			const blockers = [];

			for (const session of sessionsToCheck) {
				for (const window of session.windows) {
					const content = await bridge.captureWindowContent(
						session.name,
						window.windowIndex,
						100
					);

					// Safely process the captured content with type checking
					let lines: string[] = [];
					let recentLines: string[] = [];
					
					try {
						if (typeof content === 'string' && content.length > 0) {
							lines = content.split('\n');
							recentLines = lines.slice(-20);
						} else if (content) {
							lines = [];
							recentLines = [];
						}
					} catch (error) {
						lines = [];
						recentLines = [];
					}
					
					// Check for error keywords
					const foundKeywords = [];
					for (const keyword of keywords) {
						if (recentLines.some(line => line.toLowerCase().includes(keyword.toLowerCase()))) {
							foundKeywords.push(keyword);
						}
					}

					// Check for repetitive patterns (might indicate stuck state)
					const uniqueLines = new Set(recentLines.filter(l => l.trim()));
					const repetitionRatio = uniqueLines.size / recentLines.length;
					const isRepetitive = repetitionRatio < 0.3; // Less than 30% unique lines

					// Check if waiting for input
					const waitingForInput = recentLines.some(line => 
						/waiting|input|enter|continue|proceed|y\/n|yes\/no/i.test(line)
					);

					if (foundKeywords.length > 0 || isRepetitive || waitingForInput) {
						blockers.push({
							session: session.name,
							window: window.windowName,
							windowIndex: window.windowIndex,
							blockerType: foundKeywords.length > 0 ? 'error' : 
										isRepetitive ? 'repetitive' : 'waiting',
							foundKeywords,
							isRepetitive,
							waitingForInput,
							context: recentLines.length > 0 ? recentLines.slice(-10).join('\n') : 'No context available',
							suggestedAction: this.getSuggestedAction(foundKeywords, isRepetitive, waitingForInput),
						});
					}
				}
			}

			return {
				success: true,
				blockersFound: blockers.length,
				blockers,
				checkedSessions: sessionsToCheck.length,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to detect blockers: ${error.message}`);
		}
	}

	private async monitorSnapshot(context: IExecuteFunctions, bridge: TmuxBridge): Promise<any> {
		try {
			const snapshot = await bridge.createMonitoringSnapshot();
			const status = await bridge.getAllWindowsStatus();

			// Analyze the snapshot for insights
			const insights = this.analyzeSnapshot(status);

			return {
				success: true,
				snapshot,
				status,
				insights,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to create monitoring snapshot: ${error.message}`);
		}
	}

	private async findWindows(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const windowPattern = context.getNodeParameter('windowPattern', itemIndex) as string;

		try {
			const matches = await bridge.findWindowByName(windowPattern);
			
			const results = matches.map(([sessionName, windowIndex]) => ({
				session: sessionName,
				windowIndex,
				target: `${sessionName}:${windowIndex}`,
			}));

			return {
				success: true,
				pattern: windowPattern,
				matchCount: results.length,
				matches: results,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to find windows: ${error.message}`);
		}
	}

	private async activityReport(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const targetSessions = context.getNodeParameter('targetSessions', itemIndex, '') as string;
		const reportPeriod = context.getNodeParameter('reportPeriod', itemIndex, 'hour') as string;

		try {
			const sessions = await bridge.getTmuxSessions();
			const sessionsToReport = targetSessions
				? sessions.filter(s => targetSessions.split(',').includes(s.name.trim()))
				: sessions;

			const activityData = [];

			for (const session of sessionsToReport) {
				const sessionActivity = {
					session: session.name,
					attached: session.attached,
					windows: [],
				};

				for (const window of session.windows) {
					const content = await bridge.captureWindowContent(
						session.name,
						window.windowIndex,
						200
					);

					// Safely process the captured content with type checking
					let lines: string[] = [];
					
					try {
						if (typeof content === 'string' && content.length > 0) {
							lines = content.split('\n');
						} else if (content) {
							lines = [];
						}
					} catch (error) {
						lines = [];
					}
					
					const nonEmptyLines = lines.filter(l => l.trim()).length;
					const commandCount = lines.filter(l => l.startsWith('$') || l.startsWith('>')).length;
					const errorCount = lines.filter(l => /error|exception|failed/i.test(l)).length;

					sessionActivity.windows.push({
						name: window.windowName,
						index: window.windowIndex,
						active: window.active,
						activityLevel: nonEmptyLines,
						commandsExecuted: commandCount,
						errorsDetected: errorCount,
						lastActivity: lines.length > 0 ? lines.slice(-5).join('\n') : 'No activity available',
					});
				}

				activityData.push(sessionActivity);
			}

			// Calculate summary statistics
			const summary = {
				totalSessions: activityData.length,
				totalWindows: activityData.reduce((sum, s) => sum + s.windows.length, 0),
				activeWindows: activityData.reduce((sum, s) => 
					sum + s.windows.filter(w => w.active).length, 0
				),
				totalCommands: activityData.reduce((sum, s) => 
					sum + s.windows.reduce((wSum, w) => wSum + w.commandsExecuted, 0), 0
				),
				totalErrors: activityData.reduce((sum, s) => 
					sum + s.windows.reduce((wSum, w) => wSum + w.errorsDetected, 0), 0
				),
			};

			return {
				success: true,
				reportPeriod,
				summary,
				activityData,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to generate activity report: ${error.message}`);
		}
	}

	private getSuggestedAction(keywords: string[], isRepetitive: boolean, waitingForInput: boolean): string {
		if (keywords.includes('error') || keywords.includes('exception')) {
			return 'Check error logs and restart agent if necessary';
		}
		if (keywords.includes('blocked') || keywords.includes('stuck')) {
			return 'Agent may be blocked. Check dependencies or restart task';
		}
		if (waitingForInput) {
			return 'Agent waiting for input. Provide required information or cancel operation';
		}
		if (isRepetitive) {
			return 'Agent may be in a loop. Interrupt and provide new instructions';
		}
		return 'Monitor agent and provide assistance if needed';
	}

	private async checkSubagentOpportunities(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const targetSessions = context.getNodeParameter('targetSessions', itemIndex, '') as string;

		try {
			const sessions = await bridge.getTmuxSessions();
			const sessionsToCheck = targetSessions
				? sessions.filter(s => targetSessions.split(',').includes(s.name.trim()))
				: sessions;

			const opportunities = [];
			const subagentKeywords = [
				'complex', 'multiple', 'stuck', 'debugging', 'overwhelmed', 
				'taking too long', 'need help', 'complicated', 'many tasks',
				'parallel', 'simultaneously', 'at the same time'
			];

			for (const session of sessionsToCheck) {
				for (const window of session.windows) {
					const content = await bridge.captureWindowContent(
						session.name,
						window.windowIndex,
						100
					);

					// Safely process the captured content with type checking
					let lines: string[] = [];
					let recentLines = '';
					
					try {
						if (typeof content === 'string' && content.length > 0) {
							lines = content.split('\n');
							recentLines = lines.slice(-50).join(' ').toLowerCase();
						} else if (content) {
							lines = [];
							recentLines = `subagent opportunity data in unexpected format: ${typeof content}`.toLowerCase();
						}
					} catch (error) {
						lines = [];
						recentLines = `error processing subagent opportunity data: ${error.message}`.toLowerCase();
					}
					
					// Check for subagent opportunity indicators
					const foundKeywords = subagentKeywords.filter(kw => recentLines.includes(kw));
					
					// Check for signs of being stuck (repetitive output)
					const uniqueLines = new Set(lines.length > 0 ? lines.slice(-20).filter(l => l.trim()) : []);
					const isRepetitive = lines.length > 0 && uniqueLines.size < 5;
					
					// Check for long-running tasks (lots of output without completion)
					const hasLongRunning = lines.length > 80 && !recentLines.includes('complete') && !recentLines.includes('done');
					
					// Determine agent type from window name
					let agentType = 'general';
					if (window.windowName.toLowerCase().includes('manager')) {
						agentType = 'pm';
					} else if (window.windowName.toLowerCase().includes('developer') || 
							   window.windowName.toLowerCase().includes('engineer')) {
						agentType = 'developer';
					}
					
					if (foundKeywords.length > 0 || isRepetitive || hasLongRunning) {
						opportunities.push({
							session: session.name,
							window: window.windowName,
							windowIndex: window.windowIndex,
							target: `${session.name}:${window.windowIndex}`,
							agentType,
							indicators: {
								keywords: foundKeywords,
								isRepetitive,
								hasLongRunning,
							},
							suggestedSubagents: this.getSuggestedSubagents(foundKeywords, agentType),
							recommendedAction: `Send subagent suggestion to ${session.name}:${window.windowIndex}`,
						});
					}
				}
			}

			return {
				success: true,
				opportunitiesFound: opportunities.length,
				opportunities,
				checkedSessions: sessionsToCheck.length,
				recommendation: opportunities.length > 0 
					? 'Deploy subagent suggestions to identified agents to improve parallel execution'
					: 'All agents appear to be working efficiently',
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to check subagent opportunities: ${error.message}`);
		}
	}

	private getSuggestedSubagents(keywords: string[], agentType: string): string[] {
		const suggestions = [];
		
		if (keywords.includes('debugging') || keywords.includes('stuck')) {
			suggestions.push('debugger', 'error-detective');
		}
		if (keywords.includes('complex') || keywords.includes('complicated')) {
			suggestions.push('research-analyst', 'search-specialist');
		}
		if (keywords.includes('multiple') || keywords.includes('parallel')) {
			if (agentType === 'pm') {
				suggestions.push('developer', 'qa-expert', 'technical-writer');
			} else {
				suggestions.push('test-automator', 'code-reviewer');
			}
		}
		if (keywords.includes('overwhelmed') || keywords.includes('taking too long')) {
			suggestions.push('fullstack-developer', 'performance-engineer');
		}
		
		// Default suggestions based on agent type
		if (suggestions.length === 0) {
			if (agentType === 'pm') {
				suggestions.push('developer', 'qa-expert');
			} else if (agentType === 'developer') {
				suggestions.push('debugger', 'test-automator');
			} else {
				suggestions.push('research-analyst', 'assistant');
			}
		}
		
		return [...new Set(suggestions)]; // Remove duplicates
	}

	private analyzeSnapshot(status: any): any {
		const insights = {
			totalSessions: status.sessions?.length || 0,
			attachedSessions: status.sessions?.filter(s => s.attached).length || 0,
			totalWindows: 0,
			activeWindows: 0,
			recommendations: [],
		};

		if (status.sessions) {
			for (const session of status.sessions) {
				insights.totalWindows += session.windows?.length || 0;
				insights.activeWindows += session.windows?.filter(w => w.active).length || 0;
			}
		}

		// Generate recommendations
		if (insights.totalSessions > 10) {
			insights.recommendations.push('High number of sessions. Consider consolidating or terminating idle sessions.');
		}
		if (insights.attachedSessions === 0 && insights.totalSessions > 0) {
			insights.recommendations.push('No attached sessions. Agents running in background only.');
		}
		if (insights.totalWindows > 50) {
			insights.recommendations.push('Large number of windows. Review and close unnecessary windows.');
		}

		return insights;
	}
}