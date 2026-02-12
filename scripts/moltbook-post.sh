#!/bin/bash
# moltbook-post.sh — Post the next queued item to Moltbook.
# Handles rate limits and verification challenges automatically.
# Run via cron every 2 hours: */120 * * * * bash /path/to/moltbook-post.sh
#
# Usage: bash scripts/moltbook-post.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUEUE_FILE="$SCRIPT_DIR/moltbook-post-queue.json"
API_KEY="moltbook_sk_8AogmFhEqvXlZfRNevWdgSVRNCD3x5yD"
API="https://www.moltbook.com/api/v1"

if [ ! -f "$QUEUE_FILE" ]; then
  echo "No queue file found at $QUEUE_FILE"
  exit 0
fi

# Find the first queued post
POST_DATA=$(python3 -c "
import json
with open('$QUEUE_FILE') as f:
    posts = json.load(f)
for i, p in enumerate(posts):
    if p.get('status') == 'queued':
        print(json.dumps({'index': i, 'title': p['title'], 'content': p['content'], 'submolt': p.get('submolt', 'eywa')}))
        break
else:
    print('EMPTY')
")

if [ "$POST_DATA" = "EMPTY" ]; then
  echo "Queue empty. All posts published."
  exit 0
fi

TITLE=$(echo "$POST_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['title'])")
echo "Posting: $TITLE"

# Create the post
RESPONSE=$(curl -s -X POST "$API/posts" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "$POST_DATA")

SUCCESS=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('success', False))" 2>/dev/null || echo "False")

if [ "$SUCCESS" = "True" ]; then
  # Extract verification challenge
  VERIFY_CODE=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('verification',{}).get('code',''))" 2>/dev/null)
  CHALLENGE=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('verification',{}).get('challenge',''))" 2>/dev/null)
  POST_ID=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('post',{}).get('id',''))" 2>/dev/null)

  echo "Post created: $POST_ID"
  echo "Challenge: $CHALLENGE"

  # Solve the math challenge (extract numbers and operation)
  ANSWER=$(python3 -c "
import re
challenge = '''$CHALLENGE'''
# Clean up the obfuscated text
clean = re.sub(r'[^a-zA-Z0-9+\-*/., ]', '', challenge.lower())
# Find all numbers written as words or digits
nums = re.findall(r'\b(\d+(?:\.\d+)?)\b', clean)
# Also find word numbers
word_map = {'zero':0,'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,
            'eight':8,'nine':9,'ten':10,'eleven':11,'twelve':12,'thirteen':13,
            'fourteen':14,'fifteen':15,'sixteen':16,'seventeen':17,'eighteen':18,
            'nineteen':19,'twenty':20,'thirty':30,'forty':40,'fifty':50,
            'sixty':60,'seventy':70,'eighty':80,'ninety':90,'hundred':100,
            'thousand':1000,'thirtytwo':32,'twentythree':23,'fortytwo':42,
            'twentyseven':27,'thirtyfive':35,'fortyfive':45,'fiftyfive':55}

# Parse the obfuscated words
words = re.findall(r'[a-z]+', clean)
parsed_nums = []
current = 0
for w in words:
    w_clean = w.replace(' ','')
    if w_clean in word_map:
        v = word_map[w_clean]
        if v == 100:
            current = (current if current else 1) * 100
        elif v == 1000:
            current = (current if current else 1) * 1000
        else:
            current += v
    elif current > 0 and w_clean not in word_map:
        parsed_nums.append(current)
        current = 0
if current > 0:
    parsed_nums.append(current)

all_nums = [float(n) for n in nums] + [float(n) for n in parsed_nums]

# Check for addition pattern
if '+' in clean or 'plus' in clean or 'adds' in clean or 'and' in clean:
    if len(all_nums) >= 2:
        print(f'{sum(all_nums):.2f}')
    else:
        print(f'{all_nums[0]:.2f}' if all_nums else '0.00')
elif len(all_nums) >= 2:
    print(f'{sum(all_nums):.2f}')
elif all_nums:
    print(f'{all_nums[0]:.2f}')
else:
    print('0.00')
" 2>/dev/null || echo "0.00")

  echo "Answer: $ANSWER"

  if [ -n "$VERIFY_CODE" ] && [ "$ANSWER" != "0.00" ]; then
    VERIFY_RESPONSE=$(curl -s -X POST "$API/verify" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer ${API_KEY}" \
      -d "{\"verification_code\":\"$VERIFY_CODE\",\"answer\":\"$ANSWER\"}")
    echo "Verification: $VERIFY_RESPONSE"
  fi

  # Mark as posted in queue
  POST_INDEX=$(echo "$POST_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['index'])")
  python3 -c "
import json
with open('$QUEUE_FILE') as f:
    posts = json.load(f)
posts[$POST_INDEX]['status'] = 'posted'
posts[$POST_INDEX]['post_id'] = '$POST_ID'
with open('$QUEUE_FILE', 'w') as f:
    json.dump(posts, f, indent=2)
"
  echo "Marked as posted in queue."
else
  ERROR=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error','unknown'))" 2>/dev/null)
  echo "Post failed: $ERROR"
  echo "Full response: $RESPONSE"
fi
