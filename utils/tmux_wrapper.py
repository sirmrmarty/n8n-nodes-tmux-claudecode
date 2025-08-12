#!/usr/bin/env python3

import sys
import json
import os
import subprocess
import argparse

# Dynamically resolve the path to tmux_utils
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(script_dir)
sys.path.insert(0, parent_dir)
from scripts.tmux_utils import TmuxOrchestrator

class PersistentTmuxWrapper:
    def __init__(self):
        self.orchestrator = TmuxOrchestrator()
        self.orchestrator.safety_mode = False  # Disable interactive confirmations

    def handle_request(self, request):
        """Handle a single JSON-RPC style request"""
        try:
            method = request.get('method')
            args = request.get('args', [])
            request_id = request.get('id')

            # Special method for health checks
            if method == 'ping':
                result = 'pong'
            elif method == 'get_tmux_sessions':
                sessions = self.orchestrator.get_tmux_sessions()
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
            elif method == 'capture_window_content':
                if len(args) < 2:
                    raise ValueError("Missing arguments for capture_window_content")
                session_name = args[0]
                window_index = args[1]
                num_lines = args[2] if len(args) > 2 else 50
                result = self.orchestrator.capture_window_content(session_name, window_index, num_lines)
            elif method == 'get_window_info':
                if len(args) < 2:
                    raise ValueError("Missing arguments for get_window_info")
                session_name = args[0]
                window_index = args[1]
                result = self.orchestrator.get_window_info(session_name, window_index)
            elif method == 'send_keys_to_window':
                if len(args) < 3:
                    raise ValueError("Missing arguments for send_keys_to_window")
                session_name = args[0]
                window_index = args[1]
                keys = args[2]
                confirm = args[3] if len(args) > 3 else False
                result = self.orchestrator.send_keys_to_window(session_name, window_index, keys, confirm)
            elif method == 'send_command_to_window':
                if len(args) < 3:
                    raise ValueError("Missing arguments for send_command_to_window")
                session_name = args[0]
                window_index = args[1]
                command = args[2]
                confirm = args[3] if len(args) > 3 else False
                
                # Handle STATUS REQUEST commands by converting them to proper status responses
                if command.startswith('STATUS REQUEST:'):
                    result = self.orchestrator.handle_status_request(session_name, window_index, command)
                else:
                    result = self.orchestrator.send_command_to_window(session_name, window_index, command, confirm)
            elif method == 'get_all_windows_status':
                result = self.orchestrator.get_all_windows_status()
            elif method == 'find_window_by_name':
                if len(args) < 1:
                    raise ValueError("Missing window name argument")
                window_name = args[0]
                result = self.orchestrator.find_window_by_name(window_name)
            elif method == 'create_monitoring_snapshot':
                result = self.orchestrator.create_monitoring_snapshot()
            else:
                raise ValueError(f"Unknown method: {method}")

            return {
                'id': request_id,
                'result': result
            }

        except Exception as e:
            return {
                'id': request.get('id'),
                'error': str(e)
            }

    def run_persistent(self):
        """Run in persistent mode, handling JSON-RPC requests over stdin/stdout"""
        try:
            while True:
                try:
                    # Read line from stdin
                    line = sys.stdin.readline()
                    if not line:
                        break  # EOF reached
                    
                    line = line.strip()
                    if not line:
                        continue  # Skip empty lines
                    
                    # Parse JSON request
                    request = json.loads(line)
                    
                    # Handle request
                    response = self.handle_request(request)
                    
                    # Send response
                    print(json.dumps(response))
                    sys.stdout.flush()
                    
                except json.JSONDecodeError as e:
                    error_response = {
                        'id': None,
                        'error': f'Invalid JSON request: {str(e)}'
                    }
                    print(json.dumps(error_response))
                    sys.stdout.flush()
                except Exception as e:
                    error_response = {
                        'id': None,
                        'error': f'Request handling error: {str(e)}'
                    }
                    print(json.dumps(error_response))
                    sys.stdout.flush()
                    
        except KeyboardInterrupt:
            sys.exit(0)
        except Exception as e:
            error_response = {
                'id': None,
                'error': f'Persistent mode error: {str(e)}'
            }
            print(json.dumps(error_response))
            sys.exit(1)

    def run_legacy(self, method, args):
        """Run in legacy mode for backward compatibility"""
        request = {
            'id': 'legacy',
            'method': method,
            'args': args
        }
        
        response = self.handle_request(request)
        
        if 'error' in response:
            print(json.dumps({"error": response['error']}))
            sys.exit(1)
        else:
            print(json.dumps(response['result']))

def main():
    parser = argparse.ArgumentParser(description='Tmux Wrapper for Node.js Bridge')
    parser.add_argument('--persistent', action='store_true', 
                        help='Run in persistent mode for connection pooling')
    parser.add_argument('method', nargs='?', 
                        help='Method to execute (for legacy mode)')
    parser.add_argument('args', nargs='*', 
                        help='Arguments for the method')
    
    args = parser.parse_args()
    wrapper = PersistentTmuxWrapper()
    
    if args.persistent:
        # Run in persistent mode for connection pooling
        wrapper.run_persistent()
    else:
        # Legacy mode for backward compatibility
        if not args.method:
            print(json.dumps({"error": "No method specified"}))
            sys.exit(1)
        
        method = args.method
        method_args = []
        
        # Parse arguments
        for arg in args.args:
            try:
                method_args.append(json.loads(arg))
            except json.JSONDecodeError:
                method_args.append(arg)
        
        wrapper.run_legacy(method, method_args)

if __name__ == "__main__":
    main()