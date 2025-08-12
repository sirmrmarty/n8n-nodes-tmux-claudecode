import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
export declare class TmuxProjectManager implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
    private createProject;
    private assignTask;
    private getProgress;
    private validateQuality;
    private createTeamMember;
    private dailyStandup;
    private getWindowsForTeamSize;
    private createPMBriefing;
    private deployInitialTeam;
    private getValidationChecklist;
    private getRoleBriefing;
}
