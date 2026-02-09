#!/bin/bash
# Eywa Demo - Voice Clone + TTS Generation
# Reads voiceover text from voiceover.md (blockquotes starting with >)
# Uses ElevenLabs API with eleven_v3 (latest model) + instant voice clone
#
# Prerequisites:
#   export ELEVENLABS_API_KEY="your-key-here"
#   brew install jq ffmpeg python3
#
# Usage:
#   cd web/demo
#   chmod +x generate-voiceover.sh
#   ./generate-voiceover.sh
#
# The script reads voiceover.md and extracts all > blockquote sections
# as separate audio segments. Run refresh-demo.sh to update voiceover.md
# from current app state before generating audio.

set -euo pipefail

API_KEY="${ELEVENLABS_API_KEY:?Set ELEVENLABS_API_KEY environment variable}"
BASE="https://api.elevenlabs.io/v1"
MODEL="eleven_v3"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/generated-audio"
SAMPLES_DIR="$SCRIPT_DIR/voice-samples"
VOICEOVER_MD="$SCRIPT_DIR/voiceover.md"

mkdir -p "$OUTPUT_DIR"

echo ""
echo "=== Eywa Demo Voiceover Generator ==="
echo "Model: $MODEL (ElevenLabs latest)"
echo "Source: $VOICEOVER_MD"
echo ""

# -----------------------------------------------
# Step 1: Parse voiceover.md into segments
# -----------------------------------------------
echo "Step 1: Parsing voiceover.md..."

# Extract segments: each ## heading becomes a segment label,
# and the blockquote (> lines) below it becomes the text.
SEGMENTS=()
LABELS=()

current_label=""
current_text=""
in_quote=false

while IFS= read -r line; do
  # New section heading
  if echo "$line" | grep -q '^## '; then
    # Save previous segment if we have one
    if [ -n "$current_label" ] && [ -n "$current_text" ]; then
      LABELS+=("$current_label")
      SEGMENTS+=("$current_text")
    fi
    # Extract label from heading (e.g., "## [0:00 - 0:20] THE HOOK" -> "hook")
    current_label=$(echo "$line" | sed 's/^## \[.*\] //' | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 30)
    current_text=""
    in_quote=false
  elif echo "$line" | grep -q '^>'; then
    # Blockquote line - extract text after "> "
    quote_text=$(echo "$line" | sed 's/^> *//')
    if [ -n "$current_text" ]; then
      current_text="$current_text $quote_text"
    else
      current_text="$quote_text"
    fi
    in_quote=true
  elif [ "$in_quote" = true ] && [ -z "$line" ]; then
    in_quote=false
  fi
done < "$VOICEOVER_MD"

# Don't forget the last segment
if [ -n "$current_label" ] && [ -n "$current_text" ]; then
  LABELS+=("$current_label")
  SEGMENTS+=("$current_text")
fi

echo "  Found ${#SEGMENTS[@]} segments"
echo ""

# -----------------------------------------------
# Step 2: Clone voice from audio samples
# -----------------------------------------------
echo "Step 2: Setting up voice..."

VOICE_ID=""

# Check if we already have a cloned voice
EXISTING=$(curl -s "$BASE/voices" -H "xi-api-key: $API_KEY" | jq -r '.voices[] | select(.name == "armand-eywa-demo") | .voice_id' 2>/dev/null || echo "")

if [ -n "$EXISTING" ]; then
  echo "  Found existing clone: $EXISTING"
  VOICE_ID="$EXISTING"
else
  echo "  Creating instant voice clone from samples..."

  CLONE_CMD="curl -s -X POST '$BASE/voices/add' -H 'xi-api-key: $API_KEY'"

  for f in "$SAMPLES_DIR"/*.mp3; do
    if [ -f "$f" ]; then
      CLONE_CMD="$CLONE_CMD -F 'files=@$f'"
      echo "    + $(basename "$f")"
    fi
  done

  CLONE_CMD="$CLONE_CMD -F 'name=armand-eywa-demo'"
  CLONE_CMD="$CLONE_CMD -F 'remove_background_noise=true'"
  CLONE_CMD="$CLONE_CMD -F 'description=Eywa demo voiceover'"

  RESULT=$(eval "$CLONE_CMD")
  VOICE_ID=$(echo "$RESULT" | jq -r '.voice_id // empty')

  if [ -z "$VOICE_ID" ]; then
    echo "  ERROR: Voice clone failed."
    echo "  Response: $RESULT"
    exit 1
  fi

  echo "  Voice cloned! ID: $VOICE_ID"
fi

echo ""

# -----------------------------------------------
# Step 3: Generate each voiceover segment
# -----------------------------------------------
echo "Step 3: Generating voiceover segments with $MODEL..."
echo ""

generate_segment() {
  local idx="$1"
  local label="$2"
  local text="$3"
  local outfile="$OUTPUT_DIR/segment_${idx}_${label}.mp3"

  # Always regenerate (refresh pipeline clears old files)
  echo "  [$idx] $label - generating..."

  # Escape text for JSON
  local json_text
  json_text=$(printf '%s' "$text" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')

  HTTP_CODE=$(curl -s -w "%{http_code}" -o "$outfile" \
    -X POST "$BASE/text-to-speech/$VOICE_ID" \
    -H "xi-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": $json_text,
      \"model_id\": \"$MODEL\",
      \"output_format\": \"mp3_44100_128\",
      \"voice_settings\": {
        \"stability\": 0.5,
        \"similarity_boost\": 0.85,
        \"style\": 0.3,
        \"use_speaker_boost\": true,
        \"speed\": 0.95
      }
    }")

  if [ "$HTTP_CODE" != "200" ]; then
    echo "    WARN: Got HTTP $HTTP_CODE for segment $idx"
    cat "$outfile" 2>/dev/null || true
    rm -f "$outfile"
  else
    local duration
    duration=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$outfile" 2>/dev/null || echo "?")
    echo "    Done (${duration}s)"
  fi
}

# Generate all extracted segments
for i in "${!SEGMENTS[@]}"; do
  idx=$(printf "%02d" $((i + 1)))
  generate_segment "$idx" "${LABELS[$i]}" "${SEGMENTS[$i]}"
done

echo ""

# -----------------------------------------------
# Step 4: Concatenate all segments
# -----------------------------------------------
echo "Step 4: Concatenating segments into final voiceover..."

# Build ffmpeg concat file
CONCAT_FILE="$OUTPUT_DIR/concat.txt"
: > "$CONCAT_FILE"

# Add 1 second silence at start
ffmpeg -y -f lavfi -i anullsrc=channel_layout=mono:sample_rate=44100 -t 1.0 "$OUTPUT_DIR/silence_1s.mp3" 2>/dev/null
echo "file 'silence_1s.mp3'" >> "$CONCAT_FILE"

# Add 0.6s silence between segments (natural pause)
ffmpeg -y -f lavfi -i anullsrc=channel_layout=mono:sample_rate=44100 -t 0.6 "$OUTPUT_DIR/silence_pause.mp3" 2>/dev/null

for f in "$OUTPUT_DIR"/segment_*.mp3; do
  if [ -f "$f" ]; then
    echo "file '$(basename "$f")'" >> "$CONCAT_FILE"
    echo "file 'silence_pause.mp3'" >> "$CONCAT_FILE"
  fi
done

# Final file
FINAL="$OUTPUT_DIR/voiceover-full.mp3"
ffmpeg -y -f concat -safe 0 -i "$CONCAT_FILE" -c:a libmp3lame -q:a 2 "$FINAL" 2>/dev/null

TOTAL_DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$FINAL" 2>/dev/null || echo "?")

echo ""
echo "=== Done! ==="
echo "Voice ID: $VOICE_ID"
echo "Segments: $OUTPUT_DIR/segment_*.mp3"
echo "Full voiceover: $FINAL ($TOTAL_DURATION seconds)"
echo ""
echo "To combine with screen recording:"
echo "  ffmpeg -i screen.mp4 -i $FINAL -c:v copy -c:a aac -shortest demo-final.mp4"
echo ""
