import type {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TmuxOrchestratorApi implements ICredentialType {
	name = 'tmuxOrchestratorApi';
	displayName = 'Tmux Orchestrator Configuration';
	documentationUrl = 'https://github.com/sirmrmarty/n8n-nodes-tmux-claudecode';
	properties: INodeProperties[] = [
		{
			displayName: 'Configuration Name',
			name: 'configName',
			type: 'string',
			default: 'Default',
			description: 'Name for this configuration',
		},
		{
			displayName: 'Use External Scripts',
			name: 'useExternalScripts',
			type: 'boolean',
			default: false,
			description: 'Use external scripts instead of bundled ones',
		},
		{
			displayName: 'External Scripts Directory',
			name: 'scriptsDirectory',
			type: 'string',
			default: '',
			displayOptions: {
				show: {
					useExternalScripts: [true],
				},
			},
			description: 'Directory containing external tmux orchestrator scripts (leave empty to use bundled scripts)',
		},
		{
			displayName: 'Project Base Path',
			name: 'projectBasePath',
			type: 'string',
			default: '~/Coding',
			description: 'Base directory for projects',
		},
		{
			displayName: 'Claude Command',
			name: 'claudeCommand',
			type: 'string',
			default: 'claude',
			description: 'Command to start Claude agents',
		},
		{
			displayName: 'Default Agent Role',
			name: 'defaultAgentRole',
			type: 'options',
			options: [
				{
					name: 'Developer',
					value: 'developer',
				},
				{
					name: 'Project Manager',
					value: 'projectManager',
				},
				{
					name: 'QA Engineer',
					value: 'qaEngineer',
				},
				{
					name: 'DevOps',
					value: 'devops',
				},
			],
			default: 'developer',
			description: 'Default role for new agents',
		},
		{
			displayName: 'Agent Startup Delay',
			name: 'agentStartupDelay',
			type: 'number',
			default: 5000,
			description: 'Milliseconds to wait for agent to start',
		},
		{
			displayName: 'Max Windows Per Session',
			name: 'maxWindowsPerSession',
			type: 'number',
			default: 10,
			description: 'Maximum windows allowed per tmux session',
		},
		{
			displayName: 'Enable Safety Mode',
			name: 'enableSafetyMode',
			type: 'boolean',
			default: false,
			description: 'Require confirmation for potentially destructive operations',
		},
		{
			displayName: 'Log Directory',
			name: 'logDirectory',
			type: 'string',
			default: '/tmp/tmux-orchestrator-logs',
			description: 'Directory for storing agent logs',
		},
		{
			displayName: 'Git Auto-Commit',
			name: 'gitAutoCommit',
			type: 'boolean',
			default: true,
			description: 'Enable automatic git commits every 30 minutes',
		},
		{
			displayName: 'Git Commit Interval',
			name: 'gitCommitInterval',
			type: 'number',
			default: 30,
			description: 'Minutes between automatic git commits',
		},
		{
			displayName: 'Agent Templates',
			name: 'agentTemplates',
			type: 'json',
			default: JSON.stringify({
				developer: {
					briefing: 'You are a Developer agent. Focus on implementation, code quality, and technical solutions.',
					tools: ['git', 'npm', 'python'],
					commitFrequency: 30,
				},
				projectManager: {
					briefing: 'You are a Project Manager. Maintain high standards, coordinate team members, and ensure project success.',
					tools: ['git', 'github-cli'],
					commitFrequency: 60,
				},
				qaEngineer: {
					briefing: 'You are a QA Engineer. Focus on testing, validation, and quality assurance.',
					tools: ['jest', 'pytest', 'cypress'],
					commitFrequency: 45,
				},
			}, null, 2),
			description: 'JSON templates for different agent roles',
		},
		{
			displayName: 'Default Team Size',
			name: 'defaultTeamSize',
			type: 'options',
			options: [
				{
					name: 'Small (PM + 1 Dev)',
					value: 'small',
				},
				{
					name: 'Medium (PM + 2 Devs + QA)',
					value: 'medium',
				},
				{
					name: 'Large (PM + Lead + 2 Devs + QA + DevOps)',
					value: 'large',
				},
			],
			default: 'small',
			description: 'Default team size for new projects',
		},
		{
			displayName: 'Monitor Health Check Interval',
			name: 'monitorHealthCheckInterval',
			type: 'number',
			default: 300,
			description: 'Seconds between health checks',
		},
		{
			displayName: 'Blocker Detection Keywords',
			name: 'blockerDetectionKeywords',
			type: 'string',
			default: 'error,failed,exception,blocked,stuck,waiting,timeout,permission denied',
			description: 'Comma-separated keywords for detecting blocked agents',
		},
		{
			displayName: 'Enable Webhooks',
			name: 'enableWebhooks',
			type: 'boolean',
			default: false,
			description: 'Enable webhook notifications for agent events',
		},
		{
			displayName: 'Webhook URL',
			name: 'webhookUrl',
			type: 'string',
			default: '',
			displayOptions: {
				show: {
					enableWebhooks: [true],
				},
			},
			description: 'URL for webhook notifications',
		},
		{
			displayName: 'Slack Integration',
			name: 'slackIntegration',
			type: 'boolean',
			default: false,
			description: 'Enable Slack notifications',
		},
		{
			displayName: 'Slack Webhook URL',
			name: 'slackWebhookUrl',
			type: 'string',
			default: '',
			displayOptions: {
				show: {
					slackIntegration: [true],
				},
			},
			description: 'Slack webhook URL for notifications',
		},
		{
			displayName: 'Git Worktree Configuration',
			name: 'worktreeConfig',
			type: 'collection',
			default: {},
			description: 'Configure git worktree support for projects',
			options: [
				{
					displayName: 'Use Git Worktree',
					name: 'useGitWorktree',
					type: 'boolean',
					default: false,
					description: 'Create git worktrees for projects instead of regular repos',
				},
				{
					displayName: 'Main Branch',
					name: 'mainBranch',
					type: 'string',
					default: 'main',
					description: 'Name of the main branch to create worktrees from',
				},
				{
					displayName: 'Worktree Base Path',
					name: 'worktreeBasePath',
					type: 'string',
					default: '~/worktrees',
					description: 'Base directory for git worktrees',
				},
				{
					displayName: 'Parent Repository Path',
					name: 'parentRepoPath',
					type: 'string',
					default: '',
					description: 'Path to parent repository for worktrees',
				},
			],
		},
		{
			displayName: 'Subagent Configuration',
			name: 'subagentConfig',
			type: 'collection',
			default: {},
			description: 'Configure available subagents for Claude Code',
			options: [
				{
					displayName: 'Enable All Subagents',
					name: 'enableAllSubagents',
					type: 'boolean',
					default: true,
					description: 'Enable all available Claude Code subagents',
				},
				{
					displayName: 'Custom Subagents',
					name: 'customSubagents',
					type: 'string',
					default: '',
					displayOptions: {
						show: {
							enableAllSubagents: [false],
						},
					},
					description: 'Comma-separated list of specific subagents to enable (e.g. developer,qa-expert,code-reviewer)',
				},
			],
		},
		{
			displayName: 'MCP Server Configuration',
			name: 'mcpServers',
			type: 'json',
			default: JSON.stringify({
				filesystem: {
					command: 'npx',
					args: ['-y', '@modelcontextprotocol/server-filesystem', '/home'],
				},
				github: {
					command: 'npx',
					args: ['-y', '@modelcontextprotocol/server-github'],
					env: {
						GITHUB_TOKEN: 'your-github-token',
					},
				},
			}, null, 2),
			description: 'MCP server configuration for agent tools',
		},
		{
			displayName: 'Claude Command Options',
			name: 'claudeCommandOptions',
			type: 'string',
			default: '',
			description: 'Additional command-line options for claude (e.g. --model claude-3-opus-20240229)',
		},
		{
			displayName: 'GitHub Configuration',
			name: 'githubConfig',
			type: 'collection',
			default: {},
			description: 'Configure GitHub integration for pull requests',
			options: [
				{
					displayName: 'GitHub Token',
					name: 'githubToken',
					type: 'string',
					typeOptions: {
						password: true,
					},
					default: '',
					description: 'GitHub personal access token for API operations',
				},
				{
					displayName: 'Default Repository',
					name: 'defaultRepository',
					type: 'string',
					default: '',
					description: 'Default GitHub repository (format: owner/repo)',
				},
				{
					displayName: 'Auto-create PR',
					name: 'autoCreatePR',
					type: 'boolean',
					default: false,
					description: 'Automatically create PR when project is completed',
				},
				{
					displayName: 'PR Template',
					name: 'prTemplate',
					type: 'string',
					typeOptions: {
						rows: 10,
					},
					default: `## Summary
{project_description}

## Changes
- {changes_summary}

## Test Plan
- {test_summary}

## QA Status
- {qa_status}

🤖 Generated with Claude Code Tmux Orchestrator`,
					description: 'Template for pull request descriptions',
				},
			],
		},
	];
}
