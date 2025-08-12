import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
export declare class TmuxOrchestrator implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
    private deployAgent;
    private sendMessage;
    private suggestSubagent;
    private captureOutput;
    private getStatus;
    private listSessions;
    private terminateAgent;
    private formatBriefingForRole;
}
