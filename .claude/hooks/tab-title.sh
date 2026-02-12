#!/bin/bash
# tab-title.sh - Updates terminal tab title with current Claude Code action
# PostToolUse hook: runs after every tool call
#
# Enable via: export EYWA_TAB_TITLE=1
#         or: toggle the button in VS Code (creates ~/.config/eywa/tab-title)

FLAG_FILE="$HOME/.config/eywa/tab-title"
[ "$EYWA_TAB_TITLE" = "1" ] || [ -f "$FLAG_FILE" ] || exit 0

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
[ -z "$TOOL" ] && exit 0

case "$TOOL" in
  Read)
    FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' | xargs basename 2>/dev/null)
    TITLE="Reading $FILE" ;;
  Edit)
    FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' | xargs basename 2>/dev/null)
    TITLE="Editing $FILE" ;;
  Write)
    FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' | xargs basename 2>/dev/null)
    TITLE="Writing $FILE" ;;
  Bash)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' | head -c 50)
    TITLE="$ $CMD" ;;
  Grep)
    PAT=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty' | head -c 30)
    TITLE="Searching: $PAT" ;;
  Glob)
    PAT=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty')
    TITLE="Finding $PAT" ;;
  WebFetch)
    HOST=$(echo "$INPUT" | jq -r '.tool_input.url // empty' | sed 's|https\?://||' | cut -d/ -f1)
    TITLE="Fetching $HOST" ;;
  WebSearch)
    Q=$(echo "$INPUT" | jq -r '.tool_input.query // empty' | head -c 40)
    TITLE="Searching: $Q" ;;
  Task)
    DESC=$(echo "$INPUT" | jq -r '.tool_input.description // empty' | head -c 40)
    TITLE="Agent: $DESC" ;;
  *)
    TITLE="$TOOL" ;;
esac

# Set terminal tab title (suppress errors for non-tty contexts)
{ printf '\033]0;%s\007' "$TITLE" > /dev/tty; } 2>/dev/null

exit 0
