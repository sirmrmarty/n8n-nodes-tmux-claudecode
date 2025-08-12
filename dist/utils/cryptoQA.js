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
class CryptographicQASystem {
    static async generateQAKeyPair() {
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
    static async createQAApproval(approvalData, privateKeyHex) {
        try {
            this.validateApprovalData(approvalData);
            approvalData.approvalNonce = (0, crypto_1.randomBytes)(16).toString('hex');
            approvalData.approvalTimestamp = Date.now();
            approvalData.expirationTimestamp = Date.now() + this.APPROVAL_VALIDITY_DURATION;
            const dataToSign = this.serializeApprovalData(approvalData);
            const dataHash = (0, crypto_1.createHash)('sha256').update(dataToSign).digest();
            const privateKey = Buffer.from(privateKeyHex, 'hex');
            const signature = await ed25519.sign(dataHash, privateKey);
            const publicKey = await ed25519.getPublicKey(privateKey);
            const approval = {
                data: approvalData,
                signature: Buffer.from(signature).toString('hex'),
                publicKey: Buffer.from(publicKey).toString('hex')
            };
            return approval;
        }
        catch (error) {
            throw new Error(`Failed to create QA approval: ${error.message}`);
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
    static async createQABlock(projectName, commitHash, commitMessage, qaEngineerID, blockReason, testResults, privateKeyHex) {
        try {
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
            const privateKey = Buffer.from(privateKeyHex, 'hex');
            const signature = await ed25519.sign(dataHash, privateKey);
            const publicKey = await ed25519.getPublicKey(privateKey);
            return {
                blockData,
                signature: Buffer.from(signature).toString('hex'),
                publicKey: Buffer.from(publicKey).toString('hex')
            };
        }
        catch (error) {
            throw new Error(`Failed to create QA block: ${error.message}`);
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
}
exports.CryptographicQASystem = CryptographicQASystem;
CryptographicQASystem.APPROVAL_VALIDITY_DURATION = 30 * 60 * 1000;
CryptographicQASystem.MIN_COVERAGE_THRESHOLD = 80;
CryptographicQASystem.MAX_CRITICAL_ISSUES = 0;
CryptographicQASystem.verifiedPublicKeys = new Map();
//# sourceMappingURL=cryptoQA.js.map