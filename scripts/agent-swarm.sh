#!/bin/bash
# Launch multiple seed agents in parallel. Each runs agent-loop.sh independently.
#
# Usage:
#   ./scripts/agent-swarm.sh              # launch 3 seeds (default)
#   ./scripts/agent-swarm.sh 5            # launch 5 seeds
#   SEED_COUNT=5 ./scripts/agent-swarm.sh # same via env var
#
# Each seed gets its own agent-loop.sh process with separate logs.
# SIGINT/SIGTERM kills all child processes cleanly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SEED_COUNT="${1:-${SEED_COUNT:-3}}"
PIDS=()

cleanup() {
  echo ""
  echo "=== Shutting down $SEED_COUNT seeds ==="
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  # Wait for all children to exit
  for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  echo "=== All seeds stopped ==="
}

trap cleanup SIGINT SIGTERM EXIT

echo "=== Launching $SEED_COUNT seed agents ==="

for i in $(seq 1 "$SEED_COUNT"); do
  echo "=== Starting seed $i/$SEED_COUNT ==="
  "$SCRIPT_DIR/agent-loop.sh" &
  PIDS+=($!)
  # Stagger launches by 3s to avoid API rate limits
  if [ "$i" -lt "$SEED_COUNT" ]; then
    sleep 3
  fi
done

echo "=== All $SEED_COUNT seeds launched. PIDs: ${PIDS[*]} ==="
echo "=== Press Ctrl+C to stop all seeds ==="

# Wait for all children
wait
