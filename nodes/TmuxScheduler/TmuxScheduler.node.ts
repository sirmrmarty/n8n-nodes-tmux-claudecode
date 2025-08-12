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
import * as fs from 'fs';
import * as path from 'path';

export class TmuxScheduler implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Tmux Scheduler',
		name: 'tmuxScheduler',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Schedule agent check-ins and automated tasks',
		defaults: {
			name: 'Tmux Scheduler',
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
						name: 'Schedule Check-In',
						value: 'scheduleCheckIn',
						description: 'Schedule a future agent check-in',
					},
					{
						name: 'Create Reminder',
						value: 'createReminder',
						description: 'Set a reminder for an agent',
					},
					{
						name: 'Manage Cron Jobs',
						value: 'manageCronJobs',
						description: 'Create or manage recurring tasks',
					},
					{
						name: 'List Scheduled Tasks',
						value: 'listScheduledTasks',
						description: 'View all scheduled tasks',
					},
					{
						name: 'Cancel Task',
						value: 'cancelTask',
						description: 'Cancel a scheduled task',
					},
					{
						name: 'Batch Schedule',
						value: 'batchSchedule',
						description: 'Schedule multiple tasks at once',
					},
				],
				default: 'scheduleCheckIn',
			},
			// Schedule Check-In parameters
			{
				displayName: 'Target Window',
				name: 'targetWindow',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['scheduleCheckIn', 'createReminder'],
					},
				},
				description: 'Target window (e.g., session:window)',
			},
			{
				displayName: 'Minutes Until Check-In',
				name: 'minutesUntil',
				type: 'number',
				default: 30,
				displayOptions: {
					show: {
						operation: ['scheduleCheckIn'],
					},
				},
				description: 'Minutes until the check-in occurs',
			},
			{
				displayName: 'Check-In Note',
				name: 'checkInNote',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['scheduleCheckIn'],
					},
				},
				description: 'Note or instructions for the check-in',
			},
			// Create Reminder parameters
			{
				displayName: 'Reminder Message',
				name: 'reminderMessage',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['createReminder'],
					},
				},
				description: 'Reminder message to send',
			},
			{
				displayName: 'Reminder Time',
				name: 'reminderTime',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						operation: ['createReminder'],
					},
				},
				description: 'When to send the reminder',
			},
			// Manage Cron Jobs parameters
			{
				displayName: 'Cron Action',
				name: 'cronAction',
				type: 'options',
				options: [
					{
						name: 'Create',
						value: 'create',
					},
					{
						name: 'List',
						value: 'list',
					},
					{
						name: 'Delete',
						value: 'delete',
					},
				],
				default: 'create',
				displayOptions: {
					show: {
						operation: ['manageCronJobs'],
					},
				},
				description: 'Cron job action to perform',
			},
			{
				displayName: 'Cron Schedule',
				name: 'cronSchedule',
				type: 'string',
				default: '0 */1 * * *',
				displayOptions: {
					show: {
						operation: ['manageCronJobs'],
						cronAction: ['create'],
					},
				},
				description: 'Cron schedule expression (e.g., "0 */1 * * *" for hourly)',
			},
			{
				displayName: 'Cron Command',
				name: 'cronCommand',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['manageCronJobs'],
						cronAction: ['create'],
					},
				},
				description: 'Command to execute on schedule',
			},
			{
				displayName: 'Cron Job ID',
				name: 'cronJobId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['manageCronJobs'],
						cronAction: ['delete'],
					},
				},
				description: 'ID of cron job to delete',
			},
			// Cancel Task parameters
			{
				displayName: 'Task ID',
				name: 'taskId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['cancelTask'],
					},
				},
				description: 'ID of the task to cancel',
			},
			// Batch Schedule parameters
			{
				displayName: 'Schedule Tasks',
				name: 'scheduleTasks',
				type: 'json',
				default: '[\n  {\n    "targetWindow": "session:0",\n    "minutes": 30,\n    "note": "Check progress"\n  }\n]',
				displayOptions: {
					show: {
						operation: ['batchSchedule'],
					},
				},
				description: 'JSON array of tasks to schedule',
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
					case 'scheduleCheckIn':
						result = await TmuxScheduler.prototype.scheduleCheckIn(this, i, bridge);
						break;
					case 'createReminder':
						result = await TmuxScheduler.prototype.createReminder(this, i, bridge);
						break;
					case 'manageCronJobs':
						result = await TmuxScheduler.prototype.manageCronJobs(this, i);
						break;
					case 'listScheduledTasks':
						result = await TmuxScheduler.prototype.listScheduledTasks();
						break;
					case 'cancelTask':
						result = await TmuxScheduler.prototype.cancelTask(this, i);
						break;
					case 'batchSchedule':
						result = await TmuxScheduler.prototype.batchSchedule(this, i, bridge);
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

	private async scheduleCheckIn(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const targetWindow = context.getNodeParameter('targetWindow', itemIndex) as string;
		const minutesUntil = context.getNodeParameter('minutesUntil', itemIndex) as number;
		const checkInNote = context.getNodeParameter('checkInNote', itemIndex, '') as string;

		try {
			// Use the schedule_with_note.sh script
			const success = await bridge.scheduleCheckIn(minutesUntil, checkInNote, targetWindow);
			
			if (!success) {
				// Fallback to at command
				const scheduledTime = new Date(Date.now() + minutesUntil * 60000);
				const atTime = scheduledTime.toTimeString().slice(0, 5);
				
				// Try to get the send-claude-message script path
				try {
					const pathResolver = new PathResolver();
					// Get external scripts dir from credentials if available
					let externalDir: string | undefined;
					try {
						const credentials = await context.getCredentials('tmuxOrchestratorApi');
						if (credentials?.useExternalScripts && credentials?.scriptsDirectory) {
							externalDir = credentials.scriptsDirectory as string;
						}
					} catch {
						// No credentials configured
					}
					const scriptPath = pathResolver.getScriptPath('send-claude-message.sh', externalDir);
					const command = `echo "${scriptPath} ${targetWindow} 'SCHEDULED CHECK-IN: ${checkInNote}'" | at ${atTime}`;
					execSync(command);
				} catch {
					// If script not found, throw error
					throw new Error('Unable to schedule check-in: send-claude-message.sh script not found');
				}
			}

			return {
				success: true,
				targetWindow,
				minutesUntil,
				scheduledTime: new Date(Date.now() + minutesUntil * 60000).toISOString(),
				note: checkInNote,
				message: `Check-in scheduled for ${targetWindow} in ${minutesUntil} minutes`,
			};
		} catch (error) {
			throw new Error(`Failed to schedule check-in: ${error.message}`);
		}
	}

	private async createReminder(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const targetWindow = context.getNodeParameter('targetWindow', itemIndex) as string;
		const reminderMessage = context.getNodeParameter('reminderMessage', itemIndex) as string;
		const reminderTime = context.getNodeParameter('reminderTime', itemIndex, '') as string;

		try {
			let scheduledTime: Date;
			let minutesUntil: number;

			if (reminderTime) {
				scheduledTime = new Date(reminderTime);
				minutesUntil = Math.floor((scheduledTime.getTime() - Date.now()) / 60000);
			} else {
				// Default to 30 minutes
				minutesUntil = 30;
				scheduledTime = new Date(Date.now() + minutesUntil * 60000);
			}

			if (minutesUntil <= 0) {
				throw new Error('Reminder time must be in the future');
			}

			// Schedule the reminder
			const reminderNote = `REMINDER: ${reminderMessage}`;
			const success = await bridge.scheduleCheckIn(minutesUntil, reminderNote, targetWindow);

			// Also save to a reminders file for tracking
			const remindersFile = '/tmp/tmux-reminders.json';
			let reminders = [];
			
			if (fs.existsSync(remindersFile)) {
				const content = fs.readFileSync(remindersFile, 'utf8');
				reminders = JSON.parse(content);
			}

			const reminderId = `REM-${Date.now()}`;
			reminders.push({
				id: reminderId,
				targetWindow,
				message: reminderMessage,
				scheduledTime: scheduledTime.toISOString(),
				createdAt: new Date().toISOString(),
			});

			fs.writeFileSync(remindersFile, JSON.stringify(reminders, null, 2));

			return {
				success: true,
				reminderId,
				targetWindow,
				message: reminderMessage,
				scheduledTime: scheduledTime.toISOString(),
				minutesUntil,
			};
		} catch (error) {
			throw new Error(`Failed to create reminder: ${error.message}`);
		}
	}

	private async manageCronJobs(context: IExecuteFunctions, itemIndex: number): Promise<any> {
		const cronAction = context.getNodeParameter('cronAction', itemIndex) as string;

		try {
			switch (cronAction) {
				case 'create':
					return await TmuxScheduler.prototype.createCronJob(context, itemIndex);
				case 'list':
					return await TmuxScheduler.prototype.listCronJobs();
				case 'delete':
					return await TmuxScheduler.prototype.deleteCronJob(context, itemIndex);
				default:
					throw new Error(`Unknown cron action: ${cronAction}`);
			}
		} catch (error) {
			throw new Error(`Failed to manage cron jobs: ${error.message}`);
		}
	}

	private async createCronJob(context: IExecuteFunctions, itemIndex: number): Promise<any> {
		const cronSchedule = context.getNodeParameter('cronSchedule', itemIndex) as string;
		const cronCommand = context.getNodeParameter('cronCommand', itemIndex) as string;

		try {
			// Create a unique identifier for this cron job
			const cronId = `TMUX-CRON-${Date.now()}`;
			
			// Prepare the cron entry
			const cronEntry = `${cronSchedule} ${cronCommand} # ${cronId}`;
			
			// Add to crontab
			const currentCrontab = execSync('crontab -l 2>/dev/null || true').toString();
			const newCrontab = currentCrontab + '\n' + cronEntry;
			
			// Write new crontab
			const tempFile = `/tmp/crontab-${Date.now()}`;
			fs.writeFileSync(tempFile, newCrontab);
			execSync(`crontab ${tempFile}`);
			fs.unlinkSync(tempFile);

			return {
				success: true,
				cronId,
				schedule: cronSchedule,
				command: cronCommand,
				message: 'Cron job created successfully',
			};
		} catch (error) {
			throw new Error(`Failed to create cron job: ${error.message}`);
		}
	}

	private async listCronJobs(): Promise<any> {
		try {
			const crontab = execSync('crontab -l 2>/dev/null || true').toString();
			const lines = crontab.split('\n').filter((line: string) => line.trim() && !line.startsWith('#'));
			
			const cronJobs = lines.map((line: string) => {
				const match = line.match(/^([\S\s]+?)\s+#\s*(TMUX-CRON-\d+)$/);
				if (match) {
					const parts = match[1].split(/\s+/);
					const schedule = parts.slice(0, 5).join(' ');
					const command = parts.slice(5).join(' ');
					return {
						id: match[2],
						schedule,
						command,
						raw: line,
					};
				}
				return {
					schedule: 'Unknown',
					command: line,
					raw: line,
				};
			});

			return {
				success: true,
				count: cronJobs.length,
				cronJobs,
			};
		} catch (error) {
			throw new Error(`Failed to list cron jobs: ${error.message}`);
		}
	}

	private async deleteCronJob(context: IExecuteFunctions, itemIndex: number): Promise<any> {
		const cronJobId = context.getNodeParameter('cronJobId', itemIndex) as string;

		try {
			const currentCrontab = execSync('crontab -l 2>/dev/null || true').toString();
			const lines = currentCrontab.split('\n');
			const filteredLines = lines.filter((line: string) => !line.includes(cronJobId));
			
			if (lines.length === filteredLines.length) {
				throw new Error(`Cron job ${cronJobId} not found`);
			}

			// Write updated crontab
			const tempFile = `/tmp/crontab-${Date.now()}`;
			fs.writeFileSync(tempFile, filteredLines.join('\n'));
			execSync(`crontab ${tempFile}`);
			fs.unlinkSync(tempFile);

			return {
				success: true,
				deletedId: cronJobId,
				message: 'Cron job deleted successfully',
			};
		} catch (error) {
			throw new Error(`Failed to delete cron job: ${error.message}`);
		}
	}

	private async listScheduledTasks(): Promise<any> {
		try {
			const tasks = {
				atJobs: [],
				cronJobs: [],
				reminders: [],
			};

			// Get at jobs
			try {
				const atOutput = execSync('atq').toString();
				const lines = atOutput.trim().split('\n');
				tasks.atJobs = lines.map((line: string) => {
					const parts = line.split(/\s+/);
					return {
						jobId: parts[0],
						scheduledTime: parts.slice(1, 6).join(' '),
						queue: parts[6],
						user: parts[7],
					};
				});
			} catch (e) {
				// at command might not be available
			}

			// Get cron jobs
			try {
				const cronResult = await this.listCronJobs();
				tasks.cronJobs = cronResult.cronJobs;
			} catch (e) {
				// Cron might not be available
			}

			// Get reminders
			const remindersFile = '/tmp/tmux-reminders.json';
			if (fs.existsSync(remindersFile)) {
				const content = fs.readFileSync(remindersFile, 'utf8');
				tasks.reminders = JSON.parse(content);
			}

			return {
				success: true,
				tasks,
				totalScheduled: tasks.atJobs.length + tasks.cronJobs.length + tasks.reminders.length,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to list scheduled tasks: ${error.message}`);
		}
	}

	private async cancelTask(context: IExecuteFunctions, itemIndex: number): Promise<any> {
		const taskId = context.getNodeParameter('taskId', itemIndex) as string;

		try {
			let cancelled = false;
			let taskType = '';

			// Try to cancel as at job
			try {
				execSync(`atrm ${taskId}`);
				cancelled = true;
				taskType = 'at job';
			} catch (e) {
				// Not an at job
			}

			// Try to cancel as reminder
			if (!cancelled) {
				const remindersFile = '/tmp/tmux-reminders.json';
				if (fs.existsSync(remindersFile)) {
					const content = fs.readFileSync(remindersFile, 'utf8');
					let reminders = JSON.parse(content);
					const originalLength = reminders.length;
					reminders = reminders.filter(r => r.id !== taskId);
					
					if (reminders.length < originalLength) {
						fs.writeFileSync(remindersFile, JSON.stringify(reminders, null, 2));
						cancelled = true;
						taskType = 'reminder';
					}
				}
			}

			// Try to cancel as cron job
			if (!cancelled && taskId.startsWith('TMUX-CRON-')) {
				await TmuxScheduler.prototype.deleteCronJob(context, itemIndex);
				cancelled = true;
				taskType = 'cron job';
			}

			if (!cancelled) {
				throw new Error(`Task ${taskId} not found`);
			}

			return {
				success: true,
				cancelledTaskId: taskId,
				taskType,
				message: `${taskType} cancelled successfully`,
			};
		} catch (error) {
			throw new Error(`Failed to cancel task: ${error.message}`);
		}
	}

	private async batchSchedule(context: IExecuteFunctions, itemIndex: number, bridge: TmuxBridge): Promise<any> {
		const scheduleTasks = context.getNodeParameter('scheduleTasks', itemIndex) as string;

		try {
			const tasks = JSON.parse(scheduleTasks);
			if (!Array.isArray(tasks)) {
				throw new Error('Schedule tasks must be an array');
			}

			const results = [];

			for (const task of tasks) {
				if (!task.targetWindow || !task.minutes) {
					results.push({
						error: 'Missing required fields: targetWindow and minutes',
						task,
					});
					continue;
				}

				try {
					const success = await bridge.scheduleCheckIn(
						task.minutes,
						task.note || 'Batch scheduled check-in',
						task.targetWindow
					);

					results.push({
						success: true,
						targetWindow: task.targetWindow,
						minutes: task.minutes,
						note: task.note,
						scheduledTime: new Date(Date.now() + task.minutes * 60000).toISOString(),
					});
				} catch (error) {
					results.push({
						error: error.message,
						task,
					});
				}
			}

			const successCount = results.filter((r: any) => r.success).length;
			const failureCount = results.filter((r: any) => r.error).length;

			return {
				success: true,
				totalTasks: tasks.length,
				successCount,
				failureCount,
				results,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to batch schedule: ${error.message}`);
		}
	}
}