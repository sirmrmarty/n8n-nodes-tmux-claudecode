import { TmuxBridge } from './tmuxBridge';
export interface ProjectOrchestratorConfig {
    checkInterval?: number;
    maxRetries?: number;
    autoCreatePR?: boolean;
    credentials?: any;
}
export interface ProjectStatus {
    projectName: string;
    isComplete: boolean;
    qaApproved: boolean;
    readyForPR: boolean;
    prCreated: boolean;
    prUrl?: string;
    lastCheck: Date;
    retryCount: number;
}
export declare class ProjectOrchestrator {
    private bridge;
    private config;
    private monitoredProjects;
    private monitoringInterval?;
    private isMonitoring;
    constructor(bridge: TmuxBridge, config?: ProjectOrchestratorConfig);
    addProject(projectName: string): Promise<void>;
    removeProject(projectName: string): void;
    startMonitoring(): void;
    stopMonitoring(): void;
    private checkAllProjects;
    private checkProject;
    private checkProjectCompletion;
    private createAutomaticPR;
    private generatePRDescription;
    private notifyProjectCompletion;
    getMonitoringStatus(): {
        isMonitoring: boolean;
        projectCount: number;
        projects: ProjectStatus[];
    };
    destroy(): void;
}
