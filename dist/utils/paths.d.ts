export declare class PathResolver {
    private packageRoot;
    constructor();
    getScriptPath(scriptName: string, externalDir?: string): string;
    getProjectBasePath(configuredPath?: string): string;
    isScriptAvailable(scriptPath: string): boolean;
    getAllScriptPaths(externalDir?: string): Record<string, string | null>;
}
