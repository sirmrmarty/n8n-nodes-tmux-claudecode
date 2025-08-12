#!/bin/bash

# Suggest subagent usage to agents in tmux windows
# Usage: suggest_subagent.sh <target> <agent_type> [context]

if [ $# -lt 2 ]; then
    echo "Usage: $0 <session:window> <agent_type> [context]"
    echo "Agent types: pm, developer, engineer, general"
    echo "Example: $0 project:0 pm 'handling multiple features'"
    exit 1
fi

TARGET="$1"
AGENT_TYPE="$2"
CONTEXT="${3:-}"

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SEND_SCRIPT="$SCRIPT_DIR/send-claude-message.sh"

# Check if send-claude-message.sh exists
if [ ! -f "$SEND_SCRIPT" ]; then
    echo "Error: send-claude-message.sh not found at $SEND_SCRIPT" >&2
    exit 1
fi

# Check if target exists
if ! tmux list-panes -t "$TARGET" >/dev/null 2>&1; then
    echo "Error: Tmux target '$TARGET' does not exist" >&2
    exit 1
fi

# Build the suggestion message based on agent type
case "$AGENT_TYPE" in
    pm|project-manager)
        MESSAGE="🚀 SUBAGENT SUGGESTION: I notice you're managing complex tasks"
        if [ -n "$CONTEXT" ]; then
            MESSAGE="$MESSAGE ($CONTEXT)"
        fi
        MESSAGE="$MESSAGE. Consider deploying subagents for parallel execution:

• For implementation work: Use Task tool with subagent_type='developer' or 'fullstack-developer'
• For testing: Use Task tool with subagent_type='qa-expert' or 'test-automator'
• For research: Use Task tool with subagent_type='research-analyst' or 'search-specialist'
• For code review: Use Task tool with subagent_type='code-reviewer'
• For documentation: Use Task tool with subagent_type='technical-writer'

Example command:
Task tool with prompt='Implement user authentication with JWT tokens' and subagent_type='backend-developer'

Remember: Effective delegation multiplies your impact. Each subagent can work independently!"
        ;;
        
    developer|engineer)
        MESSAGE="⚡ PERFORMANCE TIP: You can accelerate your work with specialized subagents"
        if [ -n "$CONTEXT" ]; then
            MESSAGE="$MESSAGE ($CONTEXT)"
        fi
        MESSAGE="$MESSAGE:

• For debugging: Use Task tool with subagent_type='debugger' to trace complex issues
• For optimization: Use Task tool with subagent_type='performance-engineer'
• For testing: Use Task tool with subagent_type='test-automator' to create comprehensive tests
• For review: Use Task tool with subagent_type='code-reviewer' for immediate feedback
• For refactoring: Use Task tool with subagent_type='refactoring-specialist'

Example usage:
Task tool with prompt='Debug the memory leak in the payment processing module' and subagent_type='debugger'

Pro tip: While the subagent investigates, you can continue with other development tasks!"
        ;;
        
    general)
        MESSAGE="💡 EFFICIENCY BOOST: Consider using subagents for parallel task execution"
        if [ -n "$CONTEXT" ]; then
            MESSAGE="$MESSAGE ($CONTEXT)"
        fi
        MESSAGE="$MESSAGE.

Available specialist subagents:
• Research: 'research-analyst', 'search-specialist', 'data-researcher'
• Development: 'frontend-developer', 'backend-developer', 'fullstack-developer'
• Testing: 'qa-expert', 'test-automator', 'performance-engineer'
• Infrastructure: 'devops-engineer', 'cloud-architect', 'kubernetes-specialist'
• Code Quality: 'code-reviewer', 'refactoring-specialist', 'debugger'

Deploy with: Task tool with prompt='[your task]' and subagent_type='[agent-type]'

Parallel execution is your superpower - use it!"
        ;;
        
    *)
        echo "Error: Unknown agent type '$AGENT_TYPE'" >&2
        echo "Valid types: pm, developer, engineer, general" >&2
        exit 1
        ;;
esac

# Send the suggestion using send-claude-message.sh
echo "Sending subagent suggestion to $TARGET..."
"$SEND_SCRIPT" "$TARGET" "$MESSAGE"

if [ $? -eq 0 ]; then
    echo "✓ Subagent suggestion sent successfully"
    
    # Log the suggestion for tracking
    LOG_FILE="$SCRIPT_DIR/subagent_suggestions.log"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Suggested subagents to $TARGET (type: $AGENT_TYPE, context: $CONTEXT)" >> "$LOG_FILE"
else
    echo "✗ Failed to send subagent suggestion" >&2
    exit 1
fi