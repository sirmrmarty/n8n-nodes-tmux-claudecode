export declare class PathResolver {
    private packageRoot;
    constructor();
    getScriptPath(scriptName: string, externalDir?: string): string;
    getProjectBasePath(configuredPath?: string): string;
    private findInNodeModules;
    isScriptAvailable(scriptPath: string): boolean;
    getAllScriptPaths(externalDir?: string): Record<string, string | null>;
    isPathSafe(targetPath: string, basePath: string): boolean;
    private validatePathSecurity;
    validateAndResolvePath(projectPath: string, relativePath: string): string;
    safeCreateDirectory(projectPath: string, relativePath: string): string;
}
