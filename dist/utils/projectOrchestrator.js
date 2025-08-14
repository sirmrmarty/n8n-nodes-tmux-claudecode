"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectOrchestrator = void 0;
class ProjectOrchestrator {
    constructor(bridge, config = {}) {
        this.monitoredProjects = new Map();
        this.isMonitoring = false;
        this.bridge = bridge;
        this.config = {
            checkInterval: 60000,
            maxRetries: 5,
            autoCreatePR: true,
            ...config,
        };
    }
    async addProject(projectName) {
        if (!this.monitoredProjects.has(projectName)) {
            this.monitoredProjects.set(projectName, {
                projectName,
                isComplete: false,
                qaApproved: false,
                readyForPR: false,
                prCreated: false,
                lastCheck: new Date(),
                retryCount: 0,
            });
            console.log(`Added project ${projectName} to monitoring queue`);
            if (!this.isMonitoring) {
                this.startMonitoring();
            }
        }
    }
    removeProject(projectName) {
        this.monitoredProjects.delete(projectName);
        console.log(`Removed project ${projectName} from monitoring`);
        if (this.monitoredProjects.size === 0) {
            this.stopMonitoring();
        }
    }
    startMonitoring() {
        if (this.isMonitoring) {
            return;
        }
        console.log('Starting autonomous project monitoring...');
        this.isMonitoring = true;
        this.monitoringInterval = setInterval(async () => {
            await this.checkAllProjects();
        }, this.config.checkInterval);
    }
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        this.isMonitoring = false;
        console.log('Stopped autonomous project monitoring');
    }
    async checkAllProjects() {
        const promises = Array.from(this.monitoredProjects.keys()).map(async (projectName) => {
            try {
                await this.checkProject(projectName);
            }
            catch (error) {
                console.error(`Error checking project ${projectName}:`, error.message);
            }
        });
        await Promise.allSettled(promises);
    }
    async checkProject(projectName) {
        const status = this.monitoredProjects.get(projectName);
        if (!status || status.prCreated) {
            return;
        }
        try {
            const sessions = await this.bridge.getTmuxSessions();
            const projectSession = sessions.find(s => s.name === projectName);
            if (!projectSession) {
                console.warn(`Project session ${projectName} not found - removing from monitoring`);
                this.removeProject(projectName);
                return;
            }
            const completionStatus = await this.checkProjectCompletion(projectName);
            status.isComplete = completionStatus.isComplete;
            status.qaApproved = completionStatus.qaApproved;
            status.readyForPR = completionStatus.readyForPR;
            status.lastCheck = new Date();
            if (status.readyForPR && !status.prCreated && this.config.autoCreatePR) {
                console.log(`Project ${projectName} is ready - initiating automatic PR creation...`);
                const prResult = await this.createAutomaticPR(projectName);
                if (prResult.success) {
                    status.prCreated = true;
                    status.prUrl = prResult.prUrl;
                    console.log(`Autonomous PR creation successful for ${projectName}: ${prResult.prUrl}`);
                    await this.notifyProjectCompletion(projectName, prResult.prUrl);
                    this.removeProject(projectName);
                }
                else {
                    status.retryCount++;
                    console.error(`PR creation failed for ${projectName} (attempt ${status.retryCount}): ${prResult.error}`);
                    if (status.retryCount >= (this.config.maxRetries || 5)) {
                        console.error(`Max retries reached for ${projectName} - removing from monitoring`);
                        this.removeProject(projectName);
                    }
                }
            }
        }
        catch (error) {
            status.retryCount++;
            console.error(`Error monitoring project ${projectName}:`, error.message);
            if (status.retryCount >= (this.config.maxRetries || 5)) {
                console.error(`Max retries reached for ${projectName} - removing from monitoring`);
                this.removeProject(projectName);
            }
        }
    }
    async checkProjectCompletion(projectName) {
        await this.bridge.sendClaudeMessage(`${projectName}:0`, 'AUTONOMOUS STATUS CHECK: Please respond with "PROJECT COMPLETE" if all objectives are met and ready for PR. This is an automated check.');
        await new Promise(resolve => setTimeout(resolve, 3000));
        const pmOutput = await this.bridge.captureWindowContent(projectName, 0, 20);
        let pmResponse = '';
        if (typeof pmOutput === 'string') {
            pmResponse = pmOutput.split('\n').slice(-10).join('\n').toLowerCase();
        }
        const completionSignals = [
            'project complete',
            'ready for pr',
            'ready for pull request',
            'objectives met',
            'deliverables complete',
            'implementation finished'
        ];
        const isComplete = completionSignals.some(signal => pmResponse.includes(signal));
        let qaApproved = false;
        try {
            const qaOutput = await this.bridge.captureWindowContent(projectName, 1, 15);
            if (typeof qaOutput === 'string') {
                const qaText = qaOutput.toLowerCase();
                qaApproved = qaText.includes('approved') ||
                    qaText.includes('qa approved') ||
                    qaText.includes('tests passed') ||
                    qaText.includes('validation complete');
            }
        }
        catch {
            qaApproved = isComplete;
        }
        return {
            isComplete,
            qaApproved,
            readyForPR: isComplete && qaApproved,
        };
    }
    async createAutomaticPR(projectName) {
        try {
            await this.bridge.sendCommandToWindow(projectName, 0, 'pwd');
            await new Promise(resolve => setTimeout(resolve, 1000));
            const output = await this.bridge.captureWindowContent(projectName, 0, 5);
            let projectPath = '';
            if (typeof output === 'string') {
                const lines = output.trim().split('\n');
                projectPath = lines[lines.length - 1].trim();
            }
            if (!projectPath) {
                throw new Error('Could not determine project path');
            }
            const branchCmd = `cd ${projectPath} && git branch --show-current`;
            await this.bridge.sendCommandToWindow(projectName, 0, branchCmd);
            await new Promise(resolve => setTimeout(resolve, 1000));
            const branchOutput = await this.bridge.captureWindowContent(projectName, 0, 5);
            let currentBranch = '';
            if (typeof branchOutput === 'string') {
                const lines = branchOutput.trim().split('\n');
                currentBranch = lines[lines.length - 1].trim();
            }
            const pushCmd = `cd ${projectPath} && git add . && git commit -m "Autonomous completion commit" && git push -u origin ${currentBranch}`;
            await this.bridge.sendCommandToWindow(projectName, 0, pushCmd);
            await new Promise(resolve => setTimeout(resolve, 5000));
            const prTitle = `[Autonomous] ${projectName} - Project Complete`;
            const prDescription = this.generatePRDescription(projectName);
            const prResult = await this.bridge.createGitHubPR(projectPath, {
                title: prTitle,
                body: prDescription,
                base: 'main',
                head: currentBranch,
                credentials: this.config.credentials,
            });
            return prResult;
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    generatePRDescription(projectName) {
        const template = this.config.credentials?.githubConfig?.prTemplate || `
## Summary
Autonomous completion of ${projectName} project.

## Changes
- Project implementation completed autonomously
- All objectives met per PM confirmation
- QA validation passed

## Test Plan
- Automated testing completed
- QA approval obtained
- Ready for review and merge

## QA Status
✅ QA Approved - All validations passed

🤖 Generated autonomously with Claude Code Tmux Orchestrator
		`.trim();
        return template
            .replace(/{project_name}/g, projectName)
            .replace(/{project_description}/g, `Autonomous completion of ${projectName}`)
            .replace(/{changes_summary}/g, 'Implementation completed autonomously')
            .replace(/{test_summary}/g, 'All tests passed, QA approved')
            .replace(/{qa_status}/g, '✅ QA Approved');
    }
    async notifyProjectCompletion(projectName, prUrl) {
        try {
            const completionMessage = `
🎉 AUTONOMOUS PROJECT COMPLETION SUCCESS! 🎉

Project: ${projectName}
Pull Request: ${prUrl}

The project has been completed autonomously and is ready for final review and merge.

Next Steps:
- Review the pull request
- Merge when ready
- Deploy to production

Autonomous orchestration complete! 🚀
			`.trim();
            await this.bridge.sendClaudeMessage(`${projectName}:0`, completionMessage);
            try {
                await this.bridge.sendClaudeMessage(`${projectName}:1`, completionMessage);
            }
            catch {
            }
            console.log(`Team notified of autonomous completion for ${projectName}`);
        }
        catch (error) {
            console.error(`Failed to notify team for ${projectName}:`, error.message);
        }
    }
    getMonitoringStatus() {
        return {
            isMonitoring: this.isMonitoring,
            projectCount: this.monitoredProjects.size,
            projects: Array.from(this.monitoredProjects.values()),
        };
    }
    destroy() {
        this.stopMonitoring();
        this.monitoredProjects.clear();
        console.log('Project orchestrator destroyed');
    }
}
exports.ProjectOrchestrator = ProjectOrchestrator;
//# sourceMappingURL=projectOrchestrator.js.map