import * as path from 'path';
import * as fs from 'fs';

export class PathResolver {
	private packageRoot: string;
	
	constructor() {
		// This will resolve to the dist directory where the compiled JS lives
		// Go up from dist/utils to the package root
		this.packageRoot = path.resolve(__dirname, '../..');
	}
	
	/**
	 * Get the path to a script file, checking multiple locations
	 * @param scriptName - Name of the script file
	 * @param externalDir - Optional external directory to check first
	 * @returns Full path to the script
	 */
	getScriptPath(scriptName: string, externalDir?: string): string {
		// First check if user provided an external directory
		if (externalDir) {
			const externalPath = path.join(externalDir, scriptName);
			if (fs.existsSync(externalPath)) {
				return externalPath;
			}
		}
		
		// Check bundled location in the package
		const bundledPath = path.join(this.packageRoot, 'scripts', scriptName);
		if (fs.existsSync(bundledPath)) {
			return bundledPath;
		}
		
		// Fallback to checking common locations
		const fallbacks = [
			process.env.TMUX_ORCHESTRATOR_PATH,
			path.join(process.env.HOME || '', 'n8n_claude_tmux', 'Tmux-Orchestrator'),
			path.join(process.env.HOME || '', 'n8n_claude_tmux'),
			'/usr/local/share/tmux-orchestrator'
		].filter(Boolean);
		
		for (const dir of fallbacks) {
			const fallbackPath = path.join(dir as string, scriptName);
			if (fs.existsSync(fallbackPath)) {
				return fallbackPath;
			}
		}
		
		// If not found, throw an error with helpful message
		throw new Error(`Script ${scriptName} not found. Checked locations:
			- External: ${externalDir || 'not specified'}
			- Bundled: ${bundledPath}
			- Environment: ${process.env.TMUX_ORCHESTRATOR_PATH || 'not set'}
			- Default: ${path.join(process.env.HOME || '', 'n8n_claude_tmux', 'Tmux-Orchestrator')}`);
	}
	
	/**
	 * Get the project base path from configuration or environment
	 * @param configuredPath - Path from user configuration
	 * @returns Resolved project base path
	 */
	getProjectBasePath(configuredPath?: string): string {
		if (configuredPath) {
			// Expand ~ to home directory if present
			if (configuredPath.startsWith('~')) {
				return path.join(process.env.HOME || '', configuredPath.slice(1));
			}
			return configuredPath;
		}
		
		// Check environment variable
		if (process.env.TMUX_PROJECTS_PATH) {
			return process.env.TMUX_PROJECTS_PATH;
		}
		
		// Default to ~/Coding
		return path.join(process.env.HOME || '', 'Coding');
	}
	
	/**
	 * Check if a script exists at the given path
	 * @param scriptPath - Path to check
	 * @returns true if the script exists and is executable
	 */
	isScriptAvailable(scriptPath: string): boolean {
		try {
			const stats = fs.statSync(scriptPath);
			// Check if file exists and has execute permissions for owner
			return stats.isFile() && (stats.mode & 0o100) !== 0;
		} catch {
			return false;
		}
	}
	
	/**
	 * Get all available script paths for diagnostics
	 * @returns Object with script names and their resolved paths
	 */
	getAllScriptPaths(externalDir?: string): Record<string, string | null> {
		const scripts = [
			'tmux_utils.py',
			'schedule_with_note.sh',
			'send-claude-message.sh',
			'suggest_subagent.sh'
		];
		
		const paths: Record<string, string | null> = {};
		
		for (const script of scripts) {
			try {
				paths[script] = this.getScriptPath(script, externalDir);
			} catch {
				paths[script] = null;
			}
		}
		
		return paths;
	}
}