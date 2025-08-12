import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Python process connection for the pool
 */
interface PythonConnection {
    process: ChildProcess;
    id: string;
    created: number;
    lastUsed: number;
    pendingRequests: Map<string, {
        resolve: (result: any) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
        timestamp: number;
    }>;
    healthy: boolean;
    errorCount: number;
    busy: boolean;
}

/**
 * Configuration for Python process pool
 */
export interface PythonPoolConfig {
    maxProcesses?: number;
    minProcesses?: number;
    idleTimeout?: number;
    requestTimeout?: number;
    maxErrorCount?: number;
    healthCheckInterval?: number;
    processRespawnDelay?: number;
}

/**
 * Metrics for monitoring pool performance
 */
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

/**
 * Python Process Pool for efficient subprocess management
 */
export class PythonProcessPool extends EventEmitter {
    private connections: Map<string, PythonConnection> = new Map();
    private requestQueue: Array<{
        method: string;
        args: any[];
        resolve: (result: any) => void;
        reject: (error: Error) => void;
    }> = [];
    
    private config: Required<PythonPoolConfig>;
    private scriptPath: string;
    private healthCheckInterval?: NodeJS.Timeout;
    private idleCheckInterval?: NodeJS.Timeout;
    
    // Metrics tracking
    private metrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalResponseTime: 0,
    };

    constructor(scriptPath: string, config: PythonPoolConfig = {}) {
        super();
        
        this.scriptPath = scriptPath;
        this.config = {
            maxProcesses: config.maxProcesses || 6,
            minProcesses: config.minProcesses || 2,
            idleTimeout: config.idleTimeout || 60000, // 1 minute
            requestTimeout: config.requestTimeout || 30000, // 30 seconds
            maxErrorCount: config.maxErrorCount || 5,
            healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
            processRespawnDelay: config.processRespawnDelay || 1000, // 1 second
        };
        
        this.initialize();
    }

    /**
     * Initialize the process pool
     */
    private async initialize(): Promise<void> {
        // Create minimum number of processes
        for (let i = 0; i < this.config.minProcesses; i++) {
            await this.createConnection();
        }
        
        // Start health check interval
        this.healthCheckInterval = setInterval(() => {
            this.performHealthChecks();
        }, this.config.healthCheckInterval);
        
        // Start idle check interval
        this.idleCheckInterval = setInterval(() => {
            this.checkIdleConnections();
        }, 10000); // Check every 10 seconds
    }

    /**
     * Create a new Python connection
     */
    private async createConnection(): Promise<PythonConnection | null> {
        try {
            const id = uuidv4();
            const pythonProcess = spawn('python3', [this.scriptPath, '--persistent'], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            
            const connection: PythonConnection = {
                process: pythonProcess,
                id,
                created: Date.now(),
                lastUsed: Date.now(),
                pendingRequests: new Map(),
                healthy: true,
                errorCount: 0,
                busy: false,
            };
            
            // Set up stdout handler
            let buffer = '';
            pythonProcess.stdout.on('data', (data) => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim()) {
                        this.handleResponse(connection, line);
                    }
                }
            });
            
            // Set up stderr handler
            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python process ${id} stderr:`, data.toString());
                connection.errorCount++;
            });
            
            // Set up error handler
            pythonProcess.on('error', (error) => {
                console.error(`Python process ${id} error:`, error);
                connection.healthy = false;
                this.handleConnectionError(connection, error);
            });
            
            // Set up exit handler
            pythonProcess.on('exit', (code) => {
                console.log(`Python process ${id} exited with code ${code}`);
                connection.healthy = false;
                this.handleConnectionExit(connection, code);
            });
            
            // Perform initial health check
            const healthCheck = await this.sendRequest(connection, 'ping', []);
            if (healthCheck !== 'pong') {
                throw new Error('Health check failed');
            }
            
            this.connections.set(id, connection);
            this.emit('connectionCreated', id);
            
            return connection;
        } catch (error) {
            console.error('Failed to create Python connection:', error);
            return null;
        }
    }

    /**
     * Handle response from Python process
     */
    private handleResponse(connection: PythonConnection, line: string): void {
        try {
            const response = JSON.parse(line);
            const requestId = response.id;
            
            if (!requestId) {
                console.warn('Received response without ID:', response);
                return;
            }
            
            const pendingRequest = connection.pendingRequests.get(requestId);
            if (!pendingRequest) {
                console.warn('No pending request for ID:', requestId);
                return;
            }
            
            // Clear timeout
            clearTimeout(pendingRequest.timeout);
            
            // Calculate response time
            const responseTime = Date.now() - pendingRequest.timestamp;
            this.metrics.totalResponseTime += responseTime;
            
            // Remove from pending requests
            connection.pendingRequests.delete(requestId);
            connection.busy = connection.pendingRequests.size > 0;
            connection.lastUsed = Date.now();
            
            // Handle response
            if (response.error) {
                this.metrics.failedRequests++;
                connection.errorCount++;
                pendingRequest.reject(new Error(response.error));
            } else {
                this.metrics.successfulRequests++;
                connection.errorCount = 0; // Reset error count on success
                pendingRequest.resolve(response.result);
            }
            
            // Process queued requests
            this.processQueue();
            
        } catch (error) {
            console.error('Failed to handle response:', error);
            connection.errorCount++;
        }
    }

    /**
     * Handle connection error
     */
    private handleConnectionError(connection: PythonConnection, error: Error): void {
        // Reject all pending requests
        for (const [requestId, request] of connection.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new Error(`Connection error: ${error.message}`));
            this.metrics.failedRequests++;
        }
        connection.pendingRequests.clear();
        
        // Remove from pool
        this.connections.delete(connection.id);
        
        // Schedule respawn
        setTimeout(() => {
            this.maintainMinimumConnections();
        }, this.config.processRespawnDelay);
    }

    /**
     * Handle connection exit
     */
    private handleConnectionExit(connection: PythonConnection, code: number | null): void {
        // Reject all pending requests
        for (const [requestId, request] of connection.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new Error(`Process exited with code ${code}`));
            this.metrics.failedRequests++;
        }
        connection.pendingRequests.clear();
        
        // Remove from pool
        this.connections.delete(connection.id);
        
        // Schedule respawn
        setTimeout(() => {
            this.maintainMinimumConnections();
        }, this.config.processRespawnDelay);
    }

    /**
     * Send request to a specific connection
     */
    private async sendRequest(connection: PythonConnection, method: string, args: any[]): Promise<any> {
        return new Promise((resolve, reject) => {
            const requestId = uuidv4();
            const request = {
                id: requestId,
                method,
                args,
            };
            
            // Set up timeout
            const timeout = setTimeout(() => {
                connection.pendingRequests.delete(requestId);
                connection.errorCount++;
                reject(new Error(`Request timeout for method ${method}`));
            }, this.config.requestTimeout);
            
            // Store pending request
            connection.pendingRequests.set(requestId, {
                resolve,
                reject,
                timeout,
                timestamp: Date.now(),
            });
            
            // Mark connection as busy
            connection.busy = true;
            
            // Send request
            connection.process.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    /**
     * Execute a method using the pool
     */
    async execute(method: string, args: any[] = []): Promise<any> {
        this.metrics.totalRequests++;
        
        // Find available connection
        const connection = this.findAvailableConnection();
        
        if (connection) {
            try {
                return await this.sendRequest(connection, method, args);
            } catch (error) {
                // If request fails, try another connection
                const retryConnection = this.findAvailableConnection(connection.id);
                if (retryConnection) {
                    return await this.sendRequest(retryConnection, method, args);
                }
                throw error;
            }
        } else {
            // Queue the request
            return new Promise((resolve, reject) => {
                this.requestQueue.push({ method, args, resolve, reject });
                
                // Try to create new connection if under limit
                if (this.connections.size < this.config.maxProcesses) {
                    this.createConnection().then(() => {
                        this.processQueue();
                    });
                }
            });
        }
    }

    /**
     * Find an available connection
     */
    private findAvailableConnection(excludeId?: string): PythonConnection | null {
        let bestConnection: PythonConnection | null = null;
        let minPendingRequests = Infinity;
        
        for (const connection of this.connections.values()) {
            if (connection.id === excludeId) continue;
            if (!connection.healthy) continue;
            if (connection.errorCount >= this.config.maxErrorCount) continue;
            
            const pendingCount = connection.pendingRequests.size;
            
            // Return immediately if we find an idle connection
            if (pendingCount === 0) {
                return connection;
            }
            
            // Track connection with fewest pending requests
            if (pendingCount < minPendingRequests) {
                minPendingRequests = pendingCount;
                bestConnection = connection;
            }
        }
        
        // Return connection with fewest pending requests if under threshold
        if (bestConnection && minPendingRequests < 3) {
            return bestConnection;
        }
        
        return null;
    }

    /**
     * Process queued requests
     */
    private processQueue(): void {
        while (this.requestQueue.length > 0) {
            const connection = this.findAvailableConnection();
            if (!connection) break;
            
            const request = this.requestQueue.shift();
            if (!request) break;
            
            this.sendRequest(connection, request.method, request.args)
                .then(request.resolve)
                .catch(request.reject);
        }
    }

    /**
     * Perform health checks on all connections
     */
    private async performHealthChecks(): Promise<void> {
        const checks: Promise<void>[] = [];
        
        for (const connection of this.connections.values()) {
            if (!connection.healthy) continue;
            
            const check = this.sendRequest(connection, 'ping', [])
                .then(result => {
                    if (result !== 'pong') {
                        connection.healthy = false;
                        connection.errorCount++;
                    }
                })
                .catch(() => {
                    connection.healthy = false;
                    connection.errorCount++;
                });
            
            checks.push(check);
        }
        
        await Promise.allSettled(checks);
        
        // Remove unhealthy connections
        for (const [id, connection] of this.connections) {
            if (!connection.healthy || connection.errorCount >= this.config.maxErrorCount) {
                connection.process.kill();
                this.connections.delete(id);
            }
        }
        
        // Maintain minimum connections
        this.maintainMinimumConnections();
    }

    /**
     * Check and remove idle connections
     */
    private checkIdleConnections(): void {
        const now = Date.now();
        const toRemove: string[] = [];
        
        for (const [id, connection] of this.connections) {
            // Skip if connection has pending requests
            if (connection.pendingRequests.size > 0) continue;
            
            // Skip if we're at minimum connections
            if (this.connections.size <= this.config.minProcesses) continue;
            
            // Check if idle timeout exceeded
            if (now - connection.lastUsed > this.config.idleTimeout) {
                toRemove.push(id);
            }
        }
        
        // Remove idle connections
        for (const id of toRemove) {
            const connection = this.connections.get(id);
            if (connection) {
                connection.process.kill();
                this.connections.delete(id);
                this.emit('connectionRemoved', id);
            }
        }
    }

    /**
     * Maintain minimum number of connections
     */
    private async maintainMinimumConnections(): Promise<void> {
        const currentCount = this.connections.size;
        const needed = this.config.minProcesses - currentCount;
        
        if (needed > 0) {
            const creates: Promise<PythonConnection | null>[] = [];
            for (let i = 0; i < needed; i++) {
                creates.push(this.createConnection());
            }
            await Promise.allSettled(creates);
        }
    }

    /**
     * Get pool metrics
     */
    getMetrics(): PoolMetrics {
        const activeConnections = Array.from(this.connections.values()).filter(c => c.busy).length;
        const idleConnections = this.connections.size - activeConnections;
        const healthyProcesses = Array.from(this.connections.values()).filter(c => c.healthy).length;
        
        return {
            activeConnections,
            idleConnections,
            totalRequests: this.metrics.totalRequests,
            successfulRequests: this.metrics.successfulRequests,
            failedRequests: this.metrics.failedRequests,
            averageResponseTime: this.metrics.successfulRequests > 0 
                ? this.metrics.totalResponseTime / this.metrics.successfulRequests 
                : 0,
            poolUtilization: this.connections.size > 0 
                ? (activeConnections / this.connections.size) * 100 
                : 0,
            healthyProcesses,
            errorRate: this.metrics.totalRequests > 0 
                ? (this.metrics.failedRequests / this.metrics.totalRequests) * 100 
                : 0,
        };
    }

    /**
     * Destroy the pool and clean up resources
     */
    async destroy(): Promise<void> {
        // Clear intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.idleCheckInterval) {
            clearInterval(this.idleCheckInterval);
        }
        
        // Kill all processes
        for (const connection of this.connections.values()) {
            connection.process.kill();
        }
        
        // Clear collections
        this.connections.clear();
        this.requestQueue = [];
        
        this.emit('destroyed');
    }
}