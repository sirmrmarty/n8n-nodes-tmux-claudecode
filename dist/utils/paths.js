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
        if (externalDir) {
            const externalPath = path.join(externalDir, scriptName);
            if (fs.existsSync(externalPath)) {
                return externalPath;
            }
        }
        const bundledPath = path.join(this.packageRoot, 'scripts', scriptName);
        if (fs.existsSync(bundledPath)) {
            return bundledPath;
        }
        const fallbacks = [
            process.env.TMUX_ORCHESTRATOR_PATH,
            path.join(process.env.HOME || '', 'n8n_claude_tmux', 'Tmux-Orchestrator'),
            path.join(process.env.HOME || '', 'n8n_claude_tmux'),
            '/usr/local/share/tmux-orchestrator'
        ].filter(Boolean);
        for (const dir of fallbacks) {
            const fallbackPath = path.join(dir, scriptName);
            if (fs.existsSync(fallbackPath)) {
                return fallbackPath;
            }
        }
        throw new Error(`Script ${scriptName} not found. Checked locations:
			- External: ${externalDir || 'not specified'}
			- Bundled: ${bundledPath}
			- Environment: ${process.env.TMUX_ORCHESTRATOR_PATH || 'not set'}
			- Default: ${path.join(process.env.HOME || '', 'n8n_claude_tmux', 'Tmux-Orchestrator')}`);
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
    isScriptAvailable(scriptPath) {
        try {
            const stats = fs.statSync(scriptPath);
            return stats.isFile() && (stats.mode & 0o100) !== 0;
        }
        catch {
            return false;
        }
    }
    getAllScriptPaths(externalDir) {
        const scripts = [
            'tmux_utils.py',
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
}
exports.PathResolver = PathResolver;
//# sourceMappingURL=paths.js.map