"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REQUIRED_DEPENDENCIES = exports.PerformanceMonitor = exports.BatchProcessor = exports.ConnectionPool = exports.PerformanceCache = void 0;
exports.debounce = debounce;
exports.throttle = throttle;
const lru_cache_1 = require("lru-cache");
class PerformanceCache {
    constructor(config = {}) {
        this.hits = 0;
        this.misses = 0;
        this.cache = new lru_cache_1.LRUCache({
            max: config.maxSize || 1000,
            ttl: config.maxAge || 300000,
            updateAgeOnGet: config.updateAgeOnGet ?? true
        });
    }
    set(key, value, ttl) {
        this.cache.set(key, value, { ttl });
    }
    get(key) {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.hits++;
            return value;
        }
        this.misses++;
        return undefined;
    }
    has(key) {
        return this.cache.has(key);
    }
    delete(key) {
        return this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }
    getMetrics() {
        const total = this.hits + this.misses;
        return {
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? (this.hits / total) * 100 : 0,
            size: this.cache.size
        };
    }
}
exports.PerformanceCache = PerformanceCache;
class ConnectionPool {
    constructor(createConnection, destroyConnection, config = {}) {
        this.connections = [];
        this.inUse = new Set();
        this.waiting = [];
        this.idleTimers = new Map();
        this.createConnection = createConnection;
        this.destroyConnection = destroyConnection;
        this.maxConnections = config.maxConnections || 10;
        this.idleTimeout = config.idleTimeout || 30000;
        this.acquireTimeout = config.acquireTimeout || 10000;
    }
    async acquire() {
        const idleConnection = this.connections.find(conn => !this.inUse.has(conn));
        if (idleConnection) {
            this.inUse.add(idleConnection);
            this.clearIdleTimer(idleConnection);
            return idleConnection;
        }
        if (this.connections.length < this.maxConnections) {
            try {
                const newConnection = await this.createConnection();
                this.connections.push(newConnection);
                this.inUse.add(newConnection);
                return newConnection;
            }
            catch (error) {
                throw new Error(`Failed to create connection: ${error.message}`);
            }
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const index = this.waiting.findIndex(w => w.resolve === resolve);
                if (index !== -1) {
                    this.waiting.splice(index, 1);
                }
                reject(new Error('Connection acquire timeout'));
            }, this.acquireTimeout);
            this.waiting.push({ resolve, reject, timeout });
        });
    }
    release(connection) {
        if (!this.inUse.has(connection)) {
            return;
        }
        this.inUse.delete(connection);
        if (this.waiting.length > 0) {
            const waiter = this.waiting.shift();
            clearTimeout(waiter.timeout);
            this.inUse.add(connection);
            waiter.resolve(connection);
            return;
        }
        this.setIdleTimer(connection);
    }
    setIdleTimer(connection) {
        const timer = setTimeout(async () => {
            if (!this.inUse.has(connection)) {
                try {
                    await this.destroyConnection(connection);
                    const index = this.connections.indexOf(connection);
                    if (index !== -1) {
                        this.connections.splice(index, 1);
                    }
                    this.idleTimers.delete(connection);
                }
                catch (error) {
                    console.error('Error destroying idle connection:', error);
                }
            }
        }, this.idleTimeout);
        this.idleTimers.set(connection, timer);
    }
    clearIdleTimer(connection) {
        const timer = this.idleTimers.get(connection);
        if (timer) {
            clearTimeout(timer);
            this.idleTimers.delete(connection);
        }
    }
    getMetrics() {
        return {
            totalConnections: this.connections.length,
            activeConnections: this.inUse.size,
            idleConnections: this.connections.length - this.inUse.size,
            queuedRequests: this.waiting.length
        };
    }
    async destroy() {
        this.waiting.forEach(waiter => {
            clearTimeout(waiter.timeout);
            waiter.reject(new Error('Connection pool destroyed'));
        });
        this.waiting.length = 0;
        this.idleTimers.forEach(timer => clearTimeout(timer));
        this.idleTimers.clear();
        const destroyPromises = this.connections.map(conn => this.destroyConnection(conn));
        await Promise.allSettled(destroyPromises);
        this.connections.length = 0;
        this.inUse.clear();
    }
}
exports.ConnectionPool = ConnectionPool;
class BatchProcessor {
    constructor(processor, maxBatchSize = 50, batchDelay = 10) {
        this.batch = [];
        this.batchTimeout = null;
        this.waitingResolvers = [];
        this.processor = processor;
        this.maxBatchSize = maxBatchSize;
        this.batchDelay = batchDelay;
    }
    async process(item) {
        return new Promise((resolve, reject) => {
            this.batch.push(item);
            this.waitingResolvers.push({ resolve, reject });
            if (this.batch.length >= this.maxBatchSize) {
                this.processBatch();
            }
            else if (!this.batchTimeout) {
                this.batchTimeout = setTimeout(() => {
                    this.processBatch();
                }, this.batchDelay);
            }
        });
    }
    async processBatch() {
        if (this.batch.length === 0)
            return;
        const currentBatch = this.batch.splice(0);
        const currentResolvers = this.waitingResolvers.splice(0, currentBatch.length);
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        try {
            const results = await this.processor(currentBatch);
            results.forEach((result, index) => {
                if (currentResolvers[index]) {
                    currentResolvers[index].resolve(result);
                }
            });
        }
        catch (error) {
            currentResolvers.forEach(resolver => {
                resolver.reject(error);
            });
        }
    }
}
exports.BatchProcessor = BatchProcessor;
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            averageExecutionTime: 0,
            activeConnections: 0,
            queuedRequests: 0
        };
        this.executionTimes = [];
        this.maxExecutionTimesSamples = 100;
    }
    recordExecutionTime(time) {
        this.executionTimes.push(time);
        if (this.executionTimes.length > this.maxExecutionTimesSamples) {
            this.executionTimes.shift();
        }
        const sum = this.executionTimes.reduce((a, b) => a + b, 0);
        this.metrics.averageExecutionTime = sum / this.executionTimes.length;
    }
    updateCacheMetrics(hits, misses) {
        this.metrics.cacheHits = hits;
        this.metrics.cacheMisses = misses;
    }
    updateConnectionMetrics(active, queued) {
        this.metrics.activeConnections = active;
        this.metrics.queuedRequests = queued;
    }
    getMetrics() {
        return { ...this.metrics };
    }
    getDetailedStats() {
        const totalCacheRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
        const cacheHitRate = totalCacheRequests > 0 ? (this.metrics.cacheHits / totalCacheRequests) * 100 : 0;
        return {
            ...this.metrics,
            cacheHitRate,
            executionTimeSamples: this.executionTimes.length,
            medianExecutionTime: this.calculateMedian(this.executionTimes),
            p95ExecutionTime: this.calculatePercentile(this.executionTimes, 95)
        };
    }
    calculateMedian(arr) {
        if (arr.length === 0)
            return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }
    calculatePercentile(arr, percentile) {
        if (arr.length === 0)
            return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
function debounce(func, delay) {
    let timeoutId;
    return (...args) => {
        return new Promise((resolve, reject) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(async () => {
                try {
                    const result = await func(...args);
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            }, delay);
        });
    };
}
function throttle(func, delay) {
    let lastCall = 0;
    return async (...args) => {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            return await func(...args);
        }
        return null;
    };
}
exports.REQUIRED_DEPENDENCIES = {
    'lru-cache': '^10.1.0'
};
//# sourceMappingURL=performanceOptimizations.js.map