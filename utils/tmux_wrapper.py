#!/usr/bin/env python3

import sys
import json
import os
import subprocess

# Add the parent directory to path to import tmux_utils
sys.path.insert(0, '/home/marwim/n8n_claude_tmux')
from tmux_utils import TmuxOrchestrator

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No method specified"}))
        sys.exit(1)
    
    method = sys.argv[1]
    args = []
    
    # Parse arguments
    for i in range(2, len(sys.argv)):
        try:
            args.append(json.loads(sys.argv[i]))
        except json.JSONDecodeError:
            args.append(sys.argv[i])
    
    orchestrator = TmuxOrchestrator()
    orchestrator.safety_mode = False  # Disable interactive confirmations for automation
    
    try:
        if method == 'get_tmux_sessions':
            sessions = orchestrator.get_tmux_sessions()
            result = []
            for session in sessions:
                result.append({
                    'name': session.name,
                    'attached': session.attached,
                    'windows': [
                        {
                            'sessionName': w.session_name,
                            'windowIndex': w.window_index,
                            'windowName': w.window_name,
                            'active': w.active
                        } for w in session.windows
                    ]
                })
            print(json.dumps(result))
            
        elif method == 'capture_window_content':
            if len(args) < 2:
                print(json.dumps({"error": "Missing arguments for capture_window_content"}))
                sys.exit(1)
            session_name = args[0]
            window_index = args[1]
            num_lines = args[2] if len(args) > 2 else 50
            result = orchestrator.capture_window_content(session_name, window_index, num_lines)
            print(json.dumps(result))
            
        elif method == 'get_window_info':
            if len(args) < 2:
                print(json.dumps({"error": "Missing arguments for get_window_info"}))
                sys.exit(1)
            session_name = args[0]
            window_index = args[1]
            result = orchestrator.get_window_info(session_name, window_index)
            print(json.dumps(result))
            
        elif method == 'send_keys_to_window':
            if len(args) < 3:
                print(json.dumps({"error": "Missing arguments for send_keys_to_window"}))
                sys.exit(1)
            session_name = args[0]
            window_index = args[1]
            keys = args[2]
            confirm = args[3] if len(args) > 3 else False
            result = orchestrator.send_keys_to_window(session_name, window_index, keys, confirm)
            print(json.dumps(result))
            
        elif method == 'send_command_to_window':
            if len(args) < 3:
                print(json.dumps({"error": "Missing arguments for send_command_to_window"}))
                sys.exit(1)
            session_name = args[0]
            window_index = args[1]
            command = args[2]
            confirm = args[3] if len(args) > 3 else False
            result = orchestrator.send_command_to_window(session_name, window_index, command, confirm)
            print(json.dumps(result))
            
        elif method == 'get_all_windows_status':
            result = orchestrator.get_all_windows_status()
            print(json.dumps(result))
            
        elif method == 'find_window_by_name':
            if len(args) < 1:
                print(json.dumps({"error": "Missing window name argument"}))
                sys.exit(1)
            window_name = args[0]
            result = orchestrator.find_window_by_name(window_name)
            print(json.dumps(result))
            
        elif method == 'create_monitoring_snapshot':
            result = orchestrator.create_monitoring_snapshot()
            print(json.dumps(result))
            
        else:
            print(json.dumps({"error": f"Unknown method: {method}"}))
            sys.exit(1)
            
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()