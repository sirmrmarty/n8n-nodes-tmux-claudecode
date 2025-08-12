# n8n-nodes-tmux-orchestrator

Powerful n8n nodes for orchestrating Claude AI agents through tmux sessions. Enable 24/7 autonomous development workflows, automated code reviews, and intelligent project management - all within n8n's visual automation platform.

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
3. Enter **@sirmrmarty/n8n-nodes-tmux-claudecode**
4. Confirm & enjoy!

### Manual Installation
```bash
cd ~/.n8n/custom
git clone https://github.com/sirmrmarty/n8n-nodes-tmux-claudecoder.git
cd n8n-nodes-tmux-orchestrator
npm install
npm run build
```

### Prerequisites
- tmux installed on your system
- Claude CLI installed and configured
- Python 3.x for advanced monitoring features
- The tmux orchestrator scripts from the parent project

## 🎯 Node Types

### 1. Tmux Orchestrator
Core node for managing Claude agents.

**Operations:**
- `deployAgent` - Start a new Claude agent in a tmux session
- `sendMessage` - Send instructions to an agent
- `captureOutput` - Get recent output from an agent
- `getStatus` - Check agent health and activity
- `listSessions` - List all active tmux sessions
- `terminateAgent` - Cleanly shutdown an agent

### 2. Tmux Project Manager
Coordinate multi-agent projects with quality control.

**Operations:**
- `createProject` - Initialize project with PM and team
- `assignTask` - Delegate work to team members
- `getProgress` - Track project completion
- `validateQuality` - Run PM quality checks
- `createTeamMember` - Add new team members
- `dailyStandup` - Collect status updates

### 3. Tmux Agent Monitor
Monitor and analyze agent health and activity.

**Operations:**
- `listAllSessions` - Get all sessions with details
- `healthCheck` - Check agent responsiveness
- `collectLogs` - Aggregate conversation logs
- `detectBlockers` - Identify stuck agents
- `monitorSnapshot` - Create monitoring snapshot
- `activityReport` - Generate activity reports

### 4. Tmux Scheduler
Schedule tasks and automate agent check-ins.

**Operations:**
- `scheduleCheckIn` - Schedule future check-ins
- `createReminder` - Set agent reminders
- `manageCronJobs` - Create recurring tasks
- `listScheduledTasks` - View all scheduled tasks
- `cancelTask` - Cancel scheduled tasks
- `batchSchedule` - Schedule multiple tasks

## 🔧 Configuration

### Setting Up Credentials
1. In n8n, go to **Credentials**
2. Create new **Tmux Orchestrator Configuration**
3. Configure paths and settings:

```json
{
  "scriptsDirectory": "/path/to/tmux-orchestrator",
  "projectBasePath": "~/Coding",
  "claudeCommand": "claude",
  "defaultAgentRole": "developer",
  "agentStartupDelay": 5000,
  "gitAutoCommit": true,
  "gitCommitInterval": 30
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

### Deploy a Developer Agent
```javascript
{
  "operation": "deployAgent",
  "sessionName": "my-project",
  "projectPath": "/home/user/projects/my-app",
  "agentRole": "developer",
  "initialBriefing": "You are working on a React application. Focus on implementing the user authentication feature."
}
```

### Create a Project Team
```javascript
{
  "operation": "createProject",
  "projectName": "new-feature",
  "projectPath": "/home/user/projects/app",
  "projectSpec": "Implement payment processing with Stripe",
  "teamSize": "medium"
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

### Monitor Agent Health
```javascript
{
  "operation": "healthCheck",
  "targetSessions": "project-1,project-2",
  "responseTimeout": 10
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

### Agent Templates
Define custom agent templates in credentials:

```json
{
  "agentTemplates": {
    "frontend": {
      "briefing": "You are a frontend specialist...",
      "tools": ["react", "typescript", "jest"],
      "commitFrequency": 30
    }
  }
}
```

### Git Auto-Commit
Agents automatically commit work every 30 minutes:
- Prevents work loss
- Maintains history
- Enables rollbacks

### Blocker Detection
Automatically identifies stuck agents by detecting:
- Error keywords
- Repetitive output
- Waiting for input states

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

### Python Bridge Errors
1. Ensure Python 3.x installed
2. Check tmux_utils.py path
3. Verify script permissions

## 📖 Documentation

### API Reference
See [API.md](docs/API.md) for detailed node documentation.

### Best Practices
- Always set up health monitoring
- Use meaningful session names
- Schedule regular check-ins
- Implement error recovery
- Log agent conversations

### Security Considerations
- Credentials are encrypted
- Scripts run with user permissions
- No hardcoded secrets
- Audit log available

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
- [Tmux Orchestrator](https://github.com/Jedward23/tmux-orchestrator)
- [Claude AI](https://claude.ai)
- [Report Issues](https://github.com/marwim/n8n-nodes-tmux-orchestrator/issues)
