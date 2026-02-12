#!/bin/bash
# Evaluate social media posts through the peripheral engine before publishing.
# Runs each post through peripheral-llm.py and saves results.
#
# Usage: ./scripts/campaign/evaluate-posts.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
PERIPHERAL_SCRIPT="$REPO_DIR/scripts/peripheral-llm.py"
CAMPAIGN_FILE="$SCRIPT_DIR/social-posts.md"
RESULTS_DIR="$SCRIPT_DIR/eval-results"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$RESULTS_DIR"

echo "Evaluating social media posts through 7 peripheral personas..."
echo "============================================================"

# Extract LinkedIn post
LINKEDIN_POST=$(awk '/^## LinkedIn Post/,/^---$/' "$CAMPAIGN_FILE" | tail -n +3 | head -n -1)

# Extract X single post
X_POST=$(awk '/^## X Post \(Single\)/,/^---$/' "$CAMPAIGN_FILE" | tail -n +3 | head -n -1)

# Extract X thread
X_THREAD=$(awk '/^## X Thread/,/^---$/' "$CAMPAIGN_FILE" | tail -n +3 | head -n -1)

# Extract TikTok script
TIKTOK_SCRIPT=$(awk '/^## TikTok/,/^---$/' "$CAMPAIGN_FILE" | tail -n +3 | head -n -1)

# Evaluate each post
echo ""
echo "=== LINKEDIN POST ==="
python3 "$PERIPHERAL_SCRIPT" post "$LINKEDIN_POST" 2>&1 | tee "$RESULTS_DIR/linkedin-$TIMESTAMP.txt"

echo ""
echo "=== X POST ==="
python3 "$PERIPHERAL_SCRIPT" post "$X_POST" 2>&1 | tee "$RESULTS_DIR/x-post-$TIMESTAMP.txt"

echo ""
echo "=== X THREAD ==="
python3 "$PERIPHERAL_SCRIPT" post "$X_THREAD" 2>&1 | tee "$RESULTS_DIR/x-thread-$TIMESTAMP.txt"

echo ""
echo "=== TIKTOK SCRIPT ==="
python3 "$PERIPHERAL_SCRIPT" post "$TIKTOK_SCRIPT" 2>&1 | tee "$RESULTS_DIR/tiktok-$TIMESTAMP.txt"

echo ""
echo "============================================================"
echo "All evaluations saved to: $RESULTS_DIR"
echo "Review results and iterate on posts that score below 60% intent."
