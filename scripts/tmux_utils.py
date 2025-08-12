#!/usr/bin/env python3

import subprocess
import json
import time
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

@dataclass
class TmuxWindow:
    session_name: str
    window_index: int
    window_name: str
    active: bool
    
@dataclass
class TmuxSession:
    name: str
    windows: List[TmuxWindow]
    attached: bool

class TmuxOrchestrator:
    def __init__(self):
        self.safety_mode = True
        self.max_lines_capture = 1000
        
    def get_tmux_sessions(self) -> List[TmuxSession]:
        """Get all tmux sessions and their windows"""
        try:
            # Get sessions
            sessions_cmd = ["tmux", "list-sessions", "-F", "#{session_name}:#{session_attached}"]
            sessions_result = subprocess.run(sessions_cmd, capture_output=True, text=True, check=True)
            
            sessions = []
            for line in sessions_result.stdout.strip().split('\n'):
                if not line:
                    continue
                session_name, attached = line.split(':')
                
                # Get windows for this session
                windows_cmd = ["tmux", "list-windows", "-t", session_name, "-F", "#{window_index}:#{window_name}:#{window_active}"]
                windows_result = subprocess.run(windows_cmd, capture_output=True, text=True, check=True)
                
                windows = []
                for window_line in windows_result.stdout.strip().split('\n'):
                    if not window_line:
                        continue
                    window_index, window_name, window_active = window_line.split(':')
                    windows.append(TmuxWindow(
                        session_name=session_name,
                        window_index=int(window_index),
                        window_name=window_name,
                        active=window_active == '1'
                    ))
                
                sessions.append(TmuxSession(
                    name=session_name,
                    windows=windows,
                    attached=attached == '1'
                ))
            
            return sessions
        except subprocess.CalledProcessError as e:
            print(f"Error getting tmux sessions: {e}")
            return []
    
    def capture_window_content(self, session_name: str, window_index: int, num_lines: int = 50) -> str:
        """Safely capture the last N lines from a tmux window"""
        # Validate inputs
        if not session_name or not isinstance(window_index, int) or window_index < 0:
            return f"Error: Invalid session name or window index: {session_name}:{window_index}"
            
        if num_lines <= 0:
            return "Error: Number of lines must be positive"
            
        if num_lines > self.max_lines_capture:
            num_lines = self.max_lines_capture
            print(f"Warning: Limiting capture to {self.max_lines_capture} lines")
            
        target = f"{session_name}:{window_index}"
        try:
            # First check if target exists
            check_cmd = ["tmux", "list-panes", "-t", target]
            subprocess.run(check_cmd, capture_output=True, check=True)
            
            # Capture the content
            cmd = ["tmux", "capture-pane", "-t", target, "-p", "-S", f"-{num_lines}"]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return result.stdout
        except subprocess.CalledProcessError as e:
            error_msg = f"Error capturing content from {target}: {e}"
            if e.stderr:
                error_msg += f"\nDetails: {e.stderr}"
            return error_msg
    
    def get_window_info(self, session_name: str, window_index: int) -> Dict:
        """Get detailed information about a specific window"""
        try:
            cmd = ["tmux", "display-message", "-t", f"{session_name}:{window_index}", "-p", 
                   "#{window_name}:#{window_active}:#{window_panes}:#{window_layout}"]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            if result.stdout.strip():
                parts = result.stdout.strip().split(':')
                return {
                    "name": parts[0],
                    "active": parts[1] == '1',
                    "panes": int(parts[2]),
                    "layout": parts[3],
                    "content": self.capture_window_content(session_name, window_index)
                }
        except subprocess.CalledProcessError as e:
            return {"error": f"Could not get window info: {e}"}
    
    def send_keys_to_window(self, session_name: str, window_index: int, keys: str, confirm: bool = True) -> bool:
        """Safely send keys to a tmux window with confirmation"""
        # Validate inputs
        if not session_name or not isinstance(window_index, int) or window_index < 0:
            print(f"Error: Invalid session name or window index: {session_name}:{window_index}")
            return False
            
        if not keys:
            print("Error: Cannot send empty keys")
            return False
            
        # Check if target exists
        target = f"{session_name}:{window_index}"
        check_cmd = ["tmux", "list-panes", "-t", target]
        try:
            subprocess.run(check_cmd, capture_output=True, check=True)
        except subprocess.CalledProcessError:
            print(f"Error: Tmux target '{target}' does not exist")
            return False
            
        if self.safety_mode and confirm:
            print(f"SAFETY CHECK: About to send '{keys}' to {target}")
            response = input("Confirm? (yes/no): ")
            if response.lower() != 'yes':
                print("Operation cancelled")
                return False
        
        try:
            cmd = ["tmux", "send-keys", "-t", target, keys]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return True
        except subprocess.CalledProcessError as e:
            print(f"Error sending keys to {target}: {e}")
            if e.stderr:
                print(f"Details: {e.stderr}")
            return False
    
    def send_command_to_window(self, session_name: str, window_index: int, command: str, confirm: bool = True) -> bool:
        """Send a command to a window (adds Enter automatically)"""
        # Validate command
        if not command:
            print("Error: Cannot send empty command")
            return False
            
        # First send the command text
        if not self.send_keys_to_window(session_name, window_index, command, confirm):
            return False
            
        # Then send the actual Enter key (C-m)
        target = f"{session_name}:{window_index}"
        try:
            cmd = ["tmux", "send-keys", "-t", target, "C-m"]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return True
        except subprocess.CalledProcessError as e:
            print(f"Error sending Enter key to {target}: {e}")
            if e.stderr:
                print(f"Details: {e.stderr}")
            return False
    
    def get_all_windows_status(self) -> Dict:
        """Get status of all windows across all sessions"""
        sessions = self.get_tmux_sessions()
        status = {
            "timestamp": datetime.now().isoformat(),
            "sessions": []
        }
        
        for session in sessions:
            session_data = {
                "name": session.name,
                "attached": session.attached,
                "windows": []
            }
            
            for window in session.windows:
                window_info = self.get_window_info(session.name, window.window_index)
                window_data = {
                    "index": window.window_index,
                    "name": window.window_name,
                    "active": window.active,
                    "info": window_info
                }
                session_data["windows"].append(window_data)
            
            status["sessions"].append(session_data)
        
        return status
    
    def find_window_by_name(self, window_name: str) -> List[Tuple[str, int]]:
        """Find windows by name across all sessions"""
        sessions = self.get_tmux_sessions()
        matches = []
        
        for session in sessions:
            for window in session.windows:
                if window_name.lower() in window.window_name.lower():
                    matches.append((session.name, window.window_index))
        
        return matches
    
    def create_monitoring_snapshot(self) -> str:
        """Create a comprehensive snapshot for Claude analysis"""
        status = self.get_all_windows_status()
        
        # Format for Claude consumption
        snapshot = f"Tmux Monitoring Snapshot - {status['timestamp']}\n"
        snapshot += "=" * 50 + "\n\n"
        
        for session in status['sessions']:
            snapshot += f"Session: {session['name']} ({'ATTACHED' if session['attached'] else 'DETACHED'})\n"
            snapshot += "-" * 30 + "\n"
            
            for window in session['windows']:
                snapshot += f"  Window {window['index']}: {window['name']}"
                if window['active']:
                    snapshot += " (ACTIVE)"
                snapshot += "\n"
                
                if 'content' in window['info']:
                    # Get last 10 lines for overview
                    content_lines = window['info']['content'].split('\n')
                    recent_lines = content_lines[-10:] if len(content_lines) > 10 else content_lines
                    snapshot += "    Recent output:\n"
                    for line in recent_lines:
                        if line.strip():
                            snapshot += f"    | {line}\n"
                snapshot += "\n"
        
        return snapshot
    
    def handle_status_request(self, session_name: str, window_index: int, request: str) -> bool:
        """Handle STATUS REQUEST commands by providing appropriate responses"""
        try:
            # Determine role based on window name/index
            sessions = self.get_tmux_sessions()
            session = next((s for s in sessions if s.name == session_name), None)
            if not session:
                return False
                
            window = next((w for w in session.windows if w.window_index == window_index), None)
            if not window:
                return False
            
            # Create status response based on window role
            role = self._detect_window_role(window.window_name, window_index)
            status_response = self._generate_status_response(role, session_name, window_index)
            
            # Send the status response to the window
            target = f"{session_name}:{window_index}"
            cmd = ["tmux", "send-keys", "-t", target, "C-c"]  # Cancel current input
            subprocess.run(cmd, capture_output=True, text=True)
            
            # Send the actual status
            cmd = ["tmux", "send-keys", "-t", target, f"echo '{status_response}'", "C-m"]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return True
            
        except subprocess.CalledProcessError as e:
            print(f"Error handling status request: {e}")
            return False
    
    def _detect_window_role(self, window_name: str, window_index: int) -> str:
        """Detect the role of a window based on its name and index"""
        name_lower = window_name.lower()
        
        if 'project' in name_lower or 'manager' in name_lower or window_index == 0:
            return 'project-manager'
        elif 'qa' in name_lower or 'test' in name_lower or window_index == 1:
            return 'qa-engineer'
        elif 'dev' in name_lower or 'code' in name_lower or window_index == 2:
            return 'developer'
        else:
            return 'developer'  # Default to developer
    
    def _generate_status_response(self, role: str, session_name: str, window_index: int) -> str:
        """Generate appropriate status response based on role"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        if role == 'project-manager':
            return f"[{timestamp}] PROJECT STATUS: Coordinating team activities. Monitoring QA and development progress. Ready to assist with project management tasks."
        elif role == 'qa-engineer':
            return f"[{timestamp}] QA STATUS: Systems operational. Ready to run tests and validate code quality. Awaiting code submissions for testing."
        elif role == 'developer':
            return f"[{timestamp}] DEVELOPER STATUS: Ready for development tasks. Environment configured. Awaiting project requirements or code assignments."
        else:
            return f"[{timestamp}] AGENT STATUS: Online and ready. Waiting for task assignments."

if __name__ == "__main__":
    try:
        # Check if tmux is available
        subprocess.run(["tmux", "-V"], capture_output=True, check=True)
        
        orchestrator = TmuxOrchestrator()
        status = orchestrator.get_all_windows_status()
        print(json.dumps(status, indent=2))
    except subprocess.CalledProcessError:
        print("Error: tmux is not installed or not accessible")
        print("Please install tmux to use this utility")
        exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        exit(1)