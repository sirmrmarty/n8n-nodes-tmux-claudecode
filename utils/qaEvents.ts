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

export enum QAEventType {
	// Test Events
	TEST_STARTED = 'qa.test.started',
	TEST_COMPLETED = 'qa.test.completed',
	TEST_FAILED = 'qa.test.failed',
	
	// Validation Events
	VALIDATION_REQUESTED = 'qa.validation.requested',
	VALIDATION_IN_PROGRESS = 'qa.validation.in_progress',
	VALIDATION_COMPLETED = 'qa.validation.completed',
	
	// Approval Events
	APPROVAL_GRANTED = 'qa.approval.granted',
	APPROVAL_REJECTED = 'qa.approval.rejected',
	APPROVAL_EXPIRED = 'qa.approval.expired',
	
	// Commit Events
	COMMIT_BLOCKED = 'qa.commit.blocked',
	COMMIT_ALLOWED = 'qa.commit.allowed',
	
	// Security Events
	SECURITY_VIOLATION = 'qa.security.violation',
	UNAUTHORIZED_ACCESS = 'qa.security.unauthorized',
	
	// System Events
	QA_ENGINEER_REGISTERED = 'qa.system.engineer_registered',
	QA_SYSTEM_ERROR = 'qa.system.error'
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

export class QAEventBus extends EventEmitter {
	private static instance: QAEventBus;
	private eventLog: QAEvent[] = [];
	private maxEventLogSize = 10000;
	private _listeners = new Map<QAEventType, Set<string>>();

	private constructor() {
		super();
		this.setMaxListeners(50); // Allow more listeners for complex workflows
	}

	static getInstance(): QAEventBus {
		if (!QAEventBus.instance) {
			QAEventBus.instance = new QAEventBus();
		}
		return QAEventBus.instance;
	}

	/**
	 * Publish a QA event to the bus
	 */
	async publishEvent(event: QAEvent): Promise<void> {
		try {
			// Add timestamp if not present
			if (!event.timestamp) {
				event.timestamp = Date.now();
			}

			// Store event in log
			this.eventLog.push(event);
			
			// Trim log if it gets too large
			if (this.eventLog.length > this.maxEventLogSize) {
				this.eventLog = this.eventLog.slice(-this.maxEventLogSize);
			}

			// Emit the event
			this.emit(event.type, event);
			this.emit('*', event); // Global listener

		} catch (error) {
			// Emit system error if event publishing fails
			const errorEvent: QAEvent = {
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

	/**
	 * Subscribe to specific QA event types
	 */
	subscribe(eventType: QAEventType | '*', listener: (event: QAEvent) => void, listenerId?: string): string {
		const id = listenerId || this.generateListenerId();
		
		// Track listeners
		if (!this._listeners.has(eventType as QAEventType)) {
			this._listeners.set(eventType as QAEventType, new Set());
		}
		this._listeners.get(eventType as QAEventType)!.add(id);

		// Add event listener
		this.on(eventType as string, listener);
		
		return id;
	}

	/**
	 * Unsubscribe from events
	 */
	unsubscribe(eventType: QAEventType | '*', listenerId: string): boolean {
		const listeners = this._listeners.get(eventType as QAEventType);
		if (listeners && listeners.has(listenerId)) {
			listeners.delete(listenerId);
			this.removeListener(eventType as string, this._listeners.get(eventType as QAEventType) as any);
			return true;
		}
		return false;
	}

	/**
	 * Get events from log with optional filtering
	 */
	getEvents(filter?: {
		projectName?: string;
		commitHash?: string;
		eventType?: QAEventType;
		since?: number;
		limit?: number;
	}): QAEvent[] {
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
				events = events.filter(e => e.timestamp >= filter.since!);
			}
			if (filter.limit) {
				events = events.slice(-filter.limit);
			}
		}

		return events.sort((a, b) => a.timestamp - b.timestamp);
	}

	/**
	 * Generate correlation ID for event tracking
	 */
	generateCorrelationId(): string {
		return `qa_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
	}

	private generateListenerId(): string {
		return `listener_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
	}

	/**
	 * Create QA workflow orchestrator that manages event sequences
	 */
	createWorkflowOrchestrator(): QAWorkflowOrchestrator {
		return new QAWorkflowOrchestrator(this);
	}
}

export class QAWorkflowOrchestrator {
	private eventBus: QAEventBus;
	private activeWorkflows = new Map<string, QAWorkflowState>();

	constructor(eventBus: QAEventBus) {
		this.eventBus = eventBus;
		this.setupEventHandlers();
	}

	private setupEventHandlers(): void {
		// Handle test completion -> validation request
		this.eventBus.subscribe(QAEventType.TEST_COMPLETED, async (event: QAEvent) => {
			await this.handleTestCompleted(event as QATestCompletedEvent);
		});

		// Handle validation completion -> approval/rejection decision
		this.eventBus.subscribe(QAEventType.VALIDATION_COMPLETED, async (event: QAEvent) => {
			await this.handleValidationCompleted(event);
		});

		// Handle approval granted -> notify stakeholders
		this.eventBus.subscribe(QAEventType.APPROVAL_GRANTED, async (event: QAEvent) => {
			await this.handleApprovalGranted(event as QAApprovalGrantedEvent);
		});

		// Handle approval rejected -> notify and block
		this.eventBus.subscribe(QAEventType.APPROVAL_REJECTED, async (event: QAEvent) => {
			await this.handleApprovalRejected(event as QAApprovalRejectedEvent);
		});

		// Handle security violations
		this.eventBus.subscribe(QAEventType.SECURITY_VIOLATION, async (event: QAEvent) => {
			await this.handleSecurityViolation(event as QASecurityViolationEvent);
		});
	}

	private async handleTestCompleted(event: QATestCompletedEvent): Promise<void> {
		const workflowKey = `${event.projectName}:${event.commitHash}`;
		
		// Update workflow state
		const workflow = this.getOrCreateWorkflow(workflowKey, event);
		workflow.testResults = event.payload.testResults;
		workflow.testCompletedAt = event.timestamp;

		// Automatically trigger validation if tests passed
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

	private async handleValidationCompleted(event: QAEvent): Promise<void> {
		// Logic for handling completed validation
		const workflowKey = `${event.projectName}:${event.commitHash}`;
		const workflow = this.getOrCreateWorkflow(workflowKey, event);
		workflow.validationCompletedAt = event.timestamp;
	}

	private async handleApprovalGranted(event: QAApprovalGrantedEvent): Promise<void> {
		// Notify all stakeholders of approval
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

	private async handleApprovalRejected(event: QAApprovalRejectedEvent): Promise<void> {
		// Block commits and notify stakeholders
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

	private async handleSecurityViolation(event: QASecurityViolationEvent): Promise<void> {
		// Handle security violations with appropriate escalation
		if (event.payload.severity === 'critical' || event.payload.severity === 'high') {
			// Immediately block all commits for this project
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

	private shouldTriggerValidation(testResults: QATestResults): boolean {
		return testResults.unit && 
		       testResults.integration && 
		       testResults.security && 
		       testResults.performance &&
		       testResults.coverage >= 80 &&
		       testResults.criticalIssues.length === 0;
	}

	private getOrCreateWorkflow(key: string, event: QAEvent): QAWorkflowState {
		if (!this.activeWorkflows.has(key)) {
			this.activeWorkflows.set(key, {
				projectName: event.projectName,
				commitHash: event.commitHash,
				correlationId: event.correlationId,
				startedAt: event.timestamp,
				status: 'in_progress'
			});
		}
		return this.activeWorkflows.get(key)!;
	}
}

interface QAWorkflowState {
	projectName: string;
	commitHash: string;
	correlationId: string;
	startedAt: number;
	testCompletedAt?: number;
	validationCompletedAt?: number;
	finalizedAt?: number;
	status: 'in_progress' | 'approved' | 'rejected' | 'expired' | 'error';
	testResults?: QATestResults;
}

// Export singleton instance
export const qaEventBus = QAEventBus.getInstance();