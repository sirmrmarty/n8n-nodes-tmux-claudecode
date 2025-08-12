import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
export declare class TmuxAgentMonitor implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
    private listAllSessions;
    private healthCheck;
    private collectLogs;
    private detectBlockers;
    private monitorSnapshot;
    private findWindows;
    private activityReport;
    private getSuggestedAction;
    private checkSubagentOpportunities;
    private getSuggestedSubagents;
    private analyzeSnapshot;
}
