#!/bin/bash

# Send message to Claude agent in tmux window
# Usage: send-claude-message.sh <session:window> <message>
# Usage: send-claude-message.sh <session:window> --file <temp_file>

if [ $# -lt 2 ]; then
    echo "Usage: $0 <session:window> <message>"
    echo "   or: $0 <session:window> --file <temp_file>"
    echo "Example: $0 agentic-seek:3 'Hello Claude!'"
    exit 1
fi

WINDOW="$1"
shift  # Remove first argument

# Check if using file mode
if [ "$1" = "--file" ]; then
    if [ $# -lt 2 ]; then
        echo "Error: --file option requires a file path" >&2
        exit 1
    fi
    TEMP_FILE="$2"
    
    # Validate temp file exists and is readable
    if [ ! -f "$TEMP_FILE" ] || [ ! -r "$TEMP_FILE" ]; then
        echo "Error: Temporary file '$TEMP_FILE' does not exist or is not readable" >&2
        exit 1
    fi
    
    # Read message from file
    MESSAGE=$(cat "$TEMP_FILE" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "Error: Failed to read message from '$TEMP_FILE'" >&2
        exit 1
    fi
else
    # Traditional mode: message as arguments
    MESSAGE="$*"
fi

# Validate window format (session:window or session:window.pane)
if ! [[ "$WINDOW" =~ ^[a-zA-Z0-9_-]+:[0-9]+(\.[0-9]+)?$ ]]; then
    echo "Error: Invalid window format. Expected format: session:window or session:window.pane" >&2
    echo "Example: my-session:0 or my-session:0.1" >&2
    exit 1
fi

# Check if the tmux target exists
if ! tmux list-panes -t "$WINDOW" >/dev/null 2>&1; then
    echo "Error: Tmux target '$WINDOW' does not exist" >&2
    echo "Available sessions:" >&2
    tmux list-sessions 2>/dev/null || echo "  No tmux sessions found" >&2
    exit 1
fi

# Validate message is not empty
if [ -z "$MESSAGE" ]; then
    echo "Error: Message cannot be empty" >&2
    exit 1
fi

# Send the message
if ! tmux send-keys -t "$WINDOW" "$MESSAGE" 2>/dev/null; then
    echo "Error: Failed to send message to $WINDOW" >&2
    exit 1
fi

# Wait 0.5 seconds for UI to register
sleep 0.5

# Send Enter to submit
if ! tmux send-keys -t "$WINDOW" Enter 2>/dev/null; then
    echo "Error: Failed to send Enter key to $WINDOW" >&2
    exit 1
fi

echo "Message sent to $WINDOW: $MESSAGE"