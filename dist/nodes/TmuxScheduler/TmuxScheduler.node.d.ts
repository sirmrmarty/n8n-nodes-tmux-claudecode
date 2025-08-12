import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
export declare class TmuxScheduler implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
    private scheduleCheckIn;
    private createReminder;
    private manageCronJobs;
    private createCronJob;
    private listCronJobs;
    private deleteCronJob;
    private listScheduledTasks;
    private cancelTask;
    private batchSchedule;
}
