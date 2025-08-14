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
exports.secureGit = exports.secureTmux = exports.secureExec = exports.SecureCommandExecutor = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
class SecureCommandExecutor {
    static validateCommand(command, args) {
        const baseCommand = path.basename(command);
        if (!this.ALLOWED_COMMANDS.has(baseCommand)) {
            throw new Error(`Command '${baseCommand}' not in allowed command list`);
        }
        const fullCommand = [command, ...args].join(' ');
        for (const pattern of this.DANGEROUS_PATTERNS) {
            if (pattern.test(fullCommand)) {
                throw new Error(`Command contains dangerous pattern: ${pattern.source}`);
            }
        }
        if (baseCommand === 'bash' || baseCommand === 'sh') {
            if (!args.includes('-c') || args.length < 2) {
                throw new Error('Shell commands must use -c flag with explicit command');
            }
        }
        if (baseCommand === 'rm') {
            const dangerousPaths = ['/', '/usr', '/etc', '/var', '/home', '~'];
            const rmArgs = args.join(' ');
            if (args.includes('-r') || args.includes('-rf')) {
                for (const dangerousPath of dangerousPaths) {
                    if (rmArgs.includes(dangerousPath)) {
                        throw new Error(`Recursive deletion of ${dangerousPath} is prohibited`);
                    }
                }
            }
        }
    }
    static sanitizeArgs(args) {
        return args.map(arg => {
            arg = arg.replace(/\0/g, '');
            if (arg.length > 1000) {
                throw new Error('Argument too long (max 1000 characters)');
            }
            return arg;
        });
    }
    static async executeSecure(config) {
        const startTime = Date.now();
        try {
            SecureCommandExecutor.validateCommand(config.command, config.args);
            const sanitizedArgs = SecureCommandExecutor.sanitizeArgs(config.args);
            const options = {
                cwd: config.cwd || process.cwd(),
                env: {
                    ...process.env,
                    ...(config.env || {}),
                    LD_PRELOAD: undefined,
                    PATH: process.env.PATH
                },
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: config.timeout || SecureCommandExecutor.DEFAULT_TIMEOUT,
                killSignal: 'SIGTERM'
            };
            const result = await SecureCommandExecutor.spawnCommand(config.command, sanitizedArgs, options, config.maxOutputSize);
            return {
                success: result.exitCode === 0,
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
                duration: Date.now() - startTime,
                command: `${config.command} ${sanitizedArgs.join(' ')}`
            };
        }
        catch (error) {
            return {
                success: false,
                stdout: '',
                stderr: error.message,
                exitCode: -1,
                duration: Date.now() - startTime,
                command: `${config.command} ${config.args.join(' ')}`
            };
        }
    }
    static async spawnCommand(command, args, options, maxOutputSize) {
        return new Promise((resolve, reject) => {
            const maxSize = maxOutputSize || SecureCommandExecutor.DEFAULT_MAX_OUTPUT;
            let stdout = '';
            let stderr = '';
            let stdoutSize = 0;
            let stderrSize = 0;
            const child = (0, child_process_1.spawn)(command, args, options);
            const timeout = setTimeout(() => {
                child.kill('SIGTERM');
                setTimeout(() => child.kill('SIGKILL'), 5000);
                reject(new Error(`Command timeout after ${options.timeout}ms`));
            }, options.timeout);
            child.stdout?.on('data', (data) => {
                const chunk = data.toString();
                stdoutSize += chunk.length;
                if (stdoutSize > maxSize) {
                    child.kill('SIGTERM');
                    reject(new Error(`Command output exceeded ${maxSize} bytes`));
                    return;
                }
                stdout += chunk;
            });
            child.stderr?.on('data', (data) => {
                const chunk = data.toString();
                stderrSize += chunk.length;
                if (stderrSize > maxSize) {
                    child.kill('SIGTERM');
                    reject(new Error(`Command error output exceeded ${maxSize} bytes`));
                    return;
                }
                stderr += chunk;
            });
            child.on('close', (code) => {
                clearTimeout(timeout);
                resolve({
                    exitCode: code || 0,
                    stdout: stdout.trim(),
                    stderr: stderr.trim()
                });
            });
            child.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
    static async executeTmux(action, args = [], options) {
        const tmuxArgs = [action, ...args];
        const allowedTmuxActions = [
            'list-sessions', 'list-windows', 'list-panes',
            'capture-pane', 'send-keys', 'display-message',
            'new-session', 'new-window', 'rename-window',
            'kill-session', 'kill-window'
        ];
        if (!allowedTmuxActions.includes(action)) {
            throw new Error(`Tmux action '${action}' not allowed`);
        }
        return SecureCommandExecutor.executeSecure({
            command: 'tmux',
            args: tmuxArgs,
            timeout: 10000,
            maxOutputSize: 512 * 1024,
            ...options
        });
    }
    static async executeGit(action, args = [], options) {
        const gitArgs = [action, ...args];
        const allowedGitActions = [
            'status', 'diff', 'log', 'add', 'commit', 'push', 'pull',
            'checkout', 'branch', 'remote', 'config', 'clean'
        ];
        if (!allowedGitActions.includes(action)) {
            throw new Error(`Git action '${action}' not allowed`);
        }
        if (action === 'clean' && args.includes('-fd')) {
            throw new Error('Forced directory cleanup not allowed');
        }
        return SecureCommandExecutor.executeSecure({
            command: 'git',
            args: gitArgs,
            timeout: 30000,
            ...options
        });
    }
    static generateAuditHash(command, args, cwd) {
        const data = `${command}:${args.join(':')}:${cwd || process.cwd()}:${Date.now()}`;
        return (0, crypto_1.createHash)('sha256').update(data).digest('hex').substring(0, 16);
    }
}
exports.SecureCommandExecutor = SecureCommandExecutor;
SecureCommandExecutor.DEFAULT_TIMEOUT = 30000;
SecureCommandExecutor.DEFAULT_MAX_OUTPUT = 1024 * 1024;
SecureCommandExecutor.ALLOWED_COMMANDS = new Set([
    'tmux',
    'python3',
    'python',
    'node',
    'npm',
    'yarn',
    'git',
    'gh',
    'bash',
    'sh',
    'sleep',
    'echo',
    'cat',
    'grep',
    'find',
    'ls',
    'pwd',
    'whoami',
    'chmod',
    'mkdir',
    'touch',
    'rm'
]);
SecureCommandExecutor.DANGEROUS_PATTERNS = [
    /;\s*[|&]/,
    /\$\([^)]*\)/,
    /`[^`]*`/,
    /\${[^}]*}/,
    />[>]?\s*\/dev/,
    /\|\s*\w/,
    /&&|\|\|/,
    /;\s*\w/,
    /\\[`$()]/
];
exports.secureExec = SecureCommandExecutor.executeSecure;
exports.secureTmux = SecureCommandExecutor.executeTmux;
exports.secureGit = SecureCommandExecutor.executeGit;
//# sourceMappingURL=secureExecution.js.map