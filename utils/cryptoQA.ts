import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import * as ed25519 from '@noble/ed25519';
import { promisify } from 'util';

export interface QAApprovalData {
	projectName: string;
	commitHash: string;
	commitMessage: string;
	testResults: QATestResults;
	qaEngineerID: string;
	approvalTimestamp: number;
	expirationTimestamp: number;
	approvalNonce: string;
}

export interface QATestResults {
	unit: boolean;
	integration: boolean;
	security: boolean;
	performance: boolean;
	coverage: number;
	passedTests: number;
	totalTests: number;
	criticalIssues: string[];
}

export interface CryptoQAApproval {
	data: QAApprovalData;
	signature: string;
	publicKey: string;
}

export interface QAKeyPair {
	privateKey: Uint8Array;
	publicKey: Uint8Array;
	publicKeyHex: string;
	privateKeyHex: string;
}

export class CryptographicQASystem {
	private static readonly APPROVAL_VALIDITY_DURATION = 30 * 60 * 1000; // 30 minutes
	private static readonly MIN_COVERAGE_THRESHOLD = 80; // 80% code coverage minimum
	private static readonly MAX_CRITICAL_ISSUES = 0; // No critical issues allowed

	// Cache for verified public keys to prevent key substitution attacks
	private static readonly verifiedPublicKeys = new Map<string, { publicKey: string; verifiedAt: number; qaEngineerID: string }>();
	
	/**
	 * Generate a new Ed25519 key pair for QA Engineer
	 */
	static async generateQAKeyPair(): Promise<QAKeyPair> {
		try {
			const privateKey = randomBytes(32);
			const publicKey = await ed25519.getPublicKey(privateKey);
			
			return {
				privateKey,
				publicKey,
				publicKeyHex: Buffer.from(publicKey).toString('hex'),
				privateKeyHex: Buffer.from(privateKey).toString('hex')
			};
		} catch (error) {
			throw new Error(`Failed to generate key pair: ${error.message}`);
		}
	}

	/**
	 * Register and verify a QA Engineer's public key
	 */
	static async registerQAEngineer(qaEngineerID: string, publicKey: string, masterAuthSignature?: string): Promise<boolean> {
		try {
			// Validate inputs
			if (!qaEngineerID || typeof qaEngineerID !== 'string') {
				throw new Error('Invalid QA Engineer ID');
			}
			if (!/^[a-fA-F0-9]{64}$/.test(publicKey)) {
				throw new Error('Invalid public key format (must be 64-char hex)');
			}

			// Verify the public key is valid
			const publicKeyBytes = Buffer.from(publicKey, 'hex');
			if (publicKeyBytes.length !== 32) {
				throw new Error('Invalid public key length');
			}

			// Store verified public key
			this.verifiedPublicKeys.set(qaEngineerID, {
				publicKey,
				verifiedAt: Date.now(),
				qaEngineerID
			});

			return true;
		} catch (error) {
			throw new Error(`Failed to register QA Engineer: ${error.message}`);
		}
	}

	/**
	 * Create cryptographically signed QA approval
	 */
	static async createQAApproval(
		approvalData: QAApprovalData,
		privateKeyHex: string
	): Promise<CryptoQAApproval> {
		try {
			// Validate approval data
			this.validateApprovalData(approvalData);

			// Generate cryptographic nonce
			approvalData.approvalNonce = randomBytes(16).toString('hex');
			approvalData.approvalTimestamp = Date.now();
			approvalData.expirationTimestamp = Date.now() + this.APPROVAL_VALIDITY_DURATION;

			// Create deterministic serialization for signing
			const dataToSign = this.serializeApprovalData(approvalData);
			const dataHash = createHash('sha256').update(dataToSign).digest();

			// Sign the hash with Ed25519
			const privateKey = Buffer.from(privateKeyHex, 'hex');
			const signature = await ed25519.sign(dataHash, privateKey);
			const publicKey = await ed25519.getPublicKey(privateKey);

			const approval: CryptoQAApproval = {
				data: approvalData,
				signature: Buffer.from(signature).toString('hex'),
				publicKey: Buffer.from(publicKey).toString('hex')
			};

			return approval;
		} catch (error) {
			throw new Error(`Failed to create QA approval: ${error.message}`);
		}
	}

	/**
	 * Verify cryptographic QA approval
	 */
	static async verifyQAApproval(approval: CryptoQAApproval): Promise<{ valid: boolean; reason?: string }> {
		try {
			// Basic structure validation
			if (!approval || !approval.data || !approval.signature || !approval.publicKey) {
				return { valid: false, reason: 'Invalid approval structure' };
			}

			// Check if approval has expired
			if (Date.now() > approval.data.expirationTimestamp) {
				return { valid: false, reason: 'Approval has expired' };
			}

			// Verify QA Engineer is registered
			const registeredKey = this.verifiedPublicKeys.get(approval.data.qaEngineerID);
			if (!registeredKey) {
				return { valid: false, reason: 'QA Engineer not registered' };
			}

			// Verify public key matches registered key (prevent key substitution)
			if (!timingSafeEqual(Buffer.from(registeredKey.publicKey, 'hex'), Buffer.from(approval.publicKey, 'hex'))) {
				return { valid: false, reason: 'Public key does not match registered key' };
			}

			// Verify quality requirements are met
			const qualityCheck = this.verifyQualityRequirements(approval.data.testResults);
			if (!qualityCheck.valid) {
				return { valid: false, reason: `Quality requirements not met: ${qualityCheck.reason}` };
			}

			// Verify cryptographic signature
			const dataToSign = this.serializeApprovalData(approval.data);
			const dataHash = createHash('sha256').update(dataToSign).digest();
			
			const signature = Buffer.from(approval.signature, 'hex');
			const publicKey = Buffer.from(approval.publicKey, 'hex');
			
			const signatureValid = await ed25519.verify(signature, dataHash, publicKey);
			
			if (!signatureValid) {
				return { valid: false, reason: 'Invalid cryptographic signature' };
			}

			// All checks passed
			return { valid: true };

		} catch (error) {
			return { valid: false, reason: `Verification error: ${error.message}` };
		}
	}

	/**
	 * Validate approval data structure and content
	 */
	private static validateApprovalData(data: QAApprovalData): void {
		if (!data.projectName || typeof data.projectName !== 'string') {
			throw new Error('Invalid project name');
		}
		if (!data.commitHash || !/^[a-fA-F0-9]{40}$/.test(data.commitHash)) {
			throw new Error('Invalid commit hash');
		}
		if (!data.commitMessage || typeof data.commitMessage !== 'string') {
			throw new Error('Invalid commit message');
		}
		if (!data.qaEngineerID || typeof data.qaEngineerID !== 'string') {
			throw new Error('Invalid QA Engineer ID');
		}
		if (!data.testResults || typeof data.testResults !== 'object') {
			throw new Error('Invalid test results');
		}

		// Validate test results
		const { testResults } = data;
		if (typeof testResults.unit !== 'boolean' ||
			typeof testResults.integration !== 'boolean' ||
			typeof testResults.security !== 'boolean' ||
			typeof testResults.performance !== 'boolean') {
			throw new Error('Invalid test result format');
		}

		if (!Number.isInteger(testResults.coverage) || testResults.coverage < 0 || testResults.coverage > 100) {
			throw new Error('Invalid coverage percentage');
		}

		if (!Number.isInteger(testResults.passedTests) || testResults.passedTests < 0) {
			throw new Error('Invalid passed tests count');
		}

		if (!Number.isInteger(testResults.totalTests) || testResults.totalTests < 0) {
			throw new Error('Invalid total tests count');
		}

		if (!Array.isArray(testResults.criticalIssues)) {
			throw new Error('Critical issues must be an array');
		}
	}

	/**
	 * Verify quality requirements are met
	 */
	private static verifyQualityRequirements(testResults: QATestResults): { valid: boolean; reason?: string } {
		// All core tests must pass
		if (!testResults.unit) {
			return { valid: false, reason: 'Unit tests failed' };
		}
		if (!testResults.integration) {
			return { valid: false, reason: 'Integration tests failed' };
		}
		if (!testResults.security) {
			return { valid: false, reason: 'Security tests failed' };
		}
		if (!testResults.performance) {
			return { valid: false, reason: 'Performance tests failed' };
		}

		// Coverage requirements
		if (testResults.coverage < this.MIN_COVERAGE_THRESHOLD) {
			return { valid: false, reason: `Code coverage ${testResults.coverage}% below minimum ${this.MIN_COVERAGE_THRESHOLD}%` };
		}

		// No critical issues allowed
		if (testResults.criticalIssues.length > this.MAX_CRITICAL_ISSUES) {
			return { valid: false, reason: `${testResults.criticalIssues.length} critical issues found (max ${this.MAX_CRITICAL_ISSUES} allowed)` };
		}

		// Test success rate
		const successRate = testResults.totalTests > 0 ? (testResults.passedTests / testResults.totalTests) * 100 : 0;
		if (successRate < 100) {
			return { valid: false, reason: `Test success rate ${successRate.toFixed(1)}% (100% required)` };
		}

		return { valid: true };
	}

	/**
	 * Create deterministic serialization for signing
	 */
	private static serializeApprovalData(data: QAApprovalData): string {
		// Create deterministic JSON serialization
		const serializable = {
			projectName: data.projectName,
			commitHash: data.commitHash,
			commitMessage: data.commitMessage,
			qaEngineerID: data.qaEngineerID,
			approvalTimestamp: data.approvalTimestamp,
			expirationTimestamp: data.expirationTimestamp,
			approvalNonce: data.approvalNonce,
			testResults: {
				unit: data.testResults.unit,
				integration: data.testResults.integration,
				security: data.testResults.security,
				performance: data.testResults.performance,
				coverage: data.testResults.coverage,
				passedTests: data.testResults.passedTests,
				totalTests: data.testResults.totalTests,
				criticalIssues: data.testResults.criticalIssues.slice().sort() // Sort for determinism
			}
		};

		return JSON.stringify(serializable, Object.keys(serializable).sort());
	}

	/**
	 * Create a QA block (rejection) with signature
	 */
	static async createQABlock(
		projectName: string,
		commitHash: string,
		commitMessage: string,
		qaEngineerID: string,
		blockReason: string,
		testResults: QATestResults,
		privateKeyHex: string
	): Promise<{ blockData: any; signature: string; publicKey: string }> {
		try {
			const blockData = {
				projectName,
				commitHash,
				commitMessage,
				qaEngineerID,
				blockReason,
				testResults,
				blockTimestamp: Date.now(),
				blockNonce: randomBytes(16).toString('hex')
			};

			// Sign the block
			const dataToSign = JSON.stringify(blockData, Object.keys(blockData).sort());
			const dataHash = createHash('sha256').update(dataToSign).digest();
			
			const privateKey = Buffer.from(privateKeyHex, 'hex');
			const signature = await ed25519.sign(dataHash, privateKey);
			const publicKey = await ed25519.getPublicKey(privateKey);

			return {
				blockData,
				signature: Buffer.from(signature).toString('hex'),
				publicKey: Buffer.from(publicKey).toString('hex')
			};
		} catch (error) {
			throw new Error(`Failed to create QA block: ${error.message}`);
		}
	}

	/**
	 * Generate audit trail hash for compliance
	 */
	static generateAuditHash(approval: CryptoQAApproval): string {
		const auditData = {
			projectName: approval.data.projectName,
			commitHash: approval.data.commitHash,
			qaEngineerID: approval.data.qaEngineerID,
			timestamp: approval.data.approvalTimestamp,
			signature: approval.signature
		};

		return createHash('sha256')
			.update(JSON.stringify(auditData, Object.keys(auditData).sort()))
			.digest('hex');
	}
}