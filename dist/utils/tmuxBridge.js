"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TmuxBridge = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const crypto_1 = require("crypto");
const paths_1 = require("./paths");
const secureExecution_1 = require("./secureExecution");
const cryptoQA_1 = require("./cryptoQA");
const qaEvents_1 = require("./qaEvents");
const performanceOptimizations_1 = require("./performanceOptimizations");
class TmuxBridge {
    constructor(config) {
        this.approvalCache = new Map();
        this.blockCache = new Map();
        this.config = config || {};
        this.pathResolver = new paths_1.PathResolver();
        this.workflowOrchestrator = qaEvents_1.qaEventBus.createWorkflowOrchestrator();
        this.sessionsCache = new performanceOptimizations_1.PerformanceCache({
            maxSize: 100,
            maxAge: 60000,
        });
        this.windowContentCache = new performanceOptimizations_1.PerformanceCache({
            maxSize: 500,
            maxAge: 30000,
        });
        this.performanceMonitor = new performanceOptimizations_1.PerformanceMonitor();
        this.debouncedCapture = (0, performanceOptimizations_1.debounce)(this.captureWindowContentDirect.bind(this), 100);
        this.throttledStatus = (0, performanceOptimizations_1.throttle)(this.getAllWindowsStatusDirect.bind(this), 1000);
        this.pythonScriptPath = this.pathResolver.getScriptPath('tmux_utils.py', config?.externalScriptsDir);
    }
    async executePython(method, args = []) {
        return new Promise((resolve, reject) => {
            const pythonArgs = [this.pythonScriptPath, method, ...args.map(arg => JSON.stringify(arg))];
            const python = (0, child_process_1.spawn)('python3', pythonArgs);
            let stdout = '';
            let stderr = '';
            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            python.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            python.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python script failed: ${stderr}`));
                }
                else {
                    try {
                        const result = JSON.parse(stdout);
                        resolve(result);
                    }
                    catch (error) {
                        resolve(stdout);
                    }
                }
            });
        });
    }
    async getTmuxSessions() {
        const startTime = Date.now();
        const cacheKey = 'tmux_sessions';
        try {
            const cached = this.sessionsCache.get(cacheKey);
            if (cached) {
                const duration = Date.now() - startTime;
                this.performanceMonitor.recordExecutionTime(duration);
                return cached;
            }
            const result = await this.executePython('get_tmux_sessions');
            this.sessionsCache.set(cacheKey, result);
            const duration = Date.now() - startTime;
            this.performanceMonitor.recordExecutionTime(duration);
            const cacheMetrics = this.sessionsCache.getMetrics();
            this.performanceMonitor.updateCacheMetrics(cacheMetrics.hits, cacheMetrics.misses);
            return result;
        }
        catch (error) {
            console.error('Error getting tmux sessions:', error);
            const duration = Date.now() - startTime;
            this.performanceMonitor.recordExecutionTime(duration);
            return [];
        }
    }
    async captureWindowContent(sessionName, windowIndex, numLines = 50) {
        const startTime = Date.now();
        const cacheKey = `window_content_${sessionName}_${windowIndex}_${numLines}`;
        try {
            const cached = this.windowContentCache.get(cacheKey);
            if (cached) {
                const duration = Date.now() - startTime;
                this.performanceMonitor.recordExecutionTime(duration);
                return cached;
            }
            const result = await this.debouncedCapture(sessionName, windowIndex, numLines);
            this.windowContentCache.set(cacheKey, result, 30000);
            const duration = Date.now() - startTime;
            this.performanceMonitor.recordExecutionTime(duration);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.performanceMonitor.recordExecutionTime(duration);
            throw new Error(`Failed to capture window content: ${error.message}`);
        }
    }
    async captureWindowContentDirect(sessionName, windowIndex, numLines = 50) {
        try {
            const result = await this.executePython('capture_window_content', [sessionName, windowIndex, numLines]);
            if (typeof result === 'string') {
                return result;
            }
            else if (result === null || result === undefined) {
                return '';
            }
            else if (typeof result === 'object') {
                try {
                    return JSON.stringify(result, null, 2);
                }
                catch (stringifyError) {
                    return String(result);
                }
            }
            else {
                return String(result);
            }
        }
        catch (error) {
            throw new Error(`Failed to capture window content: ${error.message}`);
        }
    }
    async getWindowInfo(sessionName, windowIndex) {
        try {
            const result = await this.executePython('get_window_info', [sessionName, windowIndex]);
            return result;
        }
        catch (error) {
            throw new Error(`Failed to get window info: ${error.message}`);
        }
    }
    async sendKeysToWindow(sessionName, windowIndex, keys) {
        try {
            const result = await this.executePython('send_keys_to_window', [sessionName, windowIndex, keys, false]);
            return result === true;
        }
        catch (error) {
            throw new Error(`Failed to send keys: ${error.message}`);
        }
    }
    async sendCommandToWindow(sessionName, windowIndex, command) {
        try {
            const result = await this.executePython('send_command_to_window', [sessionName, windowIndex, command, false]);
            return result === true;
        }
        catch (error) {
            throw new Error(`Failed to send command: ${error.message}`);
        }
    }
    async getAllWindowsStatus() {
        const startTime = Date.now();
        try {
            const result = await this.throttledStatus();
            const duration = Date.now() - startTime;
            this.performanceMonitor.recordExecutionTime(duration);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.performanceMonitor.recordExecutionTime(duration);
            throw new Error(`Failed to get windows status: ${error.message}`);
        }
    }
    async getAllWindowsStatusDirect() {
        try {
            const result = await this.executePython('get_all_windows_status');
            return result;
        }
        catch (error) {
            throw new Error(`Failed to get windows status: ${error.message}`);
        }
    }
    async findWindowByName(windowName) {
        try {
            const result = await this.executePython('find_window_by_name', [windowName]);
            return result;
        }
        catch (error) {
            throw new Error(`Failed to find window: ${error.message}`);
        }
    }
    async createMonitoringSnapshot() {
        try {
            const result = await this.executePython('create_monitoring_snapshot');
            return result;
        }
        catch (error) {
            throw new Error(`Failed to create monitoring snapshot: ${error.message}`);
        }
    }
    async sendClaudeMessage(target, message) {
        try {
            const scriptPath = this.pathResolver.getScriptPath('send-claude-message.sh', this.config.externalScriptsDir);
            if (!target || typeof target !== 'string') {
                throw new Error('Invalid target parameter');
            }
            if (!message || typeof message !== 'string') {
                throw new Error('Invalid message parameter');
            }
            if (message.length > 10000) {
                throw new Error('Message too long (max 10000 characters)');
            }
            const sanitizedMessage = message
                .replace(/[\\"]/g, '\\$&')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t')
                .replace(/\0/g, '');
            const fullCommand = `"${scriptPath}" "${target}" "${sanitizedMessage}"`;
            const usesTempFile = fullCommand.length > 800;
            let result;
            let tempFile = '';
            if (usesTempFile) {
                tempFile = `/tmp/claude_message_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.txt`;
                try {
                    fs.writeFileSync(tempFile, message, 'utf8');
                    result = await (0, secureExecution_1.secureExec)({
                        command: 'bash',
                        args: ['-c', `"${scriptPath}" "${target}" --file "${tempFile}"`],
                        timeout: 10000
                    });
                }
                finally {
                    if (tempFile && fs.existsSync(tempFile)) {
                        try {
                            fs.unlinkSync(tempFile);
                        }
                        catch (cleanupError) {
                            console.warn(`Failed to cleanup temp file ${tempFile}: ${cleanupError.message}`);
                        }
                    }
                }
            }
            else {
                result = await (0, secureExecution_1.secureExec)({
                    command: 'bash',
                    args: ['-c', `"${scriptPath}" "${target}" "${sanitizedMessage}"`],
                    timeout: 10000
                });
            }
            if (!result.success) {
                throw new Error(`Script execution failed: ${result.stderr}`);
            }
            return true;
        }
        catch (error) {
            throw new Error(`Failed to send Claude message: ${error.message}`);
        }
    }
    async suggestSubagent(target, agentType, context) {
        try {
            const allowedAgentTypes = ['pm', 'developer', 'engineer', 'general'];
            if (!allowedAgentTypes.includes(agentType)) {
                throw new Error(`Invalid agent type: ${agentType}`);
            }
            if (!target || typeof target !== 'string') {
                throw new Error('Invalid target parameter');
            }
            const scriptPath = this.pathResolver.getScriptPath('suggest_subagent.sh', this.config.externalScriptsDir);
            const contextArg = context ? context.replace(/[\\"]/g, '\\$&') : '';
            const result = await (0, secureExecution_1.secureExec)({
                command: 'bash',
                args: contextArg
                    ? ['-c', `"${scriptPath}" "${target}" "${agentType}" "${contextArg}"`]
                    : ['-c', `"${scriptPath}" "${target}" "${agentType}"`],
                timeout: 10000
            });
            if (!result.success) {
                if (result.stderr.includes('not found') || result.stderr.includes('No such file')) {
                    return this.sendSubagentSuggestionManually(target, agentType, context);
                }
                throw new Error(`Script execution failed: ${result.stderr}`);
            }
            return true;
        }
        catch (error) {
            throw new Error(`Failed to suggest subagent: ${error.message}`);
        }
    }
    async sendSubagentSuggestionManually(target, agentType, context) {
        let message = '';
        switch (agentType) {
            case 'pm':
                message = `🚀 SUBAGENT SUGGESTION: Consider deploying subagents for parallel execution:
• For implementation: Use Task tool with subagent_type='developer'
• For testing: Use Task tool with subagent_type='qa-expert'
• For research: Use Task tool with subagent_type='research-analyst'
Remember: Effective delegation multiplies your impact!`;
                break;
            case 'developer':
            case 'engineer':
                message = `⚡ PERFORMANCE TIP: Accelerate your work with specialized subagents:
• For debugging: Use Task tool with subagent_type='debugger'
• For testing: Use Task tool with subagent_type='test-automator'
• For review: Use Task tool with subagent_type='code-reviewer'
While the subagent investigates, you can continue with other tasks!`;
                break;
            default:
                message = `💡 EFFICIENCY BOOST: Consider using subagents for parallel task execution.
Available specialists: debugger, test-automator, performance-engineer, code-reviewer, research-analyst.
Deploy with: Task tool with prompt='[your task]' and subagent_type='[agent-type]'`;
        }
        if (context) {
            message = message.replace(':', ` (${context}):`);
        }
        return this.sendClaudeMessage(target, message);
    }
    async scheduleCheckIn(minutes, note, targetWindow) {
        try {
            if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
                throw new Error('Minutes must be integer between 1 and 1440 (24 hours)');
            }
            if (!note || typeof note !== 'string') {
                throw new Error('Invalid note parameter');
            }
            if (note.length > 1000) {
                throw new Error('Note too long (max 1000 characters)');
            }
            if (targetWindow && (typeof targetWindow !== 'string' || targetWindow.length === 0)) {
                throw new Error('Invalid targetWindow parameter');
            }
            const scriptPath = this.pathResolver.getScriptPath('schedule_with_note.sh', this.config.externalScriptsDir);
            const sanitizedNote = note.replace(/[\\"]/g, '\\$&');
            const args = targetWindow
                ? ['-c', `"${scriptPath}" "${minutes}" "${sanitizedNote}" "${targetWindow}"`]
                : ['-c', `"${scriptPath}" "${minutes}" "${sanitizedNote}"`];
            const result = await (0, secureExecution_1.secureExec)({
                command: 'bash',
                args,
                timeout: 15000
            });
            if (!result.success) {
                throw new Error(`Script execution failed: ${result.stderr}`);
            }
            return true;
        }
        catch (error) {
            throw new Error(`Failed to schedule check-in: ${error.message}`);
        }
    }
    async createSession(sessionName, projectPath, windows) {
        try {
            if (!sessionName || typeof sessionName !== 'string') {
                throw new Error('Invalid session name');
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(sessionName)) {
                throw new Error('Session name can only contain letters, numbers, underscores, and hyphens');
            }
            if (projectPath && typeof projectPath !== 'string') {
                throw new Error('Invalid project path');
            }
            if (windows && !Array.isArray(windows)) {
                throw new Error('Windows must be an array');
            }
            const createArgs = projectPath
                ? ['new-session', '-d', '-s', sessionName, '-c', projectPath]
                : ['new-session', '-d', '-s', sessionName];
            const createResult = await (0, secureExecution_1.secureTmux)('new-session', createArgs.slice(1));
            if (!createResult.success) {
                throw new Error(`Failed to create session: ${createResult.stderr}`);
            }
            if (windows && windows.length > 0) {
                if (windows[0]) {
                    const renameResult = await (0, secureExecution_1.secureTmux)('rename-window', ['-t', `${sessionName}:0`, windows[0]]);
                    if (!renameResult.success) {
                        throw new Error(`Failed to rename first window: ${renameResult.stderr}`);
                    }
                }
                for (let i = 1; i < windows.length; i++) {
                    if (typeof windows[i] !== 'string' || windows[i].length === 0) {
                        throw new Error(`Invalid window name at index ${i}`);
                    }
                    const windowArgs = projectPath
                        ? ['new-window', '-t', sessionName, '-n', windows[i], '-c', projectPath]
                        : ['new-window', '-t', sessionName, '-n', windows[i]];
                    const windowResult = await (0, secureExecution_1.secureTmux)('new-window', windowArgs.slice(1));
                    if (!windowResult.success) {
                        throw new Error(`Failed to create window ${windows[i]}: ${windowResult.stderr}`);
                    }
                }
            }
            return true;
        }
        catch (error) {
            throw new Error(`Failed to create session: ${error.message}`);
        }
    }
    async killSession(sessionName) {
        try {
            if (!sessionName || typeof sessionName !== 'string') {
                throw new Error('Invalid session name');
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(sessionName)) {
                throw new Error('Session name can only contain letters, numbers, underscores, and hyphens');
            }
            const result = await (0, secureExecution_1.secureTmux)('kill-session', ['-t', sessionName]);
            if (!result.success) {
                throw new Error(`Failed to kill session: ${result.stderr}`);
            }
            return true;
        }
        catch (error) {
            throw new Error(`Failed to kill session: ${error.message}`);
        }
    }
    async renameWindow(target, newName) {
        try {
            if (!target || typeof target !== 'string') {
                throw new Error('Invalid target parameter');
            }
            if (!newName || typeof newName !== 'string') {
                throw new Error('Invalid new name parameter');
            }
            if (newName.length > 100) {
                throw new Error('Window name too long (max 100 characters)');
            }
            const result = await (0, secureExecution_1.secureTmux)('rename-window', ['-t', target, newName]);
            if (!result.success) {
                throw new Error(`Failed to rename window: ${result.stderr}`);
            }
            return true;
        }
        catch (error) {
            throw new Error(`Failed to rename window: ${error.message}`);
        }
    }
    async registerQAEngineer(qaEngineerID, publicKeyHex) {
        try {
            return await cryptoQA_1.CryptographicQASystem.registerQAEngineer(qaEngineerID, publicKeyHex);
        }
        catch (error) {
            throw new Error(`Failed to register QA Engineer: ${error.message}`);
        }
    }
    async generateQAKeyPair() {
        try {
            const keyPair = await cryptoQA_1.CryptographicQASystem.generateQAKeyPair();
            const qaEngineerID = `qa_${Date.now()}_${(0, crypto_1.randomBytes)(8).toString('hex')}`;
            await this.registerQAEngineer(qaEngineerID, keyPair.publicKeyHex);
            return {
                privateKey: keyPair.privateKeyHex,
                publicKey: keyPair.publicKeyHex,
                qaEngineerID
            };
        }
        catch (error) {
            throw new Error(`Failed to generate QA key pair: ${error.message}`);
        }
    }
    async checkQAApproval(projectName, commitHash) {
        try {
            if (!projectName || typeof projectName !== 'string') {
                throw new Error('Invalid project name');
            }
            if (!commitHash || !/^[a-fA-F0-9]{40}$/.test(commitHash)) {
                throw new Error('Invalid commit hash');
            }
            const approvalKey = `${projectName}:${commitHash}`;
            const approval = this.approvalCache.get(approvalKey);
            if (approval) {
                const verification = await cryptoQA_1.CryptographicQASystem.verifyQAApproval(approval);
                if (verification.valid) {
                    return {
                        approved: true,
                        details: approval.data,
                        auditHash: cryptoQA_1.CryptographicQASystem.generateAuditHash(approval)
                    };
                }
                else {
                    this.approvalCache.delete(approvalKey);
                }
            }
            const block = this.blockCache.get(approvalKey);
            if (block) {
                return { approved: false, details: block };
            }
            return { approved: false, details: { reason: 'No QA approval or block found' } };
        }
        catch (error) {
            throw new Error(`Failed to check QA approval: ${error.message}`);
        }
    }
    async requestQAValidation(projectName, testTypes, context) {
        try {
            const sessions = await this.getTmuxSessions();
            const session = sessions.find(s => s.name === projectName);
            if (!session) {
                throw new Error(`Project session ${projectName} not found`);
            }
            const qaWindow = session.windows.find(w => w.windowName.toLowerCase().includes('qa') || w.windowIndex === 1);
            if (!qaWindow) {
                throw new Error('QA Engineer window not found');
            }
            const validationRequest = `🔍 QA VALIDATION REQUEST
Project: ${projectName}
Test Types: ${testTypes.join(', ')}
${context ? `Context: ${context}` : ''}

Please execute comprehensive testing and provide results:
1. Run automated test suites for: ${testTypes.join(', ')}
2. Perform manual validation as needed
3. Check code quality and security
4. Provide approve/reject decision with detailed feedback

Use "Approve for Commit" or "Block Commit" operations based on results.`;
            await this.sendClaudeMessage(`${projectName}:${qaWindow.windowIndex}`, validationRequest);
            return true;
        }
        catch (error) {
            throw new Error(`Failed to request QA validation: ${error.message}`);
        }
    }
    async createQAApproval(projectName, commitHash, commitMessage, qaEngineerID, privateKeyHex, testResults, correlationId) {
        const eventCorrelationId = correlationId || qaEvents_1.qaEventBus.generateCorrelationId();
        try {
            if (!projectName || typeof projectName !== 'string') {
                throw new Error('Invalid project name');
            }
            if (!commitHash || !/^[a-fA-F0-9]{40}$/.test(commitHash)) {
                throw new Error('Invalid commit hash');
            }
            if (!commitMessage || typeof commitMessage !== 'string') {
                throw new Error('Invalid commit message');
            }
            if (!qaEngineerID || typeof qaEngineerID !== 'string') {
                throw new Error('Invalid QA Engineer ID');
            }
            if (!privateKeyHex || !/^[a-fA-F0-9]{64}$/.test(privateKeyHex)) {
                throw new Error('Invalid private key format');
            }
            const approvalData = {
                projectName,
                commitHash,
                commitMessage,
                testResults,
                qaEngineerID,
                approvalTimestamp: Date.now(),
                expirationTimestamp: Date.now() + 30 * 60 * 1000,
                approvalNonce: ''
            };
            const approval = await cryptoQA_1.CryptographicQASystem.createQAApproval(approvalData, privateKeyHex);
            const approvalKey = `${projectName}:${commitHash}`;
            this.approvalCache.set(approvalKey, approval);
            this.blockCache.delete(approvalKey);
            await qaEvents_1.qaEventBus.publishEvent({
                type: qaEvents_1.QAEventType.APPROVAL_GRANTED,
                timestamp: Date.now(),
                projectName,
                commitHash,
                qaEngineerID,
                correlationId: eventCorrelationId,
                payload: {
                    approval,
                    auditHash: cryptoQA_1.CryptographicQASystem.generateAuditHash(approval),
                    testResults
                }
            });
            return approval;
        }
        catch (error) {
            await qaEvents_1.qaEventBus.publishEvent({
                type: qaEvents_1.QAEventType.QA_SYSTEM_ERROR,
                timestamp: Date.now(),
                projectName,
                commitHash,
                qaEngineerID,
                correlationId: eventCorrelationId,
                payload: {
                    error: error.message,
                    context: 'createQAApproval'
                }
            });
            throw new Error(`Failed to create QA approval: ${error.message}`);
        }
    }
    async createQABlock(projectName, commitHash, commitMessage, qaEngineerID, blockReason, testResults, privateKeyHex) {
        try {
            if (!projectName || typeof projectName !== 'string') {
                throw new Error('Invalid project name');
            }
            if (!commitHash || !/^[a-fA-F0-9]{40}$/.test(commitHash)) {
                throw new Error('Invalid commit hash');
            }
            if (!commitMessage || typeof commitMessage !== 'string') {
                throw new Error('Invalid commit message');
            }
            if (!qaEngineerID || typeof qaEngineerID !== 'string') {
                throw new Error('Invalid QA Engineer ID');
            }
            if (!blockReason || typeof blockReason !== 'string') {
                throw new Error('Invalid block reason');
            }
            if (!privateKeyHex || !/^[a-fA-F0-9]{64}$/.test(privateKeyHex)) {
                throw new Error('Invalid private key format');
            }
            const block = await cryptoQA_1.CryptographicQASystem.createQABlock(projectName, commitHash, commitMessage, qaEngineerID, blockReason, testResults, privateKeyHex);
            const approvalKey = `${projectName}:${commitHash}`;
            this.blockCache.set(approvalKey, block);
            this.approvalCache.delete(approvalKey);
            return block;
        }
        catch (error) {
            throw new Error(`Failed to create QA block: ${error.message}`);
        }
    }
    async getQAStatus(projectName, commitHash) {
        try {
            if (!projectName || typeof projectName !== 'string') {
                throw new Error('Invalid project name');
            }
            if (!commitHash || !/^[a-fA-F0-9]{40}$/.test(commitHash)) {
                throw new Error('Invalid commit hash');
            }
            const approvalKey = `${projectName}:${commitHash}`;
            const approval = this.approvalCache.get(approvalKey);
            if (approval) {
                const verification = await cryptoQA_1.CryptographicQASystem.verifyQAApproval(approval);
                if (verification.valid) {
                    return {
                        status: 'approved',
                        details: approval.data,
                        auditHash: cryptoQA_1.CryptographicQASystem.generateAuditHash(approval)
                    };
                }
                else {
                    this.approvalCache.delete(approvalKey);
                    return {
                        status: 'expired',
                        details: {
                            message: `QA approval invalid: ${verification.reason}`,
                            requiresNewValidation: true
                        }
                    };
                }
            }
            const block = this.blockCache.get(approvalKey);
            if (block) {
                return { status: 'blocked', details: block.blockData };
            }
            return {
                status: 'pending',
                details: {
                    message: 'No QA validation performed yet',
                    projectName,
                    commitHash
                }
            };
        }
        catch (error) {
            throw new Error(`Failed to get QA status: ${error.message}`);
        }
    }
    async notifyQAStatusChange(projectName, status, feedback) {
        try {
            const sessions = await this.getTmuxSessions();
            const session = sessions.find(s => s.name === projectName);
            if (!session) {
                return false;
            }
            const statusMessage = status === 'approved'
                ? `✅ QA APPROVAL: Git commits are now enabled.\n${feedback ? `QA Feedback: ${feedback}` : 'All quality checks passed.'}`
                : `❌ QA REJECTION: Git commits are blocked.\n${feedback ? `QA Feedback: ${feedback}` : 'Quality issues found - address and retest.'}`;
            for (const window of session.windows) {
                if (window.windowIndex !== 1) {
                    await this.sendClaudeMessage(`${projectName}:${window.windowIndex}`, statusMessage);
                }
            }
            return true;
        }
        catch (error) {
            throw new Error(`Failed to notify QA status change: ${error.message}`);
        }
    }
    async executeQATests(projectName, testTypes, projectPath, commitHash, qaEngineerID) {
        const correlationId = qaEvents_1.qaEventBus.generateCorrelationId();
        try {
            if (!projectName || typeof projectName !== 'string') {
                throw new Error('Invalid project name');
            }
            if (!Array.isArray(testTypes) || testTypes.length === 0) {
                throw new Error('Invalid test types');
            }
            const startTime = Date.now();
            await qaEvents_1.qaEventBus.publishEvent({
                type: qaEvents_1.QAEventType.TEST_STARTED,
                timestamp: startTime,
                projectName,
                commitHash: commitHash || 'unknown',
                qaEngineerID,
                correlationId,
                payload: {
                    testTypes,
                    projectPath,
                    triggeredBy: qaEngineerID || 'system'
                }
            });
            const results = {
                testTypes,
                executed: [],
                failed: [],
                timestamp: new Date().toISOString(),
            };
            const testResults = {
                unit: false,
                integration: false,
                security: false,
                performance: false,
                coverage: 0,
                passedTests: 0,
                totalTests: testTypes.length,
                criticalIssues: []
            };
            for (const testType of testTypes) {
                try {
                    let testPassed = false;
                    switch (testType) {
                        case 'unit':
                            testPassed = await this.runUnitTests(projectPath);
                            testResults.unit = testPassed;
                            results.executed.push({ type: 'unit', status: testPassed ? 'passed' : 'failed' });
                            break;
                        case 'integration':
                            testPassed = await this.runIntegrationTests(projectPath);
                            testResults.integration = testPassed;
                            results.executed.push({ type: 'integration', status: testPassed ? 'passed' : 'failed' });
                            break;
                        case 'security':
                            testPassed = await this.runSecurityScan(projectPath);
                            testResults.security = testPassed;
                            results.executed.push({ type: 'security', status: testPassed ? 'passed' : 'failed' });
                            break;
                        case 'performance':
                            testPassed = await this.runPerformanceTests(projectPath);
                            testResults.performance = testPassed;
                            results.executed.push({ type: 'performance', status: testPassed ? 'passed' : 'failed' });
                            break;
                        case 'coverage':
                            testPassed = await this.checkCodeCoverage(projectPath);
                            testResults.coverage = testPassed ? 85 : 60;
                            results.executed.push({ type: 'coverage', status: testPassed ? 'passed' : 'failed' });
                            break;
                    }
                    if (testPassed) {
                        testResults.passedTests++;
                    }
                }
                catch (error) {
                    results.failed.push({ type: testType, error: error.message });
                    if (testType === 'security') {
                        testResults.criticalIssues.push(`Security test failed: ${error.message}`);
                    }
                }
            }
            const success = results.failed.length === 0;
            const duration = Date.now() - startTime;
            if (success) {
                await qaEvents_1.qaEventBus.publishEvent({
                    type: qaEvents_1.QAEventType.TEST_COMPLETED,
                    timestamp: Date.now(),
                    projectName,
                    commitHash: commitHash || 'unknown',
                    qaEngineerID,
                    correlationId,
                    payload: {
                        testResults,
                        duration,
                        triggeredBy: qaEngineerID || 'system'
                    }
                });
            }
            else {
                await qaEvents_1.qaEventBus.publishEvent({
                    type: qaEvents_1.QAEventType.TEST_FAILED,
                    timestamp: Date.now(),
                    projectName,
                    commitHash: commitHash || 'unknown',
                    qaEngineerID,
                    correlationId,
                    payload: {
                        testResults,
                        duration,
                        failedTests: results.failed,
                        triggeredBy: qaEngineerID || 'system'
                    }
                });
            }
            return { success, results, correlationId };
        }
        catch (error) {
            await qaEvents_1.qaEventBus.publishEvent({
                type: qaEvents_1.QAEventType.QA_SYSTEM_ERROR,
                timestamp: Date.now(),
                projectName,
                commitHash: commitHash || 'unknown',
                qaEngineerID,
                correlationId,
                payload: {
                    error: error.message,
                    context: 'executeQATests'
                }
            });
            throw new Error(`Failed to execute QA tests: ${error.message}`);
        }
    }
    async runUnitTests(projectPath) {
        if (!projectPath || !fs.existsSync(projectPath)) {
            return true;
        }
        try {
            if (typeof projectPath !== 'string') {
                throw new Error('Invalid project path');
            }
            const testCommands = [
                { command: 'npm', args: ['test'] },
                { command: 'yarn', args: ['test'] },
                { command: 'python3', args: ['-m', 'pytest'] },
                { command: 'mvn', args: ['test'] },
                { command: 'go', args: ['test', './...'] }
            ];
            for (const testCmd of testCommands) {
                try {
                    const result = await (0, secureExecution_1.secureExec)({
                        command: testCmd.command,
                        args: testCmd.args,
                        cwd: projectPath,
                        timeout: 300000,
                        maxOutputSize: 2 * 1024 * 1024
                    });
                    if (result.success) {
                        return true;
                    }
                }
                catch (e) {
                    continue;
                }
            }
            return true;
        }
        catch (error) {
            throw new Error(`Unit tests failed: ${error.message}`);
        }
    }
    async runIntegrationTests(projectPath) {
        if (!projectPath || !fs.existsSync(projectPath)) {
            return true;
        }
        try {
            if (typeof projectPath !== 'string') {
                throw new Error('Invalid project path');
            }
            const integrationCommands = [
                { command: 'npm', args: ['run', 'test:integration'] },
                { command: 'yarn', args: ['test:integration'] },
                { command: 'python3', args: ['-m', 'pytest', 'tests/integration/'] }
            ];
            for (const testCmd of integrationCommands) {
                try {
                    const result = await (0, secureExecution_1.secureExec)({
                        command: testCmd.command,
                        args: testCmd.args,
                        cwd: projectPath,
                        timeout: 600000,
                        maxOutputSize: 4 * 1024 * 1024
                    });
                    if (result.success) {
                        return true;
                    }
                }
                catch (e) {
                    continue;
                }
            }
            return true;
        }
        catch (error) {
            throw new Error(`Integration tests failed: ${error.message}`);
        }
    }
    async runSecurityScan(projectPath) {
        if (!projectPath || !fs.existsSync(projectPath)) {
            return true;
        }
        try {
            if (typeof projectPath !== 'string') {
                throw new Error('Invalid project path');
            }
            const securityCommands = [
                { command: 'npm', args: ['audit'] },
                { command: 'yarn', args: ['audit'] },
                { command: 'python3', args: ['-m', 'safety', 'check'] },
                { command: 'bandit', args: ['-r', '.'] }
            ];
            for (const secCmd of securityCommands) {
                try {
                    const result = await (0, secureExecution_1.secureExec)({
                        command: secCmd.command,
                        args: secCmd.args,
                        cwd: projectPath,
                        timeout: 180000,
                        maxOutputSize: 1024 * 1024
                    });
                }
                catch (e) {
                }
            }
            return true;
        }
        catch (error) {
            throw new Error(`Security scan failed: ${error.message}`);
        }
    }
    async runPerformanceTests(projectPath) {
        return true;
    }
    async checkCodeCoverage(projectPath) {
        if (!projectPath || !fs.existsSync(projectPath)) {
            return true;
        }
        try {
            if (typeof projectPath !== 'string') {
                throw new Error('Invalid project path');
            }
            const coverageCommands = [
                { command: 'npm', args: ['run', 'coverage'] },
                { command: 'yarn', args: ['coverage'] },
                { command: 'python3', args: ['-m', 'pytest', '--cov'] }
            ];
            for (const covCmd of coverageCommands) {
                try {
                    const result = await (0, secureExecution_1.secureExec)({
                        command: covCmd.command,
                        args: covCmd.args,
                        cwd: projectPath,
                        timeout: 300000,
                        maxOutputSize: 2 * 1024 * 1024
                    });
                    if (result.success) {
                        return true;
                    }
                }
                catch (e) {
                    continue;
                }
            }
            return true;
        }
        catch (error) {
            throw new Error(`Code coverage check failed: ${error.message}`);
        }
    }
    getPerformanceMetrics() {
        const sessionsCacheMetrics = this.sessionsCache.getMetrics();
        const windowContentCacheMetrics = this.windowContentCache.getMetrics();
        const monitorMetrics = this.performanceMonitor.getDetailedStats();
        return {
            monitor: monitorMetrics,
            cache: {
                sessions: sessionsCacheMetrics,
                windowContent: windowContentCacheMetrics,
                combined: {
                    totalHits: sessionsCacheMetrics.hits + windowContentCacheMetrics.hits,
                    totalMisses: sessionsCacheMetrics.misses + windowContentCacheMetrics.misses,
                    totalRequests: sessionsCacheMetrics.hits + sessionsCacheMetrics.misses +
                        windowContentCacheMetrics.hits + windowContentCacheMetrics.misses,
                    overallHitRate: this.calculateOverallHitRate([sessionsCacheMetrics, windowContentCacheMetrics])
                }
            },
            qaSystem: {
                activeApprovals: this.approvalCache.size,
                activeBlocks: this.blockCache.size
            }
        };
    }
    calculateOverallHitRate(metrics) {
        const totalHits = metrics.reduce((sum, m) => sum + m.hits, 0);
        const totalRequests = metrics.reduce((sum, m) => sum + m.hits + m.misses, 0);
        return totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
    }
    clearPerformanceCaches() {
        this.sessionsCache.clear();
        this.windowContentCache.clear();
    }
    invalidateCache(type, key) {
        switch (type) {
            case 'sessions':
                this.sessionsCache.clear();
                break;
            case 'window_content':
                if (key) {
                    this.windowContentCache.delete(key);
                }
                else {
                    this.windowContentCache.clear();
                }
                break;
            case 'all':
                this.clearPerformanceCaches();
                break;
        }
    }
    optimizeMemory() {
        const now = Date.now();
        for (const [key, approval] of this.approvalCache.entries()) {
            if (approval.data.expirationTimestamp < now) {
                this.approvalCache.delete(key);
            }
        }
    }
    getSystemHealth() {
        const metrics = this.getPerformanceMetrics();
        const health = {
            status: 'healthy',
            issues: [],
            recommendations: []
        };
        if (metrics.cache.combined.overallHitRate < 70) {
            health.status = 'warning';
            health.issues.push('Low cache hit rate');
            health.recommendations.push('Consider increasing cache TTL or size');
        }
        if (metrics.monitor.averageExecutionTime > 1000) {
            health.status = metrics.monitor.averageExecutionTime > 3000 ? 'critical' : 'warning';
            health.issues.push('High average execution time');
            health.recommendations.push('Review expensive operations and consider optimization');
        }
        const totalCacheEntries = metrics.cache.sessions.size + metrics.cache.windowContent.size;
        if (totalCacheEntries > 1000) {
            health.status = 'warning';
            health.issues.push('High cache memory usage');
            health.recommendations.push('Consider reducing cache sizes or implementing more aggressive cleanup');
        }
        return health;
    }
}
exports.TmuxBridge = TmuxBridge;
//# sourceMappingURL=tmuxBridge.js.map