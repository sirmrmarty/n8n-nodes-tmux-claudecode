"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonProcessPool = void 0;
const child_process_1 = require("child_process");
const events_1 = require("events");
const uuid_1 = require("uuid");
class PythonProcessPool extends events_1.EventEmitter {
    constructor(scriptPath, config = {}) {
        super();
        this.connections = new Map();
        this.requestQueue = [];
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalResponseTime: 0,
        };
        this.scriptPath = scriptPath;
        this.config = {
            maxProcesses: config.maxProcesses || 6,
            minProcesses: config.minProcesses || 2,
            idleTimeout: config.idleTimeout || 60000,
            requestTimeout: config.requestTimeout || 30000,
            maxErrorCount: config.maxErrorCount || 5,
            healthCheckInterval: config.healthCheckInterval || 30000,
            processRespawnDelay: config.processRespawnDelay || 1000,
        };
        this.initialize();
    }
    async initialize() {
        for (let i = 0; i < this.config.minProcesses; i++) {
            await this.createConnection();
        }
        this.healthCheckInterval = setInterval(() => {
            this.performHealthChecks();
        }, this.config.healthCheckInterval);
        this.idleCheckInterval = setInterval(() => {
            this.checkIdleConnections();
        }, 10000);
    }
    async createConnection() {
        try {
            const id = (0, uuid_1.v4)();
            const pythonProcess = (0, child_process_1.spawn)('python3', [this.scriptPath, '--persistent'], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            const connection = {
                process: pythonProcess,
                id,
                created: Date.now(),
                lastUsed: Date.now(),
                pendingRequests: new Map(),
                healthy: true,
                errorCount: 0,
                busy: false,
            };
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
            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python process ${id} stderr:`, data.toString());
                connection.errorCount++;
            });
            pythonProcess.on('error', (error) => {
                console.error(`Python process ${id} error:`, error);
                connection.healthy = false;
                this.handleConnectionError(connection, error);
            });
            pythonProcess.on('exit', (code) => {
                console.log(`Python process ${id} exited with code ${code}`);
                connection.healthy = false;
                this.handleConnectionExit(connection, code);
            });
            const healthCheck = await this.sendRequest(connection, 'ping', []);
            if (healthCheck !== 'pong') {
                throw new Error('Health check failed');
            }
            this.connections.set(id, connection);
            this.emit('connectionCreated', id);
            return connection;
        }
        catch (error) {
            console.error('Failed to create Python connection:', error);
            return null;
        }
    }
    handleResponse(connection, line) {
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
            clearTimeout(pendingRequest.timeout);
            const responseTime = Date.now() - pendingRequest.timestamp;
            this.metrics.totalResponseTime += responseTime;
            connection.pendingRequests.delete(requestId);
            connection.busy = connection.pendingRequests.size > 0;
            connection.lastUsed = Date.now();
            if (response.error) {
                this.metrics.failedRequests++;
                connection.errorCount++;
                pendingRequest.reject(new Error(response.error));
            }
            else {
                this.metrics.successfulRequests++;
                connection.errorCount = 0;
                pendingRequest.resolve(response.result);
            }
            this.processQueue();
        }
        catch (error) {
            console.error('Failed to handle response:', error);
            connection.errorCount++;
        }
    }
    handleConnectionError(connection, error) {
        for (const [requestId, request] of connection.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new Error(`Connection error: ${error.message}`));
            this.metrics.failedRequests++;
        }
        connection.pendingRequests.clear();
        this.connections.delete(connection.id);
        setTimeout(() => {
            this.maintainMinimumConnections();
        }, this.config.processRespawnDelay);
    }
    handleConnectionExit(connection, code) {
        for (const [requestId, request] of connection.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new Error(`Process exited with code ${code}`));
            this.metrics.failedRequests++;
        }
        connection.pendingRequests.clear();
        this.connections.delete(connection.id);
        setTimeout(() => {
            this.maintainMinimumConnections();
        }, this.config.processRespawnDelay);
    }
    async sendRequest(connection, method, args) {
        return new Promise((resolve, reject) => {
            const requestId = (0, uuid_1.v4)();
            const request = {
                id: requestId,
                method,
                args,
            };
            const timeout = setTimeout(() => {
                connection.pendingRequests.delete(requestId);
                connection.errorCount++;
                reject(new Error(`Request timeout for method ${method}`));
            }, this.config.requestTimeout);
            connection.pendingRequests.set(requestId, {
                resolve,
                reject,
                timeout,
                timestamp: Date.now(),
            });
            connection.busy = true;
            connection.process.stdin.write(JSON.stringify(request) + '\n');
        });
    }
    async execute(method, args = []) {
        this.metrics.totalRequests++;
        const connection = this.findAvailableConnection();
        if (connection) {
            try {
                return await this.sendRequest(connection, method, args);
            }
            catch (error) {
                const retryConnection = this.findAvailableConnection(connection.id);
                if (retryConnection) {
                    return await this.sendRequest(retryConnection, method, args);
                }
                throw error;
            }
        }
        else {
            return new Promise((resolve, reject) => {
                this.requestQueue.push({ method, args, resolve, reject });
                if (this.connections.size < this.config.maxProcesses) {
                    this.createConnection().then(() => {
                        this.processQueue();
                    });
                }
            });
        }
    }
    findAvailableConnection(excludeId) {
        let bestConnection = null;
        let minPendingRequests = Infinity;
        for (const connection of this.connections.values()) {
            if (connection.id === excludeId)
                continue;
            if (!connection.healthy)
                continue;
            if (connection.errorCount >= this.config.maxErrorCount)
                continue;
            const pendingCount = connection.pendingRequests.size;
            if (pendingCount === 0) {
                return connection;
            }
            if (pendingCount < minPendingRequests) {
                minPendingRequests = pendingCount;
                bestConnection = connection;
            }
        }
        if (bestConnection && minPendingRequests < 3) {
            return bestConnection;
        }
        return null;
    }
    processQueue() {
        while (this.requestQueue.length > 0) {
            const connection = this.findAvailableConnection();
            if (!connection)
                break;
            const request = this.requestQueue.shift();
            if (!request)
                break;
            this.sendRequest(connection, request.method, request.args)
                .then(request.resolve)
                .catch(request.reject);
        }
    }
    async performHealthChecks() {
        const checks = [];
        for (const connection of this.connections.values()) {
            if (!connection.healthy)
                continue;
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
        for (const [id, connection] of this.connections) {
            if (!connection.healthy || connection.errorCount >= this.config.maxErrorCount) {
                connection.process.kill();
                this.connections.delete(id);
            }
        }
        this.maintainMinimumConnections();
    }
    checkIdleConnections() {
        const now = Date.now();
        const toRemove = [];
        for (const [id, connection] of this.connections) {
            if (connection.pendingRequests.size > 0)
                continue;
            if (this.connections.size <= this.config.minProcesses)
                continue;
            if (now - connection.lastUsed > this.config.idleTimeout) {
                toRemove.push(id);
            }
        }
        for (const id of toRemove) {
            const connection = this.connections.get(id);
            if (connection) {
                connection.process.kill();
                this.connections.delete(id);
                this.emit('connectionRemoved', id);
            }
        }
    }
    async maintainMinimumConnections() {
        const currentCount = this.connections.size;
        const needed = this.config.minProcesses - currentCount;
        if (needed > 0) {
            const creates = [];
            for (let i = 0; i < needed; i++) {
                creates.push(this.createConnection());
            }
            await Promise.allSettled(creates);
        }
    }
    getMetrics() {
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
    async destroy() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.idleCheckInterval) {
            clearInterval(this.idleCheckInterval);
        }
        for (const connection of this.connections.values()) {
            connection.process.kill();
        }
        this.connections.clear();
        this.requestQueue = [];
        this.emit('destroyed');
    }
}
exports.PythonProcessPool = PythonProcessPool;
//# sourceMappingURL=pythonProcessPool.js.map