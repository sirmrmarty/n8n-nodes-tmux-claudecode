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
export declare class CryptographicQASystem {
    private static readonly APPROVAL_VALIDITY_DURATION;
    private static readonly MIN_COVERAGE_THRESHOLD;
    private static readonly MAX_CRITICAL_ISSUES;
    private static readonly verifiedPublicKeys;
    static generateQAKeyPair(): Promise<QAKeyPair>;
    static registerQAEngineer(qaEngineerID: string, publicKey: string, masterAuthSignature?: string): Promise<boolean>;
    static createQAApproval(approvalData: QAApprovalData, privateKeyHex: string): Promise<CryptoQAApproval>;
    static verifyQAApproval(approval: CryptoQAApproval): Promise<{
        valid: boolean;
        reason?: string;
    }>;
    private static validateApprovalData;
    private static verifyQualityRequirements;
    private static serializeApprovalData;
    static createQABlock(projectName: string, commitHash: string, commitMessage: string, qaEngineerID: string, blockReason: string, testResults: QATestResults, privateKeyHex: string): Promise<{
        blockData: any;
        signature: string;
        publicKey: string;
    }>;
    static generateAuditHash(approval: CryptoQAApproval): string;
}
