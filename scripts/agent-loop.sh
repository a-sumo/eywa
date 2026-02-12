#!/bin/bash
# Spawn a headless Claude Code agent that picks up Eywa tasks and ships them.
#
# Usage:
#   ./scripts/agent-loop.sh              # pick highest priority open task
#   ./scripts/agent-loop.sh <task_id>    # work on a specific task

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
TASK_ID="${1:-}"
RUN_DIR="$SCRIPT_DIR/agent-runs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$RUN_DIR/$TIMESTAMP.log"

mkdir -p "$RUN_DIR"

# Build the user prompt
PROMPT="You are an autonomous Eywa agent. Your job is to pick up tasks from the Eywa task queue and ship them."
if [ -n "$TASK_ID" ]; then
  PROMPT="$PROMPT Work on task ID: $TASK_ID"
fi

cd "$REPO_DIR"

# Pass system prompt via file descriptor to avoid shell escaping issues
claude -p "$PROMPT" \
  --dangerously-skip-permissions \
  --append-system-prompt "$(cat "$SCRIPT_DIR/agent-prompt.md")" \
  --mcp-config "$SCRIPT_DIR/seed-mcp.json" \
  --max-turns 50 \
  --output-format stream-json \
  --verbose \
  2>&1 | tee "$LOG_FILE"
