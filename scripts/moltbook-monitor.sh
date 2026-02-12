#!/bin/bash
# moltbook-monitor.sh — Fetch Moltbook posts, analyze agent behavior, seed Eywa tasks.
# Monitors what 2.6M AI agents discuss and extracts signal for Eywa's development.
#
# Usage: bash scripts/moltbook-monitor.sh [submolt]
# Example: bash scripts/moltbook-monitor.sh tooling-and-prompts

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
SUBMOLT="${1:-}"
OUTPUT_DIR="$SCRIPT_DIR/moltbook-data"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$OUTPUT_DIR"

# Fetch posts from Moltbook API
if [ -n "$SUBMOLT" ]; then
  URL="https://moltbookai.net/api/posts?submolt=${SUBMOLT}&sort=top&limit=50"
else
  URL="https://moltbookai.net/api/posts?sort=top&limit=50"
fi

echo "Fetching posts from Moltbook..."
POSTS=$(curl -s "$URL" 2>&1)

# Save raw data
echo "$POSTS" > "$OUTPUT_DIR/posts-${TIMESTAMP}.json"

# Extract readable summary
if command -v jq &>/dev/null; then
  echo "$POSTS" | jq -r '
    .posts[]? |
    "[\(.upvotes)↑ \(.downvotes)↓ \(.comment_count) comments] \(.title // "untitled")
    submolt: \(.submolt.display_name // "general")
    ---"
  ' > "$OUTPUT_DIR/summary-${TIMESTAMP}.txt" 2>/dev/null || true
fi

# Search for coordination/memory/agent-related posts
echo ""
echo "=== Posts mentioning coordination, memory, or agents ==="
echo "$POSTS" | jq -r '
  .posts[]? |
  select(
    (.title // "" | test("memory|context|coordination|agent|swarm|multi|orchestr|observ|duplicate|conflict"; "i")) or
    (.content // "" | test("memory|context|coordination|agent|swarm|multi|orchestr|observ|duplicate|conflict"; "i"))
  ) |
  "[\(.upvotes)↑] \(.title // "untitled")
  \(.content // "" | .[0:200])
  ---"
' 2>/dev/null || echo "(no matching posts found)"

echo ""
echo "=== Pain points agents express ==="
echo "$POSTS" | jq -r '
  .posts[]? |
  select(
    (.title // "" | test("pain|problem|issue|broken|fix|need|wish|want|struggle|frustrated|annoy"; "i")) or
    (.content // "" | test("pain|problem|issue|broken|fix|need|wish|want|struggle|frustrated|annoy"; "i"))
  ) |
  "[\(.upvotes)↑] \(.title // "untitled")
  \(.content // "" | .[0:200])
  ---"
' 2>/dev/null || echo "(no matching posts found)"

echo ""
echo "Data saved to $OUTPUT_DIR/"
echo "Posts: posts-${TIMESTAMP}.json"
echo "Summary: summary-${TIMESTAMP}.txt"
