export interface SecureExecutionResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
    command: string;
}
export interface SecureCommandConfig {
    command: string;
    args: string[];
    cwd?: string;
    timeout?: number;
    maxOutputSize?: number;
    allowedCommands?: string[];
    env?: Record<string, string>;
}
export declare class SecureCommandExecutor {
    private static readonly DEFAULT_TIMEOUT;
    private static readonly DEFAULT_MAX_OUTPUT;
    private static readonly ALLOWED_COMMANDS;
    private static readonly DANGEROUS_PATTERNS;
    private static validateCommand;
    private static sanitizeArgs;
    static executeSecure(config: SecureCommandConfig): Promise<SecureExecutionResult>;
    private static spawnCommand;
    static executeTmux(action: string, args?: string[], options?: Partial<SecureCommandConfig>): Promise<SecureExecutionResult>;
    static executeGit(action: string, args?: string[], options?: Partial<SecureCommandConfig>): Promise<SecureExecutionResult>;
    static generateAuditHash(command: string, args: string[], cwd?: string): string;
}
export declare const secureExec: typeof SecureCommandExecutor.executeSecure;
export declare const secureTmux: typeof SecureCommandExecutor.executeTmux;
export declare const secureGit: typeof SecureCommandExecutor.executeGit;
