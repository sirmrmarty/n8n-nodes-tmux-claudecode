"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qaEventBus = exports.QAWorkflowOrchestrator = exports.QAEventBus = exports.QAEventType = void 0;
const events_1 = require("events");
var QAEventType;
(function (QAEventType) {
    QAEventType["TEST_STARTED"] = "qa.test.started";
    QAEventType["TEST_COMPLETED"] = "qa.test.completed";
    QAEventType["TEST_FAILED"] = "qa.test.failed";
    QAEventType["VALIDATION_REQUESTED"] = "qa.validation.requested";
    QAEventType["VALIDATION_IN_PROGRESS"] = "qa.validation.in_progress";
    QAEventType["VALIDATION_COMPLETED"] = "qa.validation.completed";
    QAEventType["APPROVAL_GRANTED"] = "qa.approval.granted";
    QAEventType["APPROVAL_REJECTED"] = "qa.approval.rejected";
    QAEventType["APPROVAL_EXPIRED"] = "qa.approval.expired";
    QAEventType["COMMIT_BLOCKED"] = "qa.commit.blocked";
    QAEventType["COMMIT_ALLOWED"] = "qa.commit.allowed";
    QAEventType["SECURITY_VIOLATION"] = "qa.security.violation";
    QAEventType["UNAUTHORIZED_ACCESS"] = "qa.security.unauthorized";
    QAEventType["QA_ENGINEER_REGISTERED"] = "qa.system.engineer_registered";
    QAEventType["QA_SYSTEM_ERROR"] = "qa.system.error";
})(QAEventType || (exports.QAEventType = QAEventType = {}));
class QAEventBus extends events_1.EventEmitter {
    constructor() {
        super();
        this.eventLog = [];
        this.maxEventLogSize = 10000;
        this._listeners = new Map();
        this.setMaxListeners(50);
    }
    static getInstance() {
        if (!QAEventBus.instance) {
            QAEventBus.instance = new QAEventBus();
        }
        return QAEventBus.instance;
    }
    async publishEvent(event) {
        try {
            if (!event.timestamp) {
                event.timestamp = Date.now();
            }
            this.eventLog.push(event);
            if (this.eventLog.length > this.maxEventLogSize) {
                this.eventLog = this.eventLog.slice(-this.maxEventLogSize);
            }
            this.emit(event.type, event);
            this.emit('*', event);
        }
        catch (error) {
            const errorEvent = {
                type: QAEventType.QA_SYSTEM_ERROR,
                timestamp: Date.now(),
                projectName: event.projectName || 'unknown',
                commitHash: event.commitHash || 'unknown',
                correlationId: event.correlationId || this.generateCorrelationId(),
                payload: {
                    error: error.message,
                    originalEvent: event
                }
            };
            this.emit(QAEventType.QA_SYSTEM_ERROR, errorEvent);
        }
    }
    subscribe(eventType, listener, listenerId) {
        const id = listenerId || this.generateListenerId();
        if (!this._listeners.has(eventType)) {
            this._listeners.set(eventType, new Set());
        }
        this._listeners.get(eventType).add(id);
        this.on(eventType, listener);
        return id;
    }
    unsubscribe(eventType, listenerId) {
        const listeners = this._listeners.get(eventType);
        if (listeners && listeners.has(listenerId)) {
            listeners.delete(listenerId);
            this.removeListener(eventType, this._listeners.get(eventType));
            return true;
        }
        return false;
    }
    getEvents(filter) {
        let events = [...this.eventLog];
        if (filter) {
            if (filter.projectName) {
                events = events.filter(e => e.projectName === filter.projectName);
            }
            if (filter.commitHash) {
                events = events.filter(e => e.commitHash === filter.commitHash);
            }
            if (filter.eventType) {
                events = events.filter(e => e.type === filter.eventType);
            }
            if (filter.since) {
                events = events.filter(e => e.timestamp >= filter.since);
            }
            if (filter.limit) {
                events = events.slice(-filter.limit);
            }
        }
        return events.sort((a, b) => a.timestamp - b.timestamp);
    }
    generateCorrelationId() {
        return `qa_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    generateListenerId() {
        return `listener_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    }
    createWorkflowOrchestrator() {
        return new QAWorkflowOrchestrator(this);
    }
}
exports.QAEventBus = QAEventBus;
class QAWorkflowOrchestrator {
    constructor(eventBus) {
        this.activeWorkflows = new Map();
        this.eventBus = eventBus;
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        this.eventBus.subscribe(QAEventType.TEST_COMPLETED, async (event) => {
            await this.handleTestCompleted(event);
        });
        this.eventBus.subscribe(QAEventType.VALIDATION_COMPLETED, async (event) => {
            await this.handleValidationCompleted(event);
        });
        this.eventBus.subscribe(QAEventType.APPROVAL_GRANTED, async (event) => {
            await this.handleApprovalGranted(event);
        });
        this.eventBus.subscribe(QAEventType.APPROVAL_REJECTED, async (event) => {
            await this.handleApprovalRejected(event);
        });
        this.eventBus.subscribe(QAEventType.SECURITY_VIOLATION, async (event) => {
            await this.handleSecurityViolation(event);
        });
    }
    async handleTestCompleted(event) {
        const workflowKey = `${event.projectName}:${event.commitHash}`;
        const workflow = this.getOrCreateWorkflow(workflowKey, event);
        workflow.testResults = event.payload.testResults;
        workflow.testCompletedAt = event.timestamp;
        if (this.shouldTriggerValidation(event.payload.testResults)) {
            await this.eventBus.publishEvent({
                type: QAEventType.VALIDATION_REQUESTED,
                timestamp: Date.now(),
                projectName: event.projectName,
                commitHash: event.commitHash,
                qaEngineerID: event.qaEngineerID,
                correlationId: event.correlationId,
                payload: {
                    testResults: event.payload.testResults,
                    autoTriggered: true
                }
            });
        }
    }
    async handleValidationCompleted(event) {
        const workflowKey = `${event.projectName}:${event.commitHash}`;
        const workflow = this.getOrCreateWorkflow(workflowKey, event);
        workflow.validationCompletedAt = event.timestamp;
    }
    async handleApprovalGranted(event) {
        await this.eventBus.publishEvent({
            type: QAEventType.COMMIT_ALLOWED,
            timestamp: Date.now(),
            projectName: event.projectName,
            commitHash: event.commitHash,
            qaEngineerID: event.qaEngineerID,
            correlationId: event.correlationId,
            payload: {
                approvalHash: event.payload.auditHash,
                validUntil: event.payload.approval.data.expirationTimestamp
            }
        });
    }
    async handleApprovalRejected(event) {
        await this.eventBus.publishEvent({
            type: QAEventType.COMMIT_BLOCKED,
            timestamp: Date.now(),
            projectName: event.projectName,
            commitHash: event.commitHash,
            qaEngineerID: event.qaEngineerID,
            correlationId: event.correlationId,
            payload: {
                blockReason: event.payload.blockReason,
                criticalIssues: event.payload.criticalIssues
            }
        });
    }
    async handleSecurityViolation(event) {
        if (event.payload.severity === 'critical' || event.payload.severity === 'high') {
            await this.eventBus.publishEvent({
                type: QAEventType.COMMIT_BLOCKED,
                timestamp: Date.now(),
                projectName: event.projectName,
                commitHash: event.commitHash,
                correlationId: event.correlationId,
                payload: {
                    blockReason: `Security violation: ${event.payload.violationType}`,
                    securityBlock: true
                }
            });
        }
    }
    shouldTriggerValidation(testResults) {
        return testResults.unit &&
            testResults.integration &&
            testResults.security &&
            testResults.performance &&
            testResults.coverage >= 80 &&
            testResults.criticalIssues.length === 0;
    }
    getOrCreateWorkflow(key, event) {
        if (!this.activeWorkflows.has(key)) {
            this.activeWorkflows.set(key, {
                projectName: event.projectName,
                commitHash: event.commitHash,
                correlationId: event.correlationId,
                startedAt: event.timestamp,
                status: 'in_progress'
            });
        }
        return this.activeWorkflows.get(key);
    }
}
exports.QAWorkflowOrchestrator = QAWorkflowOrchestrator;
exports.qaEventBus = QAEventBus.getInstance();
//# sourceMappingURL=qaEvents.js.map