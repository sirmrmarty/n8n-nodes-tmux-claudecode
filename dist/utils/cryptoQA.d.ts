declare class SecurePrivateKey {
    private keyData;
    private isDestroyed;
    private readonly createdAt;
    private readonly keyId;
    constructor(privateKey: Uint8Array);
    use<T>(callback: (key: Uint8Array) => T | Promise<T>): T | Promise<T>;
    useAsync<T>(callback: (key: Uint8Array) => Promise<T>): Promise<T>;
    getPublicKey(): Promise<Uint8Array>;
    getPublicKeyHex(): Promise<string>;
    sign(data: Uint8Array): Promise<Uint8Array>;
    isValid(): boolean;
    getMetadata(): {
        keyId: string;
        createdAt: number;
        isValid: boolean;
    };
    destroy(): void;
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
export interface LegacyQAKeyPair {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
    publicKeyHex: string;
    privateKeyHex: string;
}
export declare class CryptographicQASystem {
    private static readonly APPROVAL_VALIDITY_DURATION;
    private static readonly MIN_COVERAGE_THRESHOLD;
    private static readonly MAX_CRITICAL_ISSUES;
    private static readonly verifiedPublicKeys;
    static generateQAKeyPair(): Promise<QAKeyPair>;
    static generateLegacyQAKeyPair(): Promise<LegacyQAKeyPair>;
    static registerQAEngineer(qaEngineerID: string, publicKey: string, masterAuthSignature?: string): Promise<boolean>;
    static createQAApproval(approvalData: QAApprovalData, securePrivateKey: SecurePrivateKey): Promise<CryptoQAApproval>;
    static createQAApprovalLegacy(approvalData: QAApprovalData, privateKeyHex: string): Promise<CryptoQAApproval>;
    static verifyQAApproval(approval: CryptoQAApproval): Promise<{
        valid: boolean;
        reason?: string;
    }>;
    private static validateApprovalData;
    private static verifyQualityRequirements;
    private static serializeApprovalData;
    static createQABlock(projectName: string, commitHash: string, commitMessage: string, qaEngineerID: string, blockReason: string, testResults: QATestResults, securePrivateKey: SecurePrivateKey): Promise<{
        blockData: any;
        signature: string;
        publicKey: string;
    }>;
    static createQABlockLegacy(projectName: string, commitHash: string, commitMessage: string, qaEngineerID: string, blockReason: string, testResults: QATestResults, privateKeyHex: string): Promise<{
        blockData: any;
        signature: string;
        publicKey: string;
    }>;
    static generateAuditHash(approval: CryptoQAApproval): string;
    static shouldRotateKey(keyCreatedAt: number, signingOperations?: number): {
        should: boolean;
        reason: string;
        urgency: 'low' | 'medium' | 'high' | 'critical';
    };
    static performSecurityAudit(): {
        securityScore: number;
        findings: Array<{
            severity: string;
            issue: string;
            recommendation: string;
        }>;
        keyStats: {
            activeKeys: number;
            oldestKeyAge: number;
        };
    };
    static createSecureAuditLog(operation: string, qaEngineerID: string, details?: any): {
        timestamp: number;
        operation: string;
        qaEngineerID: string;
        details: any;
        auditHash: string;
    };
}
export {};
