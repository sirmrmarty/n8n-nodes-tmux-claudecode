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
exports.CryptographicQASystem = void 0;
const crypto_1 = require("crypto");
const ed25519 = __importStar(require("@noble/ed25519"));
const sha512_1 = require("@noble/hashes/sha512");
ed25519.etc.sha512Sync = (...m) => (0, sha512_1.sha512)(ed25519.etc.concatBytes(...m));
class SecureMemory {
    static zeroize(buffer) {
        if (buffer && buffer.length > 0) {
            for (let i = 0; i < buffer.length; i++) {
                buffer[i] = 0;
            }
            const random = (0, crypto_1.randomBytes)(buffer.length);
            for (let i = 0; i < buffer.length; i++) {
                buffer[i] = random[i];
            }
            for (let i = 0; i < buffer.length; i++) {
                buffer[i] = 0;
            }
        }
    }
    static secureCopy(source) {
        const copy = new Uint8Array(source.length);
        copy.set(source);
        return copy;
    }
}
class SecurePrivateKey {
    constructor(privateKey) {
        this.keyData = null;
        this.isDestroyed = false;
        this.createdAt = Date.now();
        if (!privateKey || privateKey.length !== 32) {
            throw new Error('Invalid private key: must be 32 bytes');
        }
        this.keyData = SecureMemory.secureCopy(privateKey);
        this.keyId = (0, crypto_1.randomBytes)(8).toString('hex');
        setTimeout(() => {
            if (!this.isDestroyed) {
                this.destroy();
            }
        }, 5 * 60 * 1000);
    }
    use(callback) {
        if (this.isDestroyed || !this.keyData) {
            throw new Error('SecurePrivateKey has been destroyed');
        }
        try {
            const tempKey = SecureMemory.secureCopy(this.keyData);
            try {
                return callback(tempKey);
            }
            finally {
                SecureMemory.zeroize(tempKey);
            }
        }
        catch (error) {
            throw new Error(`Cryptographic operation failed: ${error.message}`);
        }
    }
    async useAsync(callback) {
        if (this.isDestroyed || !this.keyData) {
            throw new Error('SecurePrivateKey has been destroyed');
        }
        try {
            const tempKey = SecureMemory.secureCopy(this.keyData);
            try {
                return await callback(tempKey);
            }
            finally {
                SecureMemory.zeroize(tempKey);
            }
        }
        catch (error) {
            throw new Error(`Cryptographic operation failed: ${error.message}`);
        }
    }
    async getPublicKey() {
        return this.useAsync(async (privateKey) => {
            return await ed25519.getPublicKey(privateKey);
        });
    }
    async getPublicKeyHex() {
        const publicKey = await this.getPublicKey();
        return Buffer.from(publicKey).toString('hex');
    }
    async sign(data) {
        return this.useAsync(async (privateKey) => {
            return await ed25519.sign(data, privateKey);
        });
    }
    isValid() {
        return !this.isDestroyed && this.keyData !== null;
    }
    getMetadata() {
        return {
            keyId: this.keyId,
            createdAt: this.createdAt,
            isValid: this.isValid()
        };
    }
    destroy() {
        if (this.keyData) {
            SecureMemory.zeroize(this.keyData);
            this.keyData = null;
        }
        this.isDestroyed = true;
    }
}
class SecureKeyManager {
    static createSecureKey(source) {
        let keyBytes;
        if (typeof source === 'string') {
            if (!/^[a-fA-F0-9]{64}$/.test(source)) {
                throw new Error('Invalid hex private key format');
            }
            keyBytes = new Uint8Array(Buffer.from(source, 'hex'));
        }
        else if (source instanceof Buffer) {
            keyBytes = new Uint8Array(source);
        }
        else {
            keyBytes = source;
        }
        const secureKey = new SecurePrivateKey(keyBytes);
        this.activeKeys.set(secureKey.getMetadata().keyId, secureKey);
        setTimeout(() => {
            this.cleanupDestroyedKeys();
        }, 60000);
        return secureKey;
    }
    static async generateSecureKeyPair() {
        const privateKeyBytes = (0, crypto_1.randomBytes)(32);
        const privateKey = this.createSecureKey(privateKeyBytes);
        SecureMemory.zeroize(privateKeyBytes);
        const publicKeyHex = await privateKey.getPublicKeyHex();
        return {
            privateKey,
            publicKeyHex
        };
    }
    static cleanupDestroyedKeys() {
        for (const [keyId, key] of this.activeKeys.entries()) {
            if (!key.isValid()) {
                this.activeKeys.delete(keyId);
            }
        }
    }
    static getKeyStats() {
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
SecureKeyManager.activeKeys = new Map();
SecureKeyManager.keyRotationInterval = 24 * 60 * 60 * 1000;
class CryptographicQASystem {
    static async generateQAKeyPair() {
        try {
            const keyPair = await SecureKeyManager.generateSecureKeyPair();
            const publicKey = await keyPair.privateKey.getPublicKey();
            return {
                privateKey: keyPair.privateKey,
                publicKey,
                publicKeyHex: keyPair.publicKeyHex
            };
        }
        catch (error) {
            throw new Error(`Failed to generate secure key pair: ${error.message}`);
        }
    }
    static async generateLegacyQAKeyPair() {
        try {
            const privateKey = (0, crypto_1.randomBytes)(32);
            const publicKey = await ed25519.getPublicKey(privateKey);
            return {
                privateKey,
                publicKey,
                publicKeyHex: Buffer.from(publicKey).toString('hex'),
                privateKeyHex: Buffer.from(privateKey).toString('hex')
            };
        }
        catch (error) {
            throw new Error(`Failed to generate key pair: ${error.message}`);
        }
    }
    static async registerQAEngineer(qaEngineerID, publicKey, masterAuthSignature) {
        try {
            if (!qaEngineerID || typeof qaEngineerID !== 'string') {
                throw new Error('Invalid QA Engineer ID');
            }
            if (!/^[a-fA-F0-9]{64}$/.test(publicKey)) {
                throw new Error('Invalid public key format (must be 64-char hex)');
            }
            const publicKeyBytes = Buffer.from(publicKey, 'hex');
            if (publicKeyBytes.length !== 32) {
                throw new Error('Invalid public key length');
            }
            this.verifiedPublicKeys.set(qaEngineerID, {
                publicKey,
                verifiedAt: Date.now(),
                qaEngineerID
            });
            return true;
        }
        catch (error) {
            throw new Error(`Failed to register QA Engineer: ${error.message}`);
        }
    }
    static async createQAApproval(approvalData, securePrivateKey) {
        try {
            this.validateApprovalData(approvalData);
            if (!securePrivateKey.isValid()) {
                throw new Error('Invalid or destroyed private key');
            }
            approvalData.approvalNonce = (0, crypto_1.randomBytes)(16).toString('hex');
            approvalData.approvalTimestamp = Date.now();
            approvalData.expirationTimestamp = Date.now() + this.APPROVAL_VALIDITY_DURATION;
            const dataToSign = this.serializeApprovalData(approvalData);
            const dataHash = (0, crypto_1.createHash)('sha256').update(dataToSign).digest();
            const signature = await securePrivateKey.sign(dataHash);
            const publicKeyHex = await securePrivateKey.getPublicKeyHex();
            const approval = {
                data: approvalData,
                signature: Buffer.from(signature).toString('hex'),
                publicKey: publicKeyHex
            };
            return approval;
        }
        catch (error) {
            const safeError = error.message.replace(/[a-fA-F0-9]{64}/g, '[REDACTED_KEY]');
            throw new Error(`Failed to create QA approval: ${safeError}`);
        }
    }
    static async createQAApprovalLegacy(approvalData, privateKeyHex) {
        try {
            const secureKey = SecureKeyManager.createSecureKey(privateKeyHex);
            try {
                return await this.createQAApproval(approvalData, secureKey);
            }
            finally {
                secureKey.destroy();
            }
        }
        catch (error) {
            throw new Error(`Failed to create QA approval (legacy): ${error.message}`);
        }
    }
    static async verifyQAApproval(approval) {
        try {
            if (!approval || !approval.data || !approval.signature || !approval.publicKey) {
                return { valid: false, reason: 'Invalid approval structure' };
            }
            if (Date.now() > approval.data.expirationTimestamp) {
                return { valid: false, reason: 'Approval has expired' };
            }
            const registeredKey = this.verifiedPublicKeys.get(approval.data.qaEngineerID);
            if (!registeredKey) {
                return { valid: false, reason: 'QA Engineer not registered' };
            }
            if (!(0, crypto_1.timingSafeEqual)(Buffer.from(registeredKey.publicKey, 'hex'), Buffer.from(approval.publicKey, 'hex'))) {
                return { valid: false, reason: 'Public key does not match registered key' };
            }
            const qualityCheck = this.verifyQualityRequirements(approval.data.testResults);
            if (!qualityCheck.valid) {
                return { valid: false, reason: `Quality requirements not met: ${qualityCheck.reason}` };
            }
            const dataToSign = this.serializeApprovalData(approval.data);
            const dataHash = (0, crypto_1.createHash)('sha256').update(dataToSign).digest();
            const signature = Buffer.from(approval.signature, 'hex');
            const publicKey = Buffer.from(approval.publicKey, 'hex');
            const signatureValid = await ed25519.verify(signature, dataHash, publicKey);
            if (!signatureValid) {
                return { valid: false, reason: 'Invalid cryptographic signature' };
            }
            return { valid: true };
        }
        catch (error) {
            return { valid: false, reason: `Verification error: ${error.message}` };
        }
    }
    static validateApprovalData(data) {
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
    static verifyQualityRequirements(testResults) {
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
        if (testResults.coverage < this.MIN_COVERAGE_THRESHOLD) {
            return { valid: false, reason: `Code coverage ${testResults.coverage}% below minimum ${this.MIN_COVERAGE_THRESHOLD}%` };
        }
        if (testResults.criticalIssues.length > this.MAX_CRITICAL_ISSUES) {
            return { valid: false, reason: `${testResults.criticalIssues.length} critical issues found (max ${this.MAX_CRITICAL_ISSUES} allowed)` };
        }
        const successRate = testResults.totalTests > 0 ? (testResults.passedTests / testResults.totalTests) * 100 : 0;
        if (successRate < 100) {
            return { valid: false, reason: `Test success rate ${successRate.toFixed(1)}% (100% required)` };
        }
        return { valid: true };
    }
    static serializeApprovalData(data) {
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
                criticalIssues: data.testResults.criticalIssues.slice().sort()
            }
        };
        return JSON.stringify(serializable, Object.keys(serializable).sort());
    }
    static async createQABlock(projectName, commitHash, commitMessage, qaEngineerID, blockReason, testResults, securePrivateKey) {
        try {
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
                blockNonce: (0, crypto_1.randomBytes)(16).toString('hex')
            };
            const dataToSign = JSON.stringify(blockData, Object.keys(blockData).sort());
            const dataHash = (0, crypto_1.createHash)('sha256').update(dataToSign).digest();
            const signature = await securePrivateKey.sign(dataHash);
            const publicKeyHex = await securePrivateKey.getPublicKeyHex();
            return {
                blockData,
                signature: Buffer.from(signature).toString('hex'),
                publicKey: publicKeyHex
            };
        }
        catch (error) {
            const safeError = error.message.replace(/[a-fA-F0-9]{64}/g, '[REDACTED_KEY]');
            throw new Error(`Failed to create QA block: ${safeError}`);
        }
    }
    static async createQABlockLegacy(projectName, commitHash, commitMessage, qaEngineerID, blockReason, testResults, privateKeyHex) {
        try {
            const secureKey = SecureKeyManager.createSecureKey(privateKeyHex);
            try {
                return await this.createQABlock(projectName, commitHash, commitMessage, qaEngineerID, blockReason, testResults, secureKey);
            }
            finally {
                secureKey.destroy();
            }
        }
        catch (error) {
            throw new Error(`Failed to create QA block (legacy): ${error.message}`);
        }
    }
    static generateAuditHash(approval) {
        const auditData = {
            projectName: approval.data.projectName,
            commitHash: approval.data.commitHash,
            qaEngineerID: approval.data.qaEngineerID,
            timestamp: approval.data.approvalTimestamp,
            signature: approval.signature
        };
        return (0, crypto_1.createHash)('sha256')
            .update(JSON.stringify(auditData, Object.keys(auditData).sort()))
            .digest('hex');
    }
    static shouldRotateKey(keyCreatedAt, signingOperations = 0) {
        const now = Date.now();
        const keyAge = now - keyCreatedAt;
        const daysSinceCreation = keyAge / (24 * 60 * 60 * 1000);
        if (daysSinceCreation > 90) {
            return {
                should: true,
                reason: `Key is ${Math.floor(daysSinceCreation)} days old (>90 days)`,
                urgency: 'critical'
            };
        }
        if (daysSinceCreation > 60 || signingOperations > 10000) {
            return {
                should: true,
                reason: daysSinceCreation > 60
                    ? `Key is ${Math.floor(daysSinceCreation)} days old (>60 days)`
                    : `Key has been used ${signingOperations} times (>10000 operations)`,
                urgency: 'high'
            };
        }
        if (daysSinceCreation > 30 || signingOperations > 5000) {
            return {
                should: true,
                reason: daysSinceCreation > 30
                    ? `Key is ${Math.floor(daysSinceCreation)} days old (>30 days)`
                    : `Key has been used ${signingOperations} times (>5000 operations)`,
                urgency: 'medium'
            };
        }
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
    static performSecurityAudit() {
        const findings = [];
        let securityScore = 100;
        const keyStats = SecureKeyManager.getKeyStats();
        if (keyStats.oldestKeyAge > 90 * 24 * 60 * 60 * 1000) {
            findings.push({
                severity: 'CRITICAL',
                issue: `Keys older than 90 days detected (${Math.floor(keyStats.oldestKeyAge / (24 * 60 * 60 * 1000))} days)`,
                recommendation: 'Immediately rotate all keys older than 90 days'
            });
            securityScore -= 30;
        }
        else if (keyStats.oldestKeyAge > 60 * 24 * 60 * 60 * 1000) {
            findings.push({
                severity: 'HIGH',
                issue: `Keys older than 60 days detected (${Math.floor(keyStats.oldestKeyAge / (24 * 60 * 60 * 1000))} days)`,
                recommendation: 'Schedule key rotation within 7 days'
            });
            securityScore -= 15;
        }
        if (keyStats.activeKeys > 10) {
            findings.push({
                severity: 'MEDIUM',
                issue: `High number of active keys detected (${keyStats.activeKeys})`,
                recommendation: 'Review and cleanup unused keys to reduce attack surface'
            });
            securityScore -= 10;
        }
        const publicKeyCount = this.verifiedPublicKeys.size;
        if (publicKeyCount > keyStats.activeKeys * 2) {
            findings.push({
                severity: 'LOW',
                issue: 'Potential key cleanup needed - registered keys exceed active keys significantly',
                recommendation: 'Review registered public keys and remove obsolete entries'
            });
            securityScore -= 5;
        }
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
    static createSecureAuditLog(operation, qaEngineerID, details = {}) {
        const sanitizedDetails = JSON.parse(JSON.stringify(details).replace(/[a-fA-F0-9]{64}/g, '[REDACTED_KEY]'));
        const auditEntry = {
            timestamp: Date.now(),
            operation,
            qaEngineerID,
            details: sanitizedDetails,
            auditHash: ''
        };
        auditEntry.auditHash = (0, crypto_1.createHash)('sha256')
            .update(JSON.stringify(auditEntry, Object.keys(auditEntry).sort()))
            .digest('hex');
        return auditEntry;
    }
}
exports.CryptographicQASystem = CryptographicQASystem;
CryptographicQASystem.APPROVAL_VALIDITY_DURATION = 30 * 60 * 1000;
CryptographicQASystem.MIN_COVERAGE_THRESHOLD = 80;
CryptographicQASystem.MAX_CRITICAL_ISSUES = 0;
CryptographicQASystem.verifiedPublicKeys = new Map();
//# sourceMappingURL=cryptoQA.js.map