export interface CacheConfig {
    maxSize?: number;
    maxAge?: number;
    updateAgeOnGet?: boolean;
}
export interface ConnectionPoolConfig {
    maxConnections?: number;
    idleTimeout?: number;
    acquireTimeout?: number;
}
export interface PerformanceMetrics {
    cacheHits: number;
    cacheMisses: number;
    averageExecutionTime: number;
    activeConnections: number;
    queuedRequests: number;
}
export declare class PerformanceCache<T> {
    private cache;
    private hits;
    private misses;
    constructor(config?: CacheConfig);
    set(key: string, value: T, ttl?: number): void;
    get(key: string): T | undefined;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
    getMetrics(): {
        hits: number;
        misses: number;
        hitRate: number;
        size: number;
    };
}
export declare class ConnectionPool<T> {
    private connections;
    private inUse;
    private waiting;
    private createConnection;
    private destroyConnection;
    private maxConnections;
    private idleTimeout;
    private acquireTimeout;
    private idleTimers;
    constructor(createConnection: () => Promise<T>, destroyConnection: (connection: T) => Promise<void>, config?: ConnectionPoolConfig);
    acquire(): Promise<T>;
    release(connection: T): void;
    private setIdleTimer;
    private clearIdleTimer;
    getMetrics(): {
        totalConnections: number;
        activeConnections: number;
        idleConnections: number;
        queuedRequests: number;
    };
    destroy(): Promise<void>;
}
export declare class BatchProcessor<T, R> {
    private batch;
    private batchTimeout;
    private processor;
    private maxBatchSize;
    private batchDelay;
    private waitingResolvers;
    constructor(processor: (items: T[]) => Promise<R[]>, maxBatchSize?: number, batchDelay?: number);
    process(item: T): Promise<R>;
    private processBatch;
}
export declare class PerformanceMonitor {
    private metrics;
    private executionTimes;
    private maxExecutionTimesSamples;
    recordExecutionTime(time: number): void;
    updateCacheMetrics(hits: number, misses: number): void;
    updateConnectionMetrics(active: number, queued: number): void;
    getMetrics(): PerformanceMetrics;
    getDetailedStats(): {
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
    private calculateMedian;
    private calculatePercentile;
}
export declare function debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => Promise<ReturnType<T>>;
export declare function throttle<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => Promise<ReturnType<T> | null>;
export declare const REQUIRED_DEPENDENCIES: {
    'lru-cache': string;
};
