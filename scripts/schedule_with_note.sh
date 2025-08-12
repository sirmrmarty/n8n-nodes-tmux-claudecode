#!/bin/bash
# Dynamic scheduler with note for next check
# Usage: ./schedule_with_note.sh <minutes> "<note>" [target_window]

MINUTES=${1:-3}
NOTE=${2:-"Standard check-in"}
TARGET=${3:-"tmux-orc:0"}

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NOTE_FILE="$SCRIPT_DIR/next_check_note.txt"

# Validate minutes parameter
if ! [[ "$MINUTES" =~ ^[0-9]+$ ]] || [ "$MINUTES" -le 0 ]; then
    echo "Error: Minutes must be a positive integer" >&2
    exit 1
fi

# Check if tmux target exists
if ! tmux list-panes -t "$TARGET" >/dev/null 2>&1; then
    echo "Error: Tmux target '$TARGET' does not exist" >&2
    exit 1
fi

# Create a note file for the next check
echo "=== Next Check Note ($(date)) ===" > "$NOTE_FILE"
echo "Scheduled for: $MINUTES minutes" >> "$NOTE_FILE"
echo "" >> "$NOTE_FILE"
echo "$NOTE" >> "$NOTE_FILE"

echo "Scheduling check in $MINUTES minutes with note: $NOTE"

# Calculate the exact time when the check will run
CURRENT_TIME=$(date +"%H:%M:%S")

# Platform-specific date calculation with proper error handling
if command -v gdate >/dev/null 2>&1; then
    # macOS with GNU date installed via homebrew
    RUN_TIME=$(gdate -d "+${MINUTES} minutes" +"%H:%M:%S")
elif date --version 2>/dev/null | grep -q "GNU"; then
    # Linux with GNU date
    RUN_TIME=$(date -d "+${MINUTES} minutes" +"%H:%M:%S")
else
    # macOS with BSD date
    RUN_TIME=$(date -v +${MINUTES}M +"%H:%M:%S" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "Error: Unable to calculate future time. Date command failed." >&2
        exit 1
    fi
fi

# Use nohup to completely detach the sleep process
# Use shell arithmetic instead of bc
SECONDS=$((MINUTES * 60))

# Create the check command - simplified without claude_control.py
CHECK_COMMAND="Time for orchestrator check! cat \"$NOTE_FILE\" && echo 'Please review the scheduled note above.'"

# Schedule the command
nohup bash -c "sleep $SECONDS && tmux send-keys -t '$TARGET' \"$CHECK_COMMAND\" && sleep 1 && tmux send-keys -t '$TARGET' Enter" > /dev/null 2>&1 &

# Get the PID of the background process
SCHEDULE_PID=$!

echo "Scheduled successfully - process detached (PID: $SCHEDULE_PID)"
echo "SCHEDULED TO RUN AT: $RUN_TIME (in $MINUTES minutes from $CURRENT_TIME)"