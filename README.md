# n8n-nodes-tmux-claudecode

Powerful n8n node for orchestrating Claude AI agents through tmux sessions with mandatory QA validation. Enable 24/7 autonomous development workflows, automated code reviews, and intelligent project management - all within n8n's visual automation platform.

## 🚀 Features

- **Deploy AI Agents**: Spawn Claude agents in tmux sessions with specific roles and briefings
- **Project Management**: Create and manage multi-agent development teams
- **Health Monitoring**: Track agent status, detect blockers, and auto-recover
- **Task Scheduling**: Schedule check-ins, reminders, and recurring tasks
- **Seamless Integration**: Works with GitHub, Slack, and other n8n nodes

## 📦 Installation

### Community Node (Recommended)
1. In n8n, go to **Settings** > **Community Nodes**
2. Click **Install**
3. Enter **@sirmrmarty/n8n-nodes-tmux-orchestrator**
4. Confirm & enjoy!

### Manual Installation
```bash
cd ~/.n8n/custom
git clone https://github.com/sirmrmarty/n8n-nodes-tmux-claudecode.git
cd n8n-nodes-tmux-claudecode
npm install
npm run build
```

### Prerequisites
- tmux installed on your system
- Claude CLI installed and configured
- Python 3.x for advanced monitoring features
- The tmux orchestrator scripts from the parent project

## 🎯 Node Type

### Tmux Project Orchestrator
Unified project management with mandatory QA validation.

**Operations:**
- `createProject` - Initialize project from idea with AI planning
- `approvePlan` - Approve generated project plans
- `assignTask` - Delegate work to team members  
- `getProgress` - Track project completion status
- `validateQuality` - Run mandatory QA validation
- `createTeamMember` - Add new specialized team members
- `dailyStandup` - Collect comprehensive status updates
- `deployAgent` - Start Claude agents in tmux sessions
- `sendMessage` - Send instructions to agents
- `captureOutput` - Get recent output from agents
- `getStatus` - Check agent health and activity
- `listSessions` - List all active tmux sessions
- `terminateAgent` - Cleanly shutdown agents
- `healthCheck` - Check agent responsiveness
- `collectLogs` - Aggregate conversation logs
- `detectBlockers` - Identify stuck agents
- `scheduleCheckIn` - Schedule future check-ins
- `createReminder` - Set agent reminders

## 🔧 Configuration

### Setting Up Credentials
1. In n8n, go to **Credentials**
2. Create new **Tmux Orchestrator API**
3. Configure paths and settings:

```json
{
  "scriptsDirectory": "/path/to/scripts",
  "projectBasePath": "~/Coding",
  "claudeCommand": "claude",
  "defaultAgentRole": "developer",
  "agentStartupDelay": 5000,
  "gitAutoCommit": true,
  "gitCommitInterval": 30,
  "qaValidationEnabled": true,
  "performanceOptimizationsEnabled": true
}
```

## 📚 Example Workflows

### 1. Automated Code Review Pipeline
Automatically review GitHub pull requests with Claude.

```json
// See examples/workflows/code-review-pipeline.json
```

**Flow:**
1. GitHub PR trigger
2. Deploy code reviewer agent
3. Schedule review check-in
4. Capture review results
5. Post comment on PR
6. Clean up agent

### 2. 24/7 Bug Triage System
Autonomous bug analysis and triage.

```json
// See examples/workflows/bug-triage-system.json
```

**Flow:**
1. GitHub issue trigger (bug label)
2. Create bug triage project
3. Assign analysis tasks
4. Monitor progress
5. Check agent health
6. Collect logs and update issue
7. Alert on failures

### 3. Multi-Project Orchestration
Manage multiple projects simultaneously.

```javascript
// Basic setup
const projects = ['frontend', 'backend', 'docs'];

projects.forEach(project => {
  // Deploy project manager
  // Create development team
  // Schedule daily standups
  // Monitor progress
});
```

## 🎮 Usage Examples

### Create a Project from Idea
```javascript
{
  "operation": "createProject",
  "projectName": "payment-system",
  "projectPath": "/home/user/projects/app",
  "projectIdea": "Implement secure payment processing with Stripe integration, including subscription management and webhook handling",
  "complexityLevel": "medium"
}
```

### Deploy a Specialized Agent
```javascript
{
  "operation": "deployAgent",
  "sessionName": "frontend-dev",
  "projectPath": "/home/user/projects/my-app",
  "agentRole": "frontend",
  "initialBriefing": "You are a frontend specialist working on React components with TypeScript. Focus on user interface and user experience."
}
```

### Schedule Regular Check-ins
```javascript
{
  "operation": "scheduleCheckIn",
  "targetWindow": "project:0",
  "minutesUntil": 30,
  "checkInNote": "Provide status update and any blockers"
}
```

### Run QA Validation
```javascript
{
  "operation": "validateQuality",
  "projectName": "payment-system",
  "validationType": "comprehensive",
  "includeSecurityScan": true
}
```

## 🔄 Integration Patterns

### GitHub Integration
- Trigger on PR/Issue events
- Deploy specialized agents
- Post results back to GitHub

### Slack Notifications
- Alert on agent failures
- Share progress updates
- Request human intervention

### Scheduled Workflows
- Daily project standups
- Hourly health checks
- Weekly performance reports

## 🛠️ Advanced Features

### Mandatory QA Validation
Every project includes comprehensive quality assurance:
- Code quality analysis
- Security vulnerability scanning
- Performance optimization checks
- Documentation validation
- Test coverage analysis

### Intelligent Agent Orchestration
- AI-powered project planning from ideas
- Specialized agent roles (frontend, backend, QA, security)
- Dynamic team member creation based on project needs
- Subagent suggestions for complex tasks

### Enhanced Security & Performance  
- Secure execution environment with input validation
- Cryptographic operations for sensitive data
- Performance optimizations with caching
- Python process pooling for heavy operations
- Resource monitoring and cleanup

### Git Auto-Commit
Agents automatically commit work with configurable intervals:
- Prevents work loss
- Maintains detailed history
- Enables easy rollbacks

## 🐛 Troubleshooting

### Agent Not Responding
1. Check tmux session exists: `tmux ls`
2. Verify Claude is running: `tmux capture-pane -t session:0`
3. Use health check operation
4. Restart agent if needed

### Schedule Not Working
1. Verify `at` command installed
2. Check cron service running
3. Validate script paths in credentials

### QA Validation Failures
1. Check project structure and dependencies
2. Verify security scan tools are available
3. Review validation logs in project directory

### Python Bridge Errors
1. Ensure Python 3.x installed
2. Check tmux_utils.py and tmux_wrapper.py paths
3. Verify script permissions and dependencies

## 📖 Documentation

### API Reference
See [API.md](docs/API.md) for detailed node documentation.

### Best Practices
- Always enable QA validation for production projects
- Use meaningful session and project names
- Schedule regular check-ins and standups
- Implement proper error recovery strategies
- Monitor agent health and performance metrics
- Review and approve AI-generated project plans

### Security Considerations
- Credentials are encrypted and securely stored
- All operations run in isolated secure execution environment
- Input validation prevents injection attacks
- Cryptographic operations use industry-standard libraries
- No hardcoded secrets or sensitive data exposure
- Comprehensive audit logging available

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

Built on top of the [N8N Tmux Orchestrator Claude Code](https://github.com/sirmrmarty/n8n-nodes-tmux-claudecode) project.

## 🔗 Links

- [n8n Documentation](https://docs.n8n.io)
- [Claude AI Documentation](https://claude.ai)
- [GitHub Repository](https://github.com/sirmrmarty/n8n-nodes-tmux-claudecode)
- [Report Issues](https://github.com/sirmrmarty/n8n-nodes-tmux-claudecode/issues)
