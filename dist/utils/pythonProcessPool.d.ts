import { EventEmitter } from 'events';
export interface PythonPoolConfig {
    maxProcesses?: number;
    minProcesses?: number;
    idleTimeout?: number;
    requestTimeout?: number;
    maxErrorCount?: number;
    healthCheckInterval?: number;
    processRespawnDelay?: number;
}
export interface PoolMetrics {
    activeConnections: number;
    idleConnections: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    poolUtilization: number;
    healthyProcesses: number;
    errorRate: number;
}
export declare class PythonProcessPool extends EventEmitter {
    private connections;
    private requestQueue;
    private config;
    private scriptPath;
    private healthCheckInterval?;
    private idleCheckInterval?;
    private metrics;
    constructor(scriptPath: string, config?: PythonPoolConfig);
    private initialize;
    private createConnection;
    private handleResponse;
    private handleConnectionError;
    private handleConnectionExit;
    private sendRequest;
    execute(method: string, args?: any[]): Promise<any>;
    private findAvailableConnection;
    private processQueue;
    private performHealthChecks;
    private checkIdleConnections;
    private maintainMinimumConnections;
    getMetrics(): PoolMetrics;
    destroy(): Promise<void>;
}
