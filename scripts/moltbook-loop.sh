#!/bin/bash
# moltbook-loop.sh — Eywa's Moltbook self-improvement loop.
# Monitors agent discussions, extracts signal, posts content, measures engagement.
# Feeds insights back to Eywa's knowledge base and task queue.
#
# Usage: bash scripts/moltbook-loop.sh
# Runs one cycle. Set up as cron or OpenClaw heartbeat for continuous operation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
CREDS_FILE="/Users/armand/Documents/eywa-private/.moltbook-credentials"
DATA_DIR="$SCRIPT_DIR/moltbook-data"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DATA_DIR"

# Load credentials
if [ ! -f "$CREDS_FILE" ]; then
  echo "ERROR: No credentials file at $CREDS_FILE"
  exit 1
fi
source "$CREDS_FILE"

MOLTBOOK_API="https://www.moltbook.com/api/v1"
MOLTBOOK_POSTS_API="https://www.moltbook.com/api/v1/posts"
EYWA_CALL="$REPO_DIR/packages/openclaw-skill/eywa-call.sh"

echo "=== Eywa Moltbook Loop: $TIMESTAMP ==="

# ─── 1. CHECK AGENT STATUS ─────────────────────────────────────────
echo ""
echo "--- Checking agent status ---"
STATUS=$(curl -s "$MOLTBOOK_API/agents/status" \
  -H "Authorization: Bearer $MOLTBOOK_API_KEY" 2>&1)
echo "$STATUS" | python3 -m json.tool 2>/dev/null || echo "$STATUS"

# Check if claimed
IS_CLAIMED=$(echo "$STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('agent',{}).get('status','unknown'))" 2>/dev/null || echo "unknown")
if [ "$IS_CLAIMED" != "claimed" ] && [ "$IS_CLAIMED" != "active" ]; then
  echo "Agent not yet claimed (status: $IS_CLAIMED). Skipping post cycle."
  echo "Claim URL: $MOLTBOOK_CLAIM_URL"
  echo "Still monitoring..."
fi

# ─── 2. MONITOR: FETCH TOP POSTS ───────────────────────────────────
echo ""
echo "--- Fetching top posts ---"

# Fetch from multiple submolts in parallel
curl -s "$MOLTBOOK_POSTS_API?sort=top&limit=20" > "$DATA_DIR/all-top-$TIMESTAMP.json" 2>&1 &
curl -s "$MOLTBOOK_POSTS_API?sort=new&limit=20" > "$DATA_DIR/all-new-$TIMESTAMP.json" 2>&1 &
wait

# Extract coordination/memory-related posts
echo ""
echo "--- Signal: coordination & memory discussions ---"
for file in "$DATA_DIR/all-top-$TIMESTAMP.json" "$DATA_DIR/all-new-$TIMESTAMP.json"; do
  python3 -c "
import json, sys
try:
    data = json.load(open('$file'))
    posts = data.get('posts', [])
    keywords = ['memory', 'context', 'coordinate', 'coordination', 'agent', 'swarm', 'duplicate',
                'conflict', 'lost', 'forget', 'amnesia', 'compress', 'session', 'persist',
                'orchestrat', 'observ', 'visibility', 'align', 'diverge', 'navigation']
    for p in posts:
        text = (p.get('title','') + ' ' + p.get('content','')).lower()
        matches = [k for k in keywords if k in text]
        if matches:
            print(f\"[{p.get('upvotes',0)}↑] {p.get('title','untitled')}\")
            print(f\"  Matches: {', '.join(matches)}\")
            print(f\"  Comments: {p.get('comment_count',0)}\")
            print()
except: pass
" 2>/dev/null
done

# ─── 3. ANALYZE: EXTRACT PAIN POINTS ───────────────────────────────
echo ""
echo "--- Extracting pain points ---"
python3 -c "
import json, sys
pain_keywords = ['problem', 'issue', 'broken', 'fix', 'need', 'wish', 'want', 'struggle',
                 'frustrated', 'pain', 'annoying', 'missing', 'fail', 'error', 'bug', 'crash']
try:
    data = json.load(open('$DATA_DIR/all-top-$TIMESTAMP.json'))
    posts = data.get('posts', [])
    pains = []
    for p in posts:
        text = (p.get('title','') + ' ' + p.get('content','')).lower()
        matches = [k for k in pain_keywords if k in text]
        if matches and p.get('upvotes',0) > 10:
            pains.append({
                'title': p.get('title',''),
                'upvotes': p.get('upvotes',0),
                'comments': p.get('comment_count',0),
                'matches': matches
            })
    pains.sort(key=lambda x: x['upvotes'], reverse=True)
    for p in pains[:5]:
        print(f\"[{p['upvotes']}↑ {p['comments']}💬] {p['title']}\")
        print(f\"  Signals: {', '.join(p['matches'])}\")
        print()
except: pass
" 2>/dev/null

# ─── 4. STORE INSIGHTS IN EYWA ─────────────────────────────────────
echo ""
echo "--- Storing insights in Eywa ---"

# Create a summary of what we found
SUMMARY=$(python3 -c "
import json
try:
    data = json.load(open('$DATA_DIR/all-top-$TIMESTAMP.json'))
    posts = data.get('posts', [])
    total = len(posts)
    total_upvotes = sum(p.get('upvotes',0) for p in posts)
    total_comments = sum(p.get('comment_count',0) for p in posts)

    coord_posts = [p for p in posts if any(k in (p.get('title','')+p.get('content','')).lower()
                   for k in ['memory','context','coordinate','agent','swarm','duplicate'])]
    coord_upvotes = sum(p.get('upvotes',0) for p in coord_posts)

    print(f'Moltbook scan {\"$TIMESTAMP\"}: {total} top posts, {total_upvotes} total upvotes, {total_comments} comments. {len(coord_posts)} posts about coordination/memory ({coord_upvotes} upvotes). Top themes: ', end='')
    # Get top 3 post titles
    sorted_posts = sorted(posts, key=lambda x: x.get('upvotes',0), reverse=True)
    titles = [p.get('title','?')[:60] for p in sorted_posts[:3]]
    print('; '.join(titles))
except Exception as e:
    print(f'Moltbook scan {\"$TIMESTAMP\"}: error parsing - {e}')
" 2>/dev/null)

if [ -n "$SUMMARY" ]; then
  bash "$EYWA_CALL" eywa_learn "{\"content\":\"$SUMMARY\",\"tags\":[\"moltbook\",\"market-signal\"],\"title\":\"Moltbook scan $TIMESTAMP\"}" 2>/dev/null || true
  echo "Stored: $SUMMARY"
fi

echo ""
echo "=== Moltbook loop complete ==="
echo "Data: $DATA_DIR/"
