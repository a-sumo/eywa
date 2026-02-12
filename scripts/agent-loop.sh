#!/bin/bash
# Spawn a headless Claude Code agent that picks up Eywa tasks and ships them.
# Automatically respawns on exit so the next session picks up via baton passing.
#
# Usage:
#   ./scripts/agent-loop.sh              # pick highest priority open task
#   ./scripts/agent-loop.sh <task_id>    # work on a specific task
#   MAX_RESPAWNS=10 ./scripts/agent-loop.sh   # override respawn limit

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
TASK_ID="${1:-}"
RUN_DIR="$SCRIPT_DIR/agent-runs"
MAX_RESPAWNS="${MAX_RESPAWNS:-10}"

mkdir -p "$RUN_DIR"

cd "$REPO_DIR"

BASE_PROMPT="You are an autonomous Eywa agent. Your job is to pick up tasks from the Eywa task queue and ship them."
if [ -n "$TASK_ID" ]; then
  BASE_PROMPT="$BASE_PROMPT Work on task ID: $TASK_ID"
fi

SPAWN=0
BATON=""

while [ "$SPAWN" -lt "$MAX_RESPAWNS" ]; do
  SPAWN=$((SPAWN + 1))
  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  LOG_FILE="$RUN_DIR/$TIMESTAMP.log"

  echo "=== Seed session $SPAWN/$MAX_RESPAWNS starting at $(date) ==="

  # Build prompt with baton and handoff context from previous session
  PROMPT="$BASE_PROMPT"
  if [ -n "$BATON" ]; then
    PROMPT="$PROMPT Continue from previous agent: $BATON (use eywa_start with continue_from to pick up their state)."
  fi

  # Find the most recent handoff file and include its contents
  LATEST_HANDOFF=$(ls -t "$RUN_DIR"/handoff-*.md 2>/dev/null | head -1)
  if [ -n "$LATEST_HANDOFF" ]; then
    HANDOFF_CONTENT=$(cat "$LATEST_HANDOFF")
    PROMPT="$PROMPT

Previous session handoff notes:
$HANDOFF_CONTENT"
    echo "=== Loaded handoff from $LATEST_HANDOFF ==="
  fi

  # Run the agent. Output goes to log file, visibility comes from Eywa dashboard.
  set +e
  claude -p "$PROMPT" \
    --dangerously-skip-permissions \
    --append-system-prompt "$(cat "$SCRIPT_DIR/agent-prompt.md")" \
    --mcp-config "$SCRIPT_DIR/seed-mcp.json" \
    --max-turns 50 \
    --output-format text \
    > "$LOG_FILE" 2>&1
  EXIT_CODE=$?
  set -e

  echo "=== Seed session $SPAWN exited with code $EXIT_CODE at $(date) ==="

  # Extract agent name from the log for baton passing.
  # The MCP server assigns names like "autonomous/mossy-fern" which appear in tool results.
  # Look for the pattern in eywa_start or eywa_log responses.
  # Uses grep -oE (extended regex) for macOS compatibility.
  BATON=$(grep -oE 'autonomous/[a-z]+-[a-z]+' "$LOG_FILE" | head -1 || true)

  if [ -n "$BATON" ]; then
    echo "=== Baton: $BATON ==="
  else
    echo "=== No agent name found in logs, respawning without baton ==="
  fi

  # Brief pause to avoid hammering the API on rapid failures
  if [ "$EXIT_CODE" -ne 0 ]; then
    echo "=== Non-zero exit, waiting 5s before respawn ==="
    sleep 5
  else
    # Normal exit, wait 2s then respawn
    sleep 2
  fi
done

echo "=== Agent loop completed $MAX_RESPAWNS sessions ==="
