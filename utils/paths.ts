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
		// Validate inputs
		if (!scriptName || typeof scriptName !== 'string') {
			throw new Error('Invalid script name provided');
		}
		if (externalDir && typeof externalDir !== 'string') {
			throw new Error('Invalid external directory provided');
		}

		const checkedLocations: string[] = [];

		// First check if user provided an external directory
		if (externalDir) {
			const externalPath = path.join(externalDir, scriptName);
			checkedLocations.push(`External: ${externalPath}`);
			if (fs.existsSync(externalPath) && this.isScriptAvailable(externalPath)) {
				return externalPath;
			}
		}
		
		// Check bundled location in the package (scripts directory)
		const bundledPath = path.join(this.packageRoot, 'scripts', scriptName);
		checkedLocations.push(`Bundled: ${bundledPath}`);
		if (fs.existsSync(bundledPath) && this.isScriptAvailable(bundledPath)) {
			return bundledPath;
		}
		
		// Check utils directory (for backward compatibility)
		const utilsPath = path.join(this.packageRoot, 'utils', scriptName);
		checkedLocations.push(`Utils: ${utilsPath}`);
		if (fs.existsSync(utilsPath) && this.isScriptAvailable(utilsPath)) {
			return utilsPath;
		}

		// Check if installed as npm package in node_modules
		const npmPackagePath = this.findInNodeModules(scriptName);
		if (npmPackagePath) {
			checkedLocations.push(`NPM Package: ${npmPackagePath}`);
			if (fs.existsSync(npmPackagePath) && this.isScriptAvailable(npmPackagePath)) {
				return npmPackagePath;
			}
		}
		
		// Fallback to checking common locations
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
			const fallbackPath = path.join(dir as string, scriptName);
			checkedLocations.push(`Fallback: ${fallbackPath}`);
			if (fs.existsSync(fallbackPath) && this.isScriptAvailable(fallbackPath)) {
				return fallbackPath;
			}
		}
		
		// If not found, throw an error with helpful message
		throw new Error(`Script ${scriptName} not found. Checked locations:\n${checkedLocations.map(loc => `  - ${loc}`).join('\n')}\n\nTroubleshooting:\n  - Ensure tmux and python3 are installed\n  - Set TMUX_ORCHESTRATOR_PATH environment variable to script directory\n  - Check that scripts have execute permissions\n  - Verify n8n node installation is complete`);
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
	 * Find script in node_modules package structure
	 * @param scriptName - Name of the script file
	 * @returns Path to script in node_modules or null if not found
	 */
	private findInNodeModules(scriptName: string): string | null {
		// Start from current directory and walk up to find node_modules
		let currentDir = __dirname;
		for (let i = 0; i < 10; i++) { // Limit search depth
			const nodeModulesPath = path.join(currentDir, 'node_modules', '@sirmrmarty', 'n8n-nodes-tmux-orchestrator', 'scripts', scriptName);
			if (fs.existsSync(nodeModulesPath)) {
				return nodeModulesPath;
			}
			
			// Also check utils directory for backward compatibility
			const nodeModulesUtilsPath = path.join(currentDir, 'node_modules', '@sirmrmarty', 'n8n-nodes-tmux-orchestrator', 'utils', scriptName);
			if (fs.existsSync(nodeModulesUtilsPath)) {
				return nodeModulesUtilsPath;
			}
			
			const parentDir = path.dirname(currentDir);
			if (parentDir === currentDir) break; // Reached root
			currentDir = parentDir;
		}
		return null;
	}

	/**
	 * Check if a script exists at the given path
	 * @param scriptPath - Path to check
	 * @returns true if the script exists and is executable
	 */
	isScriptAvailable(scriptPath: string): boolean {
		try {
			const stats = fs.statSync(scriptPath);
			// Check if file exists and has execute permissions for owner, or is readable (for Python scripts)
			return stats.isFile() && ((stats.mode & 0o100) !== 0 || (stats.mode & 0o400) !== 0);
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
			'tmux_wrapper.py',
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

	/**
	 * Validate path safety to prevent directory traversal attacks
	 * @param targetPath - Path to validate
	 * @param basePath - Base path that the target must be within
	 * @returns true if path is safe, false otherwise
	 */
	isPathSafe(targetPath: string, basePath: string): boolean {
		try {
			// Normalize and resolve paths to handle relative components
			const normalizedTarget = path.resolve(path.normalize(targetPath));
			const normalizedBase = path.resolve(path.normalize(basePath));
			
			// Check if the resolved target path starts with the base path
			if (!normalizedTarget.startsWith(normalizedBase + path.sep) && normalizedTarget !== normalizedBase) {
				return false;
			}
			
			// Additional safety checks
			return this.validatePathSecurity(targetPath, normalizedTarget);
		} catch {
			// Any error in path resolution indicates unsafe path
			return false;
		}
	}

	/**
	 * Comprehensive path security validation
	 * @param originalPath - Original path string
	 * @param resolvedPath - Resolved absolute path
	 * @returns true if path passes security checks
	 */
	private validatePathSecurity(originalPath: string, resolvedPath: string): boolean {
		// Check for directory traversal patterns
		const dangerousPatterns = [
			/\.\.[\/\\]/,        // ../
			/[\/\\]\.\./,        // /..
			/\.\.$/,            // ends with ..
			/^\.\.[\/\\]/,      // starts with ../
			/\0/,               // null bytes
			/[\r\n]/,           // line breaks
			/[<>:"|?*]/         // invalid filename characters on Windows
		];
		
		for (const pattern of dangerousPatterns) {
			if (pattern.test(originalPath)) {
				return false;
			}
		}
		
		// Check for suspicious resolved paths
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
		
		// Check path length to prevent buffer overflow attacks
		if (resolvedPath.length > 4096) {
			return false;
		}
		
		return true;
	}

	/**
	 * Validate and resolve a safe path within a project directory
	 * @param projectPath - Base project path
	 * @param relativePath - Relative path to validate and resolve
	 * @returns Safe resolved path
	 * @throws Error if path is unsafe
	 */
	validateAndResolvePath(projectPath: string, relativePath: string): string {
		if (!projectPath || !relativePath) {
			throw new Error('Path validation requires both project path and relative path');
		}
		
		// Ensure project path is absolute
		const absoluteProjectPath = path.resolve(projectPath);
		
		// Resolve the target path
		const targetPath = path.resolve(absoluteProjectPath, relativePath);
		
		// Validate path safety
		if (!this.isPathSafe(targetPath, absoluteProjectPath)) {
			throw new Error(`Path traversal detected: ${relativePath} resolves outside project boundary`);
		}
		
		return targetPath;
	}

	/**
	 * Create a directory safely within project boundaries
	 * @param projectPath - Base project path
	 * @param relativePath - Relative path to create
	 * @returns Safe resolved path
	 */
	safeCreateDirectory(projectPath: string, relativePath: string): string {
		const safePath = this.validateAndResolvePath(projectPath, relativePath);
		
		// Ensure parent directories exist securely
		const parentDir = path.dirname(safePath);
		if (!fs.existsSync(parentDir)) {
			// Only create if parent is also within project bounds
			if (!this.isPathSafe(parentDir, path.resolve(projectPath))) {
				throw new Error('Cannot create directory: parent directory outside project bounds');
			}
			fs.mkdirSync(parentDir, { recursive: true, mode: 0o755 });
		}
		
		return safePath;
	}
}