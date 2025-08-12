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
exports.PathResolver = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class PathResolver {
    constructor() {
        this.packageRoot = path.resolve(__dirname, '../..');
    }
    getScriptPath(scriptName, externalDir) {
        if (!scriptName || typeof scriptName !== 'string') {
            throw new Error('Invalid script name provided');
        }
        if (externalDir && typeof externalDir !== 'string') {
            throw new Error('Invalid external directory provided');
        }
        const checkedLocations = [];
        if (externalDir) {
            const externalPath = path.join(externalDir, scriptName);
            checkedLocations.push(`External: ${externalPath}`);
            if (fs.existsSync(externalPath) && this.isScriptAvailable(externalPath)) {
                return externalPath;
            }
        }
        const bundledPath = path.join(this.packageRoot, 'scripts', scriptName);
        checkedLocations.push(`Bundled: ${bundledPath}`);
        if (fs.existsSync(bundledPath) && this.isScriptAvailable(bundledPath)) {
            return bundledPath;
        }
        const utilsPath = path.join(this.packageRoot, 'utils', scriptName);
        checkedLocations.push(`Utils: ${utilsPath}`);
        if (fs.existsSync(utilsPath) && this.isScriptAvailable(utilsPath)) {
            return utilsPath;
        }
        const npmPackagePath = this.findInNodeModules(scriptName);
        if (npmPackagePath) {
            checkedLocations.push(`NPM Package: ${npmPackagePath}`);
            if (fs.existsSync(npmPackagePath) && this.isScriptAvailable(npmPackagePath)) {
                return npmPackagePath;
            }
        }
        const fallbacks = [
            process.env.TMUX_ORCHESTRATOR_PATH,
            process.env.TMUX_SCRIPTS_PATH,
            path.join(process.env.HOME || '', 'n8n_claude_tmux', 'scripts'),
            path.join(process.env.HOME || '', 'n8n_claude_tmux', 'Tmux-Orchestrator'),
            path.join(process.env.HOME || '', 'n8n_claude_tmux'),
            '/usr/local/share/tmux-orchestrator/scripts',
            '/usr/local/share/tmux-orchestrator',
            '/opt/tmux-orchestrator/scripts'
        ].filter(Boolean);
        for (const dir of fallbacks) {
            const fallbackPath = path.join(dir, scriptName);
            checkedLocations.push(`Fallback: ${fallbackPath}`);
            if (fs.existsSync(fallbackPath) && this.isScriptAvailable(fallbackPath)) {
                return fallbackPath;
            }
        }
        throw new Error(`Script ${scriptName} not found. Checked locations:\n${checkedLocations.map(loc => `  - ${loc}`).join('\n')}\n\nTroubleshooting:\n  - Ensure tmux and python3 are installed\n  - Set TMUX_ORCHESTRATOR_PATH environment variable to script directory\n  - Check that scripts have execute permissions\n  - Verify n8n node installation is complete`);
    }
    getProjectBasePath(configuredPath) {
        if (configuredPath) {
            if (configuredPath.startsWith('~')) {
                return path.join(process.env.HOME || '', configuredPath.slice(1));
            }
            return configuredPath;
        }
        if (process.env.TMUX_PROJECTS_PATH) {
            return process.env.TMUX_PROJECTS_PATH;
        }
        return path.join(process.env.HOME || '', 'Coding');
    }
    findInNodeModules(scriptName) {
        let currentDir = __dirname;
        for (let i = 0; i < 10; i++) {
            const nodeModulesPath = path.join(currentDir, 'node_modules', '@sirmrmarty', 'n8n-nodes-tmux-orchestrator', 'scripts', scriptName);
            if (fs.existsSync(nodeModulesPath)) {
                return nodeModulesPath;
            }
            const nodeModulesUtilsPath = path.join(currentDir, 'node_modules', '@sirmrmarty', 'n8n-nodes-tmux-orchestrator', 'utils', scriptName);
            if (fs.existsSync(nodeModulesUtilsPath)) {
                return nodeModulesUtilsPath;
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir)
                break;
            currentDir = parentDir;
        }
        return null;
    }
    isScriptAvailable(scriptPath) {
        try {
            const stats = fs.statSync(scriptPath);
            return stats.isFile() && ((stats.mode & 0o100) !== 0 || (stats.mode & 0o400) !== 0);
        }
        catch {
            return false;
        }
    }
    getAllScriptPaths(externalDir) {
        const scripts = [
            'tmux_wrapper.py',
            'schedule_with_note.sh',
            'send-claude-message.sh',
            'suggest_subagent.sh'
        ];
        const paths = {};
        for (const script of scripts) {
            try {
                paths[script] = this.getScriptPath(script, externalDir);
            }
            catch {
                paths[script] = null;
            }
        }
        return paths;
    }
    isPathSafe(targetPath, basePath) {
        try {
            const normalizedTarget = path.resolve(path.normalize(targetPath));
            const normalizedBase = path.resolve(path.normalize(basePath));
            if (!normalizedTarget.startsWith(normalizedBase + path.sep) && normalizedTarget !== normalizedBase) {
                return false;
            }
            return this.validatePathSecurity(targetPath, normalizedTarget);
        }
        catch {
            return false;
        }
    }
    validatePathSecurity(originalPath, resolvedPath) {
        const dangerousPatterns = [
            /\.\.[\/\\]/,
            /[\/\\]\.\./,
            /\.\.$/,
            /^\.\.[\/\\]/,
            /\0/,
            /[\r\n]/,
            /[<>:"|?*]/
        ];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(originalPath)) {
                return false;
            }
        }
        const suspiciousPaths = [
            '/etc/',
            '/usr/bin/',
            '/bin/',
            '/sbin/',
            '/var/log/',
            '/proc/',
            '/sys/'
        ];
        for (const suspiciousPath of suspiciousPaths) {
            if (resolvedPath.startsWith(suspiciousPath)) {
                return false;
            }
        }
        if (resolvedPath.length > 4096) {
            return false;
        }
        return true;
    }
    validateAndResolvePath(projectPath, relativePath) {
        if (!projectPath || !relativePath) {
            throw new Error('Path validation requires both project path and relative path');
        }
        const absoluteProjectPath = path.resolve(projectPath);
        const targetPath = path.resolve(absoluteProjectPath, relativePath);
        if (!this.isPathSafe(targetPath, absoluteProjectPath)) {
            throw new Error(`Path traversal detected: ${relativePath} resolves outside project boundary`);
        }
        return targetPath;
    }
    safeCreateDirectory(projectPath, relativePath) {
        const safePath = this.validateAndResolvePath(projectPath, relativePath);
        const parentDir = path.dirname(safePath);
        if (!fs.existsSync(parentDir)) {
            if (!this.isPathSafe(parentDir, path.resolve(projectPath))) {
                throw new Error('Cannot create directory: parent directory outside project bounds');
            }
            fs.mkdirSync(parentDir, { recursive: true, mode: 0o755 });
        }
        return safePath;
    }
}
exports.PathResolver = PathResolver;
//# sourceMappingURL=paths.js.map