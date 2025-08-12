import { promisify } from 'util';
import { LRUCache } from 'lru-cache';

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

/**
 * High-performance caching system with LRU eviction
 */
export class PerformanceCache<T> {
	private cache: LRUCache<string, T>;
	private hits = 0;
	private misses = 0;

	constructor(config: CacheConfig = {}) {
		this.cache = new LRUCache<string, T>({
			max: config.maxSize || 1000,
			ttl: config.maxAge || 300000, // 5 minutes default
			updateAgeOnGet: config.updateAgeOnGet ?? true
		});
	}

	set(key: string, value: T, ttl?: number): void {
		this.cache.set(key, value, { ttl });
	}

	get(key: string): T | undefined {
		const value = this.cache.get(key);
		if (value !== undefined) {
			this.hits++;
			return value;
		}
		this.misses++;
		return undefined;
	}

	has(key: string): boolean {
		return this.cache.has(key);
	}

	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	clear(): void {
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

/**
 * Connection pool for managing concurrent operations
 */
export class ConnectionPool<T> {
	private connections: T[] = [];
	private inUse = new Set<T>();
	private waiting: Array<{ resolve: (connection: T) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }> = [];
	private createConnection: () => Promise<T>;
	private destroyConnection: (connection: T) => Promise<void>;
	private maxConnections: number;
	private idleTimeout: number;
	private acquireTimeout: number;
	private idleTimers = new Map<T, NodeJS.Timeout>();

	constructor(
		createConnection: () => Promise<T>,
		destroyConnection: (connection: T) => Promise<void>,
		config: ConnectionPoolConfig = {}
	) {
		this.createConnection = createConnection;
		this.destroyConnection = destroyConnection;
		this.maxConnections = config.maxConnections || 10;
		this.idleTimeout = config.idleTimeout || 30000; // 30 seconds
		this.acquireTimeout = config.acquireTimeout || 10000; // 10 seconds
	}

	async acquire(): Promise<T> {
		// Try to get an idle connection
		const idleConnection = this.connections.find(conn => !this.inUse.has(conn));
		if (idleConnection) {
			this.inUse.add(idleConnection);
			this.clearIdleTimer(idleConnection);
			return idleConnection;
		}

		// Create new connection if under limit
		if (this.connections.length < this.maxConnections) {
			try {
				const newConnection = await this.createConnection();
				this.connections.push(newConnection);
				this.inUse.add(newConnection);
				return newConnection;
			} catch (error) {
				throw new Error(`Failed to create connection: ${error.message}`);
			}
		}

		// Wait for a connection to become available
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

	release(connection: T): void {
		if (!this.inUse.has(connection)) {
			return; // Connection not in use
		}

		this.inUse.delete(connection);

		// Process waiting requests
		if (this.waiting.length > 0) {
			const waiter = this.waiting.shift()!;
			clearTimeout(waiter.timeout);
			this.inUse.add(connection);
			waiter.resolve(connection);
			return;
		}

		// Set idle timeout for unused connection
		this.setIdleTimer(connection);
	}

	private setIdleTimer(connection: T): void {
		const timer = setTimeout(async () => {
			if (!this.inUse.has(connection)) {
				try {
					await this.destroyConnection(connection);
					const index = this.connections.indexOf(connection);
					if (index !== -1) {
						this.connections.splice(index, 1);
					}
					this.idleTimers.delete(connection);
				} catch (error) {
					console.error('Error destroying idle connection:', error);
				}
			}
		}, this.idleTimeout);

		this.idleTimers.set(connection, timer);
	}

	private clearIdleTimer(connection: T): void {
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

	async destroy(): Promise<void> {
		// Clear all waiting requests
		this.waiting.forEach(waiter => {
			clearTimeout(waiter.timeout);
			waiter.reject(new Error('Connection pool destroyed'));
		});
		this.waiting.length = 0;

		// Clear all idle timers
		this.idleTimers.forEach(timer => clearTimeout(timer));
		this.idleTimers.clear();

		// Destroy all connections
		const destroyPromises = this.connections.map(conn => this.destroyConnection(conn));
		await Promise.allSettled(destroyPromises);
		
		this.connections.length = 0;
		this.inUse.clear();
	}
}

/**
 * Async operation batcher for improved throughput
 */
export class BatchProcessor<T, R> {
	private batch: T[] = [];
	private batchTimeout: NodeJS.Timeout | null = null;
	private processor: (items: T[]) => Promise<R[]>;
	private maxBatchSize: number;
	private batchDelay: number;
	private waitingResolvers: Array<{ resolve: (result: R) => void; reject: (error: Error) => void }> = [];

	constructor(
		processor: (items: T[]) => Promise<R[]>,
		maxBatchSize: number = 50,
		batchDelay: number = 10 // milliseconds
	) {
		this.processor = processor;
		this.maxBatchSize = maxBatchSize;
		this.batchDelay = batchDelay;
	}

	async process(item: T): Promise<R> {
		return new Promise((resolve, reject) => {
			this.batch.push(item);
			this.waitingResolvers.push({ resolve, reject });

			// Process immediately if batch is full
			if (this.batch.length >= this.maxBatchSize) {
				this.processBatch();
			} else if (!this.batchTimeout) {
				// Set timeout for partial batch
				this.batchTimeout = setTimeout(() => {
					this.processBatch();
				}, this.batchDelay);
			}
		});
	}

	private async processBatch(): Promise<void> {
		if (this.batch.length === 0) return;

		const currentBatch = this.batch.splice(0);
		const currentResolvers = this.waitingResolvers.splice(0, currentBatch.length);

		if (this.batchTimeout) {
			clearTimeout(this.batchTimeout);
			this.batchTimeout = null;
		}

		try {
			const results = await this.processor(currentBatch);
			
			// Resolve individual promises with their results
			results.forEach((result, index) => {
				if (currentResolvers[index]) {
					currentResolvers[index].resolve(result);
				}
			});
		} catch (error) {
			// Reject all promises with the same error
			currentResolvers.forEach(resolver => {
				resolver.reject(error as Error);
			});
		}
	}
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
	private metrics: PerformanceMetrics = {
		cacheHits: 0,
		cacheMisses: 0,
		averageExecutionTime: 0,
		activeConnections: 0,
		queuedRequests: 0
	};

	private executionTimes: number[] = [];
	private maxExecutionTimesSamples = 100;

	recordExecutionTime(time: number): void {
		this.executionTimes.push(time);
		
		// Keep only recent samples
		if (this.executionTimes.length > this.maxExecutionTimesSamples) {
			this.executionTimes.shift();
		}

		// Update average
		const sum = this.executionTimes.reduce((a, b) => a + b, 0);
		this.metrics.averageExecutionTime = sum / this.executionTimes.length;
	}

	updateCacheMetrics(hits: number, misses: number): void {
		this.metrics.cacheHits = hits;
		this.metrics.cacheMisses = misses;
	}

	updateConnectionMetrics(active: number, queued: number): void {
		this.metrics.activeConnections = active;
		this.metrics.queuedRequests = queued;
	}

	getMetrics(): PerformanceMetrics {
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

	private calculateMedian(arr: number[]): number {
		if (arr.length === 0) return 0;
		const sorted = [...arr].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 === 0 
			? (sorted[mid - 1] + sorted[mid]) / 2 
			: sorted[mid];
	}

	private calculatePercentile(arr: number[], percentile: number): number {
		if (arr.length === 0) return 0;
		const sorted = [...arr].sort((a, b) => a - b);
		const index = Math.ceil((percentile / 100) * sorted.length) - 1;
		return sorted[Math.max(0, index)];
	}
}

/**
 * Debounced function executor for rate limiting
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	delay: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
	let timeoutId: NodeJS.Timeout;
	
	return (...args: Parameters<T>): Promise<ReturnType<T>> => {
		return new Promise((resolve, reject) => {
			clearTimeout(timeoutId);
			
			timeoutId = setTimeout(async () => {
				try {
					const result = await func(...args);
					resolve(result);
				} catch (error) {
					reject(error);
				}
			}, delay);
		});
	};
}

/**
 * Throttled function executor for rate limiting
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	delay: number
): (...args: Parameters<T>) => Promise<ReturnType<T> | null> {
	let lastCall = 0;
	
	return async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
		const now = Date.now();
		
		if (now - lastCall >= delay) {
			lastCall = now;
			return await func(...args);
		}
		
		return null; // Throttled call
	};
}

// Install lru-cache dependency in package.json
export const REQUIRED_DEPENDENCIES = {
	'lru-cache': '^10.1.0'
};