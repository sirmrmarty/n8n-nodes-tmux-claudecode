#!/bin/bash
# Agent shell aliases and functions for tmux orchestration system

# STATUS command handler
STATUS() {
    local role="${AGENT_ROLE:-developer}"
    local timestamp=$(date +"%H:%M:%S")
    
    case "$role" in
        "project-manager")
            echo "[$timestamp] PROJECT STATUS: Coordinating team activities. Monitoring QA and development progress. Ready to assist with project management tasks."
            ;;
        "qa-engineer")
            echo "[$timestamp] QA STATUS: Systems operational. Ready to run tests and validate code quality. Awaiting code submissions for testing."
            ;;
        "developer")
            echo "[$timestamp] DEVELOPER STATUS: Ready for development tasks. Environment configured. Awaiting project requirements or code assignments."
            echo "Current directory: $(pwd)"
            echo "Git status: $(git status --porcelain 2>/dev/null | wc -l) files changed"
            ;;
        *)
            echo "[$timestamp] AGENT STATUS: Online and ready. Waiting for task assignments."
            ;;
    esac
    
    # Also show current working directory and any active processes
    echo "Working directory: $(pwd)"
    echo "Active processes: $(jobs | wc -l) background jobs"
}

# Export the function so it's available
export -f STATUS

# Create alias for common status request patterns
alias "STATUS REQUEST"='STATUS'
alias "status"='STATUS'
alias "Status"='STATUS'

# Progress reporting function
PROGRESS() {
    local percentage="${1:-0}"
    echo "Progress: ${percentage}% complete"
    echo "Last updated: $(date)"
}
export -f PROGRESS

# Blocker reporting function  
BLOCKERS() {
    echo "Current blockers: ${1:-None}"
    echo "Reported at: $(date)"
}
export -f BLOCKERS

# Set default role if not already set
if [ -z "$AGENT_ROLE" ]; then
    # Try to detect role from tmux window name
    if command -v tmux >/dev/null 2>&1; then
        WINDOW_NAME=$(tmux display-message -p '#W' 2>/dev/null || echo "")
        WINDOW_INDEX=$(tmux display-message -p '#I' 2>/dev/null || echo "")
        
        case "$WINDOW_NAME" in
            *[Pp]roject*|*[Mm]anager*|*PM*)
                export AGENT_ROLE="project-manager"
                ;;
            *QA*|*[Tt]est*|*[Qq]uality*)
                export AGENT_ROLE="qa-engineer"
                ;;
            *[Dd]ev*|*[Cc]ode*|*Engineer*)
                export AGENT_ROLE="developer"
                ;;
            *)
                # Default based on window index
                case "$WINDOW_INDEX" in
                    0) export AGENT_ROLE="project-manager" ;;
                    1) export AGENT_ROLE="qa-engineer" ;;
                    *) export AGENT_ROLE="developer" ;;
                esac
                ;;
        esac
    else
        export AGENT_ROLE="developer"
    fi
fi

# Set PS1 to show agent role
export PS1="[$AGENT_ROLE] \u@\h:\w\$ "

# Welcome message
echo "Agent shell initialized with role: $AGENT_ROLE"
echo "Available commands: STATUS, PROGRESS [%], BLOCKERS [description]"