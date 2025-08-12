"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TmuxScheduler = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const child_process_1 = require("child_process");
const tmuxBridge_1 = require("../../utils/tmuxBridge");
const paths_1 = require("../../utils/paths");
const fs = __importStar(require("fs"));
class TmuxScheduler {
    constructor() {
        this.description = {
            displayName: 'Tmux Scheduler',
            name: 'tmuxScheduler',
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["operation"]}}',
            description: 'Schedule agent check-ins and automated tasks',
            defaults: {
                name: 'Tmux Scheduler',
            },
            inputs: ["main"],
            outputs: ["main"],
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
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        const operation = this.getNodeParameter('operation', 0);
        let bridgeConfig = {};
        try {
            const credentials = await this.getCredentials('tmuxOrchestratorApi');
            if (credentials?.useExternalScripts && credentials?.scriptsDirectory) {
                bridgeConfig.externalScriptsDir = credentials.scriptsDirectory;
            }
            if (credentials?.projectBasePath) {
                bridgeConfig.projectBasePath = credentials.projectBasePath;
            }
        }
        catch {
        }
        const bridge = new tmuxBridge_1.TmuxBridge(bridgeConfig);
        for (let i = 0; i < items.length; i++) {
            try {
                let result = {};
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
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: { error: error.message },
                        pairedItem: i,
                    });
                }
                else {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), error, {
                        itemIndex: i,
                    });
                }
            }
        }
        return [returnData];
    }
    async scheduleCheckIn(context, itemIndex, bridge) {
        const targetWindow = context.getNodeParameter('targetWindow', itemIndex);
        const minutesUntil = context.getNodeParameter('minutesUntil', itemIndex);
        const checkInNote = context.getNodeParameter('checkInNote', itemIndex, '');
        try {
            const success = await bridge.scheduleCheckIn(minutesUntil, checkInNote, targetWindow);
            if (!success) {
                const scheduledTime = new Date(Date.now() + minutesUntil * 60000);
                const atTime = scheduledTime.toTimeString().slice(0, 5);
                try {
                    const pathResolver = new paths_1.PathResolver();
                    let externalDir;
                    try {
                        const credentials = await context.getCredentials('tmuxOrchestratorApi');
                        if (credentials?.useExternalScripts && credentials?.scriptsDirectory) {
                            externalDir = credentials.scriptsDirectory;
                        }
                    }
                    catch {
                    }
                    const scriptPath = pathResolver.getScriptPath('send-claude-message.sh', externalDir);
                    const command = `echo "${scriptPath} ${targetWindow} 'SCHEDULED CHECK-IN: ${checkInNote}'" | at ${atTime}`;
                    (0, child_process_1.execSync)(command);
                }
                catch {
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
        }
        catch (error) {
            throw new Error(`Failed to schedule check-in: ${error.message}`);
        }
    }
    async createReminder(context, itemIndex, bridge) {
        const targetWindow = context.getNodeParameter('targetWindow', itemIndex);
        const reminderMessage = context.getNodeParameter('reminderMessage', itemIndex);
        const reminderTime = context.getNodeParameter('reminderTime', itemIndex, '');
        try {
            let scheduledTime;
            let minutesUntil;
            if (reminderTime) {
                scheduledTime = new Date(reminderTime);
                minutesUntil = Math.floor((scheduledTime.getTime() - Date.now()) / 60000);
            }
            else {
                minutesUntil = 30;
                scheduledTime = new Date(Date.now() + minutesUntil * 60000);
            }
            if (minutesUntil <= 0) {
                throw new Error('Reminder time must be in the future');
            }
            const reminderNote = `REMINDER: ${reminderMessage}`;
            const success = await bridge.scheduleCheckIn(minutesUntil, reminderNote, targetWindow);
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
        }
        catch (error) {
            throw new Error(`Failed to create reminder: ${error.message}`);
        }
    }
    async manageCronJobs(context, itemIndex) {
        const cronAction = context.getNodeParameter('cronAction', itemIndex);
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
        }
        catch (error) {
            throw new Error(`Failed to manage cron jobs: ${error.message}`);
        }
    }
    async createCronJob(context, itemIndex) {
        const cronSchedule = context.getNodeParameter('cronSchedule', itemIndex);
        const cronCommand = context.getNodeParameter('cronCommand', itemIndex);
        try {
            const cronId = `TMUX-CRON-${Date.now()}`;
            const cronEntry = `${cronSchedule} ${cronCommand} # ${cronId}`;
            const currentCrontab = (0, child_process_1.execSync)('crontab -l 2>/dev/null || true').toString();
            const newCrontab = currentCrontab + '\n' + cronEntry;
            const tempFile = `/tmp/crontab-${Date.now()}`;
            fs.writeFileSync(tempFile, newCrontab);
            (0, child_process_1.execSync)(`crontab ${tempFile}`);
            fs.unlinkSync(tempFile);
            return {
                success: true,
                cronId,
                schedule: cronSchedule,
                command: cronCommand,
                message: 'Cron job created successfully',
            };
        }
        catch (error) {
            throw new Error(`Failed to create cron job: ${error.message}`);
        }
    }
    async listCronJobs() {
        try {
            const crontab = (0, child_process_1.execSync)('crontab -l 2>/dev/null || true').toString();
            const lines = crontab.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
            const cronJobs = lines.map((line) => {
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
        }
        catch (error) {
            throw new Error(`Failed to list cron jobs: ${error.message}`);
        }
    }
    async deleteCronJob(context, itemIndex) {
        const cronJobId = context.getNodeParameter('cronJobId', itemIndex);
        try {
            const currentCrontab = (0, child_process_1.execSync)('crontab -l 2>/dev/null || true').toString();
            const lines = currentCrontab.split('\n');
            const filteredLines = lines.filter((line) => !line.includes(cronJobId));
            if (lines.length === filteredLines.length) {
                throw new Error(`Cron job ${cronJobId} not found`);
            }
            const tempFile = `/tmp/crontab-${Date.now()}`;
            fs.writeFileSync(tempFile, filteredLines.join('\n'));
            (0, child_process_1.execSync)(`crontab ${tempFile}`);
            fs.unlinkSync(tempFile);
            return {
                success: true,
                deletedId: cronJobId,
                message: 'Cron job deleted successfully',
            };
        }
        catch (error) {
            throw new Error(`Failed to delete cron job: ${error.message}`);
        }
    }
    async listScheduledTasks() {
        try {
            const tasks = {
                atJobs: [],
                cronJobs: [],
                reminders: [],
            };
            try {
                const atOutput = (0, child_process_1.execSync)('atq').toString();
                const lines = atOutput.trim().split('\n');
                tasks.atJobs = lines.map((line) => {
                    const parts = line.split(/\s+/);
                    return {
                        jobId: parts[0],
                        scheduledTime: parts.slice(1, 6).join(' '),
                        queue: parts[6],
                        user: parts[7],
                    };
                });
            }
            catch (e) {
            }
            try {
                const cronResult = await this.listCronJobs();
                tasks.cronJobs = cronResult.cronJobs;
            }
            catch (e) {
            }
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
        }
        catch (error) {
            throw new Error(`Failed to list scheduled tasks: ${error.message}`);
        }
    }
    async cancelTask(context, itemIndex) {
        const taskId = context.getNodeParameter('taskId', itemIndex);
        try {
            let cancelled = false;
            let taskType = '';
            try {
                (0, child_process_1.execSync)(`atrm ${taskId}`);
                cancelled = true;
                taskType = 'at job';
            }
            catch (e) {
            }
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
        }
        catch (error) {
            throw new Error(`Failed to cancel task: ${error.message}`);
        }
    }
    async batchSchedule(context, itemIndex, bridge) {
        const scheduleTasks = context.getNodeParameter('scheduleTasks', itemIndex);
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
                    const success = await bridge.scheduleCheckIn(task.minutes, task.note || 'Batch scheduled check-in', task.targetWindow);
                    results.push({
                        success: true,
                        targetWindow: task.targetWindow,
                        minutes: task.minutes,
                        note: task.note,
                        scheduledTime: new Date(Date.now() + task.minutes * 60000).toISOString(),
                    });
                }
                catch (error) {
                    results.push({
                        error: error.message,
                        task,
                    });
                }
            }
            const successCount = results.filter((r) => r.success).length;
            const failureCount = results.filter((r) => r.error).length;
            return {
                success: true,
                totalTasks: tasks.length,
                successCount,
                failureCount,
                results,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            throw new Error(`Failed to batch schedule: ${error.message}`);
        }
    }
}
exports.TmuxScheduler = TmuxScheduler;
//# sourceMappingURL=TmuxScheduler.node.js.map