# Quick Start Guide - n8n Tmux Orchestrator

## 🚀 Installation (5 minutes)

### Step 1: Install Dependencies
```bash
# Ensure tmux is installed
sudo apt-get install tmux  # Ubuntu/Debian
brew install tmux          # macOS

# Ensure Python 3 is installed
python3 --version

# Ensure Claude CLI is installed
claude --version
```

### Step 2: Install the n8n Nodes
```bash
cd ~/.n8n/custom
git clone https://github.com/marwim/n8n-nodes-tmux-orchestrator.git
cd n8n-nodes-tmux-orchestrator
npm install
npm run build
```

### Step 3: Restart n8n
```bash
n8n stop
n8n start
```

## ⚡ Your First Workflow (10 minutes)

### 1. Simple Agent Deployment

Create a new workflow in n8n and add these nodes:

1. **Manual Trigger** (to start the workflow)
2. **Tmux Orchestrator** node with:
   - Operation: `Deploy Agent`
   - Session Name: `test-agent`
   - Agent Role: `developer`
   - Initial Briefing: `Hello! Please introduce yourself.`

3. **Wait** node (30 seconds)
4. **Tmux Orchestrator** node with:
   - Operation: `Capture Output`
   - Target Window: `test-agent:0`
   - Number of Lines: `50`

Connect them in sequence and run!

## 🎯 Common Use Cases

### Deploy a Code Review Agent
```javascript
// Tmux Orchestrator node configuration
{
  "operation": "deployAgent",
  "sessionName": "code-review",
  "agentRole": "codeReviewer",
  "initialBriefing": "Review the latest commits in the main branch"
}
```

### Create a Development Team
```javascript
// Tmux Project Manager node configuration
{
  "operation": "createProject",
  "projectName": "my-app",
  "projectPath": "/home/user/projects/my-app",
  "teamSize": "medium",
  "projectSpec": "Build a REST API with authentication"
}
```

### Monitor All Agents
```javascript
// Tmux Agent Monitor node configuration
{
  "operation": "healthCheck",
  "responseTimeout": 10
}
```

### Schedule Daily Standup
```javascript
// Tmux Scheduler node configuration
{
  "operation": "manageCronJobs",
  "cronAction": "create",
  "cronSchedule": "0 9 * * *",
  "cronCommand": "Daily standup for all agents"
}
```

## 📝 Workflow Templates

### Template 1: GitHub PR Auto-Review
1. GitHub Trigger (on PR)
2. Deploy Code Reviewer
3. Wait 5 minutes
4. Capture Review
5. Post to GitHub
6. Cleanup Agent

### Template 2: Bug Triage
1. GitHub Issue Trigger
2. Create Bug Project
3. Assign to Developer
4. Monitor Progress
5. Update Issue
6. Alert on Completion

### Template 3: Continuous Monitoring
1. Cron Trigger (every hour)
2. List All Sessions
3. Health Check
4. Detect Blockers
5. Send Slack Alert (if issues)
6. Auto-recover Stuck Agents

## 🔍 Checking Agent Status

### Via n8n
Add a **Tmux Agent Monitor** node:
- Operation: `Monitor Snapshot`
- This gives you a complete overview

### Via Terminal
```bash
# List all tmux sessions
tmux ls

# View agent output
tmux attach -t session-name

# Capture recent activity
tmux capture-pane -t session:0 -p
```

## 🆘 Troubleshooting

### "Session not found"
- Check session exists: `tmux ls`
- Verify session name spelling
- Ensure tmux is running

### "Agent not responding"
- Use Health Check operation
- Check if Claude is running
- Restart the agent if needed

### "Python script failed"
- Check Python is installed: `python3 --version`
- Verify script paths in node configuration
- Check file permissions

## 💡 Pro Tips

1. **Always name sessions meaningfully**
   - Good: `frontend-auth-feature`
   - Bad: `session1`

2. **Schedule regular check-ins**
   - Every 30 minutes for active development
   - Every hour for monitoring

3. **Use health checks**
   - Before important operations
   - In error handling branches

4. **Implement recovery workflows**
   - Detect stuck agents
   - Auto-restart on failure
   - Alert humans when needed

5. **Log everything**
   - Enable log collection
   - Save to files for audit
   - Review for improvements

## 🎓 Next Steps

1. Import example workflows from `examples/workflows/`
2. Customize agent templates in credentials
3. Set up Slack/email notifications
4. Create your own workflow templates
5. Join the community for support

## 📚 Resources

- [Full Documentation](README.md)
- [API Reference](docs/API.md)
- [Example Workflows](examples/workflows/)
- [Tmux Orchestrator Docs](https://github.com/marwim/tmux-orchestrator)
- [n8n Documentation](https://docs.n8n.io)

## 🤝 Get Help

- GitHub Issues: [Report bugs or request features](https://github.com/marwim/n8n-nodes-tmux-orchestrator/issues)
- Community Forum: [n8n Community](https://community.n8n.io)
- Discord: Join the n8n Discord server

---

**Ready to orchestrate AI agents at scale? Start building! 🚀**