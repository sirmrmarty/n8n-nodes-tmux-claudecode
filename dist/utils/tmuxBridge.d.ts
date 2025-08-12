import { QATestResults, CryptoQAApproval } from './cryptoQA';
export interface TmuxSession {
    name: string;
    windows: TmuxWindow[];
    attached: boolean;
}
export interface TmuxWindow {
    sessionName: string;
    windowIndex: number;
    windowName: string;
    active: boolean;
}
export interface WindowInfo {
    name: string;
    active: boolean;
    panes: number;
    layout: string;
    content?: string;
    error?: string;
}
export interface TmuxBridgeConfig {
    externalScriptsDir?: string;
    projectBasePath?: string;
    qaKeysPath?: string;
    approvalStoragePath?: string;
}
export declare class TmuxBridge {
    private pythonScriptPath;
    private pathResolver;
    private config;
    private approvalCache;
    private blockCache;
    private workflowOrchestrator;
    private sessionsCache;
    private windowContentCache;
    private performanceMonitor;
    private debouncedCapture;
    private throttledStatus;
    constructor(config?: TmuxBridgeConfig);
    private executePython;
    getTmuxSessions(): Promise<TmuxSession[]>;
    captureWindowContent(sessionName: string, windowIndex: number, numLines?: number): Promise<string>;
    private captureWindowContentDirect;
    getWindowInfo(sessionName: string, windowIndex: number): Promise<WindowInfo>;
    sendKeysToWindow(sessionName: string, windowIndex: number, keys: string): Promise<boolean>;
    sendCommandToWindow(sessionName: string, windowIndex: number, command: string): Promise<boolean>;
    getAllWindowsStatus(): Promise<any>;
    private getAllWindowsStatusDirect;
    findWindowByName(windowName: string): Promise<Array<[string, number]>>;
    createMonitoringSnapshot(): Promise<string>;
    sendClaudeMessage(target: string, message: string): Promise<boolean>;
    suggestSubagent(target: string, agentType: 'pm' | 'developer' | 'engineer' | 'general', context?: string): Promise<boolean>;
    private sendSubagentSuggestionManually;
    scheduleCheckIn(minutes: number, note: string, targetWindow?: string): Promise<boolean>;
    createSession(sessionName: string, projectPath?: string, windows?: string[]): Promise<boolean>;
    killSession(sessionName: string): Promise<boolean>;
    renameWindow(target: string, newName: string): Promise<boolean>;
    registerQAEngineer(qaEngineerID: string, publicKeyHex: string): Promise<boolean>;
    generateQAKeyPair(): Promise<{
        privateKey: string;
        publicKey: string;
        qaEngineerID: string;
    }>;
    checkQAApproval(projectName: string, commitHash: string): Promise<{
        approved: boolean;
        details?: any;
        auditHash?: string;
    }>;
    requestQAValidation(projectName: string, testTypes: string[], context?: string): Promise<boolean>;
    createQAApproval(projectName: string, commitHash: string, commitMessage: string, qaEngineerID: string, privateKeyHex: string, testResults: QATestResults, correlationId?: string): Promise<CryptoQAApproval>;
    createQABlock(projectName: string, commitHash: string, commitMessage: string, qaEngineerID: string, blockReason: string, testResults: QATestResults, privateKeyHex: string): Promise<any>;
    getQAStatus(projectName: string, commitHash: string): Promise<{
        status: string;
        details?: any;
        auditHash?: string;
    }>;
    notifyQAStatusChange(projectName: string, status: 'approved' | 'blocked', feedback?: string): Promise<boolean>;
    executeQATests(projectName: string, testTypes: string[], projectPath?: string, commitHash?: string, qaEngineerID?: string): Promise<{
        success: boolean;
        results: any;
        correlationId: string;
    }>;
    private runUnitTests;
    private runIntegrationTests;
    private runSecurityScan;
    private runPerformanceTests;
    private checkCodeCoverage;
    getPerformanceMetrics(): {
        monitor: {
            cacheHitRate: number;
            executionTimeSamples: number;
            medianExecutionTime: number;
            p95ExecutionTime: number;
            cacheHits: number;
            cacheMisses: number;
            averageExecutionTime: number;
            activeConnections: number;
            queuedRequests: number;
        };
        cache: {
            sessions: {
                hits: number;
                misses: number;
                hitRate: number;
                size: number;
            };
            windowContent: {
                hits: number;
                misses: number;
                hitRate: number;
                size: number;
            };
            combined: {
                totalHits: number;
                totalMisses: number;
                totalRequests: number;
                overallHitRate: number;
            };
        };
        qaSystem: {
            activeApprovals: number;
            activeBlocks: number;
        };
    };
    private calculateOverallHitRate;
    clearPerformanceCaches(): void;
    invalidateCache(type: 'sessions' | 'window_content' | 'all', key?: string): void;
    optimizeMemory(): void;
    getSystemHealth(): {
        status: "healthy" | "warning" | "critical";
        issues: string[];
        recommendations: string[];
    };
}
