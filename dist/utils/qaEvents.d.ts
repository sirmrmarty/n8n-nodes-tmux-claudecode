import { EventEmitter } from 'events';
import { QATestResults, CryptoQAApproval } from './cryptoQA';
export interface QAEvent {
    type: QAEventType;
    timestamp: number;
    projectName: string;
    commitHash: string;
    qaEngineerID?: string;
    payload?: any;
    correlationId: string;
}
export declare enum QAEventType {
    TEST_STARTED = "qa.test.started",
    TEST_COMPLETED = "qa.test.completed",
    TEST_FAILED = "qa.test.failed",
    VALIDATION_REQUESTED = "qa.validation.requested",
    VALIDATION_IN_PROGRESS = "qa.validation.in_progress",
    VALIDATION_COMPLETED = "qa.validation.completed",
    APPROVAL_GRANTED = "qa.approval.granted",
    APPROVAL_REJECTED = "qa.approval.rejected",
    APPROVAL_EXPIRED = "qa.approval.expired",
    COMMIT_BLOCKED = "qa.commit.blocked",
    COMMIT_ALLOWED = "qa.commit.allowed",
    SECURITY_VIOLATION = "qa.security.violation",
    UNAUTHORIZED_ACCESS = "qa.security.unauthorized",
    QA_ENGINEER_REGISTERED = "qa.system.engineer_registered",
    QA_SYSTEM_ERROR = "qa.system.error"
}
export interface QATestStartedEvent extends QAEvent {
    type: QAEventType.TEST_STARTED;
    payload: {
        testTypes: string[];
        projectPath?: string;
        triggeredBy: string;
    };
}
export interface QATestCompletedEvent extends QAEvent {
    type: QAEventType.TEST_COMPLETED;
    payload: {
        testResults: QATestResults;
        duration: number;
        triggeredBy: string;
    };
}
export interface QAApprovalGrantedEvent extends QAEvent {
    type: QAEventType.APPROVAL_GRANTED;
    payload: {
        approval: CryptoQAApproval;
        auditHash: string;
        testResults: QATestResults;
    };
}
export interface QAApprovalRejectedEvent extends QAEvent {
    type: QAEventType.APPROVAL_REJECTED;
    payload: {
        blockReason: string;
        testResults: QATestResults;
        criticalIssues: string[];
    };
}
export interface QACommitBlockedEvent extends QAEvent {
    type: QAEventType.COMMIT_BLOCKED;
    payload: {
        blockReason: string;
        attemptedBy?: string;
        bypassAttempted?: boolean;
    };
}
export interface QASecurityViolationEvent extends QAEvent {
    type: QAEventType.SECURITY_VIOLATION;
    payload: {
        violationType: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        details: string;
        sourceIP?: string;
        userAgent?: string;
    };
}
export declare class QAEventBus extends EventEmitter {
    private static instance;
    private eventLog;
    private maxEventLogSize;
    private _listeners;
    private constructor();
    static getInstance(): QAEventBus;
    publishEvent(event: QAEvent): Promise<void>;
    subscribe(eventType: QAEventType | '*', listener: (event: QAEvent) => void, listenerId?: string): string;
    unsubscribe(eventType: QAEventType | '*', listenerId: string): boolean;
    getEvents(filter?: {
        projectName?: string;
        commitHash?: string;
        eventType?: QAEventType;
        since?: number;
        limit?: number;
    }): QAEvent[];
    generateCorrelationId(): string;
    private generateListenerId;
    createWorkflowOrchestrator(): QAWorkflowOrchestrator;
}
export declare class QAWorkflowOrchestrator {
    private eventBus;
    private activeWorkflows;
    constructor(eventBus: QAEventBus);
    private setupEventHandlers;
    private handleTestCompleted;
    private handleValidationCompleted;
    private handleApprovalGranted;
    private handleApprovalRejected;
    private handleSecurityViolation;
    private shouldTriggerValidation;
    private getOrCreateWorkflow;
}
export declare const qaEventBus: QAEventBus;
