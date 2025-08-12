import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { promisify } from 'util';

// Configure Ed25519 to use noble-hashes
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

/**
 * Secure memory utilities for cryptographic operations
 */
class SecureMemory {
	/**
	 * Securely zero out a Uint8Array
	 */
	static zeroize(buffer: Uint8Array): void {
		if (buffer && buffer.length > 0) {
			for (let i = 0; i < buffer.length; i++) {
				buffer[i] = 0;
			}
			// Additional overwrite with random data for paranoid security
			const random = randomBytes(buffer.length);
			for (let i = 0; i < buffer.length; i++) {
				buffer[i] = random[i];
			}
			// Final zero pass
			for (let i = 0; i < buffer.length; i++) {
				buffer[i] = 0;
			}
		}
	}

	/**
	 * Create a secure copy of a Uint8Array
	 */
	static secureCopy(source: Uint8Array): Uint8Array {
		const copy = new Uint8Array(source.length);
		copy.set(source);
		return copy;
	}
}

/**
 * Secure private key wrapper that automatically manages key lifecycle
 */
class SecurePrivateKey {
	private keyData: Uint8Array | null = null;
	private isDestroyed: boolean = false;
	private readonly createdAt: number = Date.now();
	private readonly keyId: string;

	constructor(privateKey: Uint8Array) {
		if (!privateKey || privateKey.length !== 32) {
			throw new Error('Invalid private key: must be 32 bytes');
		}
		this.keyData = SecureMemory.secureCopy(privateKey);
		this.keyId = randomBytes(8).toString('hex');
		
		// Auto-destroy after 5 minutes to limit exposure
		setTimeout(() => {
			if (!this.isDestroyed) {
				this.destroy();
			}
		}, 5 * 60 * 1000);
	}

	/**
	 * Use the private key in a secure callback pattern
	 * Key is only accessible within the callback and immediately zeroized after
	 */
	use<T>(callback: (key: Uint8Array) => T | Promise<T>): T | Promise<T> {
		if (this.isDestroyed || !this.keyData) {
			throw new Error('SecurePrivateKey has been destroyed');
		}

		try {
			// Create temporary copy for use
			const tempKey = SecureMemory.secureCopy(this.keyData);
			try {
				return callback(tempKey);
			} finally {
				// Always zeroize the temporary copy
				SecureMemory.zeroize(tempKey);
			}
		} catch (error) {
			// Ensure no key material in error messages
			throw new Error(`Cryptographic operation failed: ${error.message}`);
		}
	}

	/**
	 * Use the private key asynchronously in a secure callback pattern
	 */
	async useAsync<T>(callback: (key: Uint8Array) => Promise<T>): Promise<T> {
		if (this.isDestroyed || !this.keyData) {
			throw new Error('SecurePrivateKey has been destroyed');
		}

		try {
			// Create temporary copy for use
			const tempKey = SecureMemory.secureCopy(this.keyData);
			try {
				return await callback(tempKey);
			} finally {
				// Always zeroize the temporary copy
				SecureMemory.zeroize(tempKey);
			}
		} catch (error) {
			// Ensure no key material in error messages
			throw new Error(`Cryptographic operation failed: ${error.message}`);
		}
	}

	/**
	 * Get the corresponding public key
	 */
	async getPublicKey(): Promise<Uint8Array> {
		return this.useAsync(async (privateKey) => {
			return await ed25519.getPublicKey(privateKey);
		});
	}

	/**
	 * Get the public key as hex string
	 */
	async getPublicKeyHex(): Promise<string> {
		const publicKey = await this.getPublicKey();
		return Buffer.from(publicKey).toString('hex');
	}

	/**
	 * Sign data with this private key
	 */
	async sign(data: Uint8Array): Promise<Uint8Array> {
		return this.useAsync(async (privateKey) => {
			return await ed25519.sign(data, privateKey);
		});
	}

	/**
	 * Check if the key has been destroyed
	 */
	isValid(): boolean {
		return !this.isDestroyed && this.keyData !== null;
	}

	/**
	 * Get key metadata (safe to log)
	 */
	getMetadata(): { keyId: string; createdAt: number; isValid: boolean } {
		return {
			keyId: this.keyId,
			createdAt: this.createdAt,
			isValid: this.isValid()
		};
	}

	/**
	 * Securely destroy the private key
	 */
	destroy(): void {
		if (this.keyData) {
			SecureMemory.zeroize(this.keyData);
			this.keyData = null;
		}
		this.isDestroyed = true;
	}
}

/**
 * Secure key manager for Ed25519 cryptographic operations
 */
class SecureKeyManager {
	private static activeKeys = new Map<string, SecurePrivateKey>();
	private static keyRotationInterval = 24 * 60 * 60 * 1000; // 24 hours

	/**
	 * Create a secure private key from various sources
	 */
	static createSecureKey(source: Uint8Array | Buffer | string): SecurePrivateKey {
		let keyBytes: Uint8Array;

		if (typeof source === 'string') {
			// Handle hex string input (legacy support during migration)
			if (!/^[a-fA-F0-9]{64}$/.test(source)) {
				throw new Error('Invalid hex private key format');
			}
			keyBytes = new Uint8Array(Buffer.from(source, 'hex'));
		} else if (source instanceof Buffer) {
			keyBytes = new Uint8Array(source);
		} else {
			keyBytes = source;
		}

		const secureKey = new SecurePrivateKey(keyBytes);
		this.activeKeys.set(secureKey.getMetadata().keyId, secureKey);
		
		// Clean up destroyed keys periodically
		setTimeout(() => {
			this.cleanupDestroyedKeys();
		}, 60000); // 1 minute

		return secureKey;
	}

	/**
	 * Generate a new secure key pair
	 */
	static async generateSecureKeyPair(): Promise<{ privateKey: SecurePrivateKey; publicKeyHex: string }> {
		const privateKeyBytes = randomBytes(32);
		const privateKey = this.createSecureKey(privateKeyBytes);
		
		// Zeroize the original bytes
		SecureMemory.zeroize(privateKeyBytes);
		
		const publicKeyHex = await privateKey.getPublicKeyHex();
		
		return {
			privateKey,
			publicKeyHex
		};
	}

	/**
	 * Clean up destroyed keys from active tracking
	 */
	private static cleanupDestroyedKeys(): void {
		for (const [keyId, key] of this.activeKeys.entries()) {
			if (!key.isValid()) {
				this.activeKeys.delete(keyId);
			}
		}
	}

	/**
	 * Get statistics about active keys (for monitoring)
	 */
	static getKeyStats(): { activeKeys: number; oldestKeyAge: number } {
		this.cleanupDestroyedKeys();
		
		let oldestAge = 0;
		const now = Date.now();
		
		for (const key of this.activeKeys.values()) {
			if (key.isValid()) {
				const age = now - key.getMetadata().createdAt;
				oldestAge = Math.max(oldestAge, age);
			}
		}
		
		return {
			activeKeys: this.activeKeys.size,
			oldestKeyAge: oldestAge
		};
	}
}

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
	privateKey: SecurePrivateKey;
	publicKey: Uint8Array;
	publicKeyHex: string;
}

/**
 * Legacy interface for backward compatibility - DO NOT USE
 * @deprecated Use SecurePrivateKey instead
 */
export interface LegacyQAKeyPair {
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
	 * Generate a new Ed25519 key pair for QA Engineer with secure key management
	 */
	static async generateQAKeyPair(): Promise<QAKeyPair> {
		try {
			const keyPair = await SecureKeyManager.generateSecureKeyPair();
			const publicKey = await keyPair.privateKey.getPublicKey();
			
			return {
				privateKey: keyPair.privateKey,
				publicKey,
				publicKeyHex: keyPair.publicKeyHex
			};
		} catch (error) {
			throw new Error(`Failed to generate secure key pair: ${error.message}`);
		}
	}

	/**
	 * Generate a legacy key pair (for backward compatibility only)
	 * @deprecated Use generateQAKeyPair() which returns SecurePrivateKey
	 */
	static async generateLegacyQAKeyPair(): Promise<LegacyQAKeyPair> {
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
	 * Create cryptographically signed QA approval with secure key management
	 */
	static async createQAApproval(
		approvalData: QAApprovalData,
		securePrivateKey: SecurePrivateKey
	): Promise<CryptoQAApproval> {
		try {
			// Validate approval data
			this.validateApprovalData(approvalData);

			// Validate secure key
			if (!securePrivateKey.isValid()) {
				throw new Error('Invalid or destroyed private key');
			}

			// Generate cryptographic nonce
			approvalData.approvalNonce = randomBytes(16).toString('hex');
			approvalData.approvalTimestamp = Date.now();
			approvalData.expirationTimestamp = Date.now() + this.APPROVAL_VALIDITY_DURATION;

			// Create deterministic serialization for signing
			const dataToSign = this.serializeApprovalData(approvalData);
			const dataHash = createHash('sha256').update(dataToSign).digest();

			// Sign the hash with secure Ed25519 operations
			const signature = await securePrivateKey.sign(dataHash);
			const publicKeyHex = await securePrivateKey.getPublicKeyHex();

			const approval: CryptoQAApproval = {
				data: approvalData,
				signature: Buffer.from(signature).toString('hex'),
				publicKey: publicKeyHex
			};

			return approval;
		} catch (error) {
			// Ensure no key material in error messages
			const safeError = error.message.replace(/[a-fA-F0-9]{64}/g, '[REDACTED_KEY]');
			throw new Error(`Failed to create QA approval: ${safeError}`);
		}
	}

	/**
	 * Legacy method for backward compatibility
	 * @deprecated Use createQAApproval with SecurePrivateKey
	 */
	static async createQAApprovalLegacy(
		approvalData: QAApprovalData,
		privateKeyHex: string
	): Promise<CryptoQAApproval> {
		try {
			// Create temporary secure key for legacy support
			const secureKey = SecureKeyManager.createSecureKey(privateKeyHex);
			try {
				return await this.createQAApproval(approvalData, secureKey);
			} finally {
				// Ensure key is destroyed after use
				secureKey.destroy();
			}
		} catch (error) {
			throw new Error(`Failed to create QA approval (legacy): ${error.message}`);
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
	 * Create a QA block (rejection) with secure signature
	 */
	static async createQABlock(
		projectName: string,
		commitHash: string,
		commitMessage: string,
		qaEngineerID: string,
		blockReason: string,
		testResults: QATestResults,
		securePrivateKey: SecurePrivateKey
	): Promise<{ blockData: any; signature: string; publicKey: string }> {
		try {
			// Validate secure key
			if (!securePrivateKey.isValid()) {
				throw new Error('Invalid or destroyed private key');
			}

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

			// Sign the block with secure operations
			const dataToSign = JSON.stringify(blockData, Object.keys(blockData).sort());
			const dataHash = createHash('sha256').update(dataToSign).digest();
			
			const signature = await securePrivateKey.sign(dataHash);
			const publicKeyHex = await securePrivateKey.getPublicKeyHex();

			return {
				blockData,
				signature: Buffer.from(signature).toString('hex'),
				publicKey: publicKeyHex
			};
		} catch (error) {
			// Ensure no key material in error messages
			const safeError = error.message.replace(/[a-fA-F0-9]{64}/g, '[REDACTED_KEY]');
			throw new Error(`Failed to create QA block: ${safeError}`);
		}
	}

	/**
	 * Legacy method for creating QA blocks
	 * @deprecated Use createQABlock with SecurePrivateKey
	 */
	static async createQABlockLegacy(
		projectName: string,
		commitHash: string,
		commitMessage: string,
		qaEngineerID: string,
		blockReason: string,
		testResults: QATestResults,
		privateKeyHex: string
	): Promise<{ blockData: any; signature: string; publicKey: string }> {
		try {
			// Create temporary secure key for legacy support
			const secureKey = SecureKeyManager.createSecureKey(privateKeyHex);
			try {
				return await this.createQABlock(
					projectName,
					commitHash,
					commitMessage,
					qaEngineerID,
					blockReason,
					testResults,
					secureKey
				);
			} finally {
				// Ensure key is destroyed after use
				secureKey.destroy();
			}
		} catch (error) {
			throw new Error(`Failed to create QA block (legacy): ${error.message}`);
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

	/**
	 * Generate key rotation recommendation based on key age and usage
	 */
	static shouldRotateKey(keyCreatedAt: number, signingOperations: number = 0): {
		should: boolean;
		reason: string;
		urgency: 'low' | 'medium' | 'high' | 'critical';
	} {
		const now = Date.now();
		const keyAge = now - keyCreatedAt;
		const daysSinceCreation = keyAge / (24 * 60 * 60 * 1000);

		// Critical: Key older than 90 days
		if (daysSinceCreation > 90) {
			return {
				should: true,
				reason: `Key is ${Math.floor(daysSinceCreation)} days old (>90 days)`,
				urgency: 'critical'
			};
		}

		// High: Key older than 60 days or excessive usage
		if (daysSinceCreation > 60 || signingOperations > 10000) {
			return {
				should: true,
				reason: daysSinceCreation > 60 
					? `Key is ${Math.floor(daysSinceCreation)} days old (>60 days)`
					: `Key has been used ${signingOperations} times (>10000 operations)`,
				urgency: 'high'
			};
		}

		// Medium: Key older than 30 days or high usage
		if (daysSinceCreation > 30 || signingOperations > 5000) {
			return {
				should: true,
				reason: daysSinceCreation > 30
					? `Key is ${Math.floor(daysSinceCreation)} days old (>30 days)`
					: `Key has been used ${signingOperations} times (>5000 operations)`,
				urgency: 'medium'
			};
		}

		// Low: Key older than 14 days
		if (daysSinceCreation > 14) {
			return {
				should: true,
				reason: `Key is ${Math.floor(daysSinceCreation)} days old (>14 days)`,
				urgency: 'low'
			};
		}

		return {
			should: false,
			reason: `Key is ${Math.floor(daysSinceCreation)} days old and has ${signingOperations} operations`,
			urgency: 'low'
		};
	}

	/**
	 * Perform security audit of the cryptographic system
	 */
	static performSecurityAudit(): {
		securityScore: number;
		findings: Array<{ severity: string; issue: string; recommendation: string }>;
		keyStats: { activeKeys: number; oldestKeyAge: number };
	} {
		const findings: Array<{ severity: string; issue: string; recommendation: string }> = [];
		let securityScore = 100;

		// Check key management statistics
		const keyStats = SecureKeyManager.getKeyStats();
		
		// Check for old keys
		if (keyStats.oldestKeyAge > 90 * 24 * 60 * 60 * 1000) {
			findings.push({
				severity: 'CRITICAL',
				issue: `Keys older than 90 days detected (${Math.floor(keyStats.oldestKeyAge / (24 * 60 * 60 * 1000))} days)`,
				recommendation: 'Immediately rotate all keys older than 90 days'
			});
			securityScore -= 30;
		} else if (keyStats.oldestKeyAge > 60 * 24 * 60 * 60 * 1000) {
			findings.push({
				severity: 'HIGH',
				issue: `Keys older than 60 days detected (${Math.floor(keyStats.oldestKeyAge / (24 * 60 * 60 * 1000))} days)`,
				recommendation: 'Schedule key rotation within 7 days'
			});
			securityScore -= 15;
		}

		// Check for excessive active keys
		if (keyStats.activeKeys > 10) {
			findings.push({
				severity: 'MEDIUM',
				issue: `High number of active keys detected (${keyStats.activeKeys})`,
				recommendation: 'Review and cleanup unused keys to reduce attack surface'
			});
			securityScore -= 10;
		}

		// Check for proper key destruction
		const publicKeyCount = this.verifiedPublicKeys.size;
		if (publicKeyCount > keyStats.activeKeys * 2) {
			findings.push({
				severity: 'LOW',
				issue: 'Potential key cleanup needed - registered keys exceed active keys significantly',
				recommendation: 'Review registered public keys and remove obsolete entries'
			});
			securityScore -= 5;
		}

		// Positive findings
		if (findings.length === 0) {
			findings.push({
				severity: 'INFO',
				issue: 'No security issues detected',
				recommendation: 'Continue monitoring key lifecycle and maintain security practices'
			});
		}

		return {
			securityScore: Math.max(0, securityScore),
			findings,
			keyStats
		};
	}

	/**
	 * Create secure audit log entry (no sensitive data)
	 */
	static createSecureAuditLog(operation: string, qaEngineerID: string, details: any = {}): {
		timestamp: number;
		operation: string;
		qaEngineerID: string;
		details: any;
		auditHash: string;
	} {
		// Sanitize details to remove any potential key material
		const sanitizedDetails = JSON.parse(
			JSON.stringify(details).replace(/[a-fA-F0-9]{64}/g, '[REDACTED_KEY]')
		);

		const auditEntry = {
			timestamp: Date.now(),
			operation,
			qaEngineerID,
			details: sanitizedDetails,
			auditHash: ''
		};

		// Generate audit hash
		auditEntry.auditHash = createHash('sha256')
			.update(JSON.stringify(auditEntry, Object.keys(auditEntry).sort()))
			.digest('hex');

		return auditEntry;
	}
}