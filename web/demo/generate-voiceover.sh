#!/bin/bash
# Eywa Demo - Voice Clone + TTS Generation
# Uses ElevenLabs API with eleven_v3 (latest model) + instant voice clone
#
# Prerequisites:
#   export ELEVENLABS_API_KEY="your-key-here"
#   brew install jq ffmpeg (if not already installed)
#
# Usage:
#   cd web/demo
#   chmod +x generate-voiceover.sh
#   ./generate-voiceover.sh

set -euo pipefail

API_KEY="${ELEVENLABS_API_KEY:?Set ELEVENLABS_API_KEY environment variable}"
BASE="https://api.elevenlabs.io/v1"
MODEL="eleven_v3"
OUTPUT_DIR="$(dirname "$0")/generated-audio"
SAMPLES_DIR="$(dirname "$0")/voice-samples"

mkdir -p "$OUTPUT_DIR"

echo ""
echo "=== Eywa Demo Voiceover Generator ==="
echo "Model: $MODEL (ElevenLabs latest)"
echo ""

# -----------------------------------------------
# Step 1: Clone voice from audio samples
# -----------------------------------------------
echo "Step 1: Cloning your voice from samples..."

VOICE_ID=""

# Check if we already have a cloned voice
EXISTING=$(curl -s "$BASE/voices" -H "xi-api-key: $API_KEY" | jq -r '.voices[] | select(.name == "armand-eywa-demo") | .voice_id' 2>/dev/null || echo "")

if [ -n "$EXISTING" ]; then
  echo "  Found existing clone: $EXISTING"
  VOICE_ID="$EXISTING"
else
  echo "  Creating instant voice clone from samples..."

  CLONE_CMD="curl -s -X POST '$BASE/voices/add' -H 'xi-api-key: $API_KEY'"

  # Add all sample files
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
# Step 2: Generate each voiceover segment
# -----------------------------------------------
echo "Step 2: Generating voiceover segments with $MODEL..."
echo ""

generate_segment() {
  local idx="$1"
  local label="$2"
  local text="$3"
  local outfile="$OUTPUT_DIR/segment_${idx}_${label}.mp3"

  if [ -f "$outfile" ]; then
    echo "  [$idx] $label - already exists, skipping"
    return
  fi

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
    cat "$outfile"
    rm -f "$outfile"
  else
    local duration
    duration=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$outfile" 2>/dev/null || echo "?")
    echo "    Done (${duration}s)"
  fi
}

# --- Segment definitions (matching voiceover.md) ---

generate_segment "01" "hook" \
  "Right now I have over 80 AI agents that have touched this codebase. They're writing code, making decisions, shipping commits. The problem is: how do I know what's actually happening? That's Eywa. It's a navigation system for agent swarms, and Gemini is the navigator."

generate_segment "02" "destination" \
  "Every team sets a destination. This is ours: ship Eywa as a navigation system across web, CLI, Discord, VS Code, and Spectacles. You can see we're at 10 out of 12 milestones. All of this was built today by agents coordinating through Eywa."

generate_segment "03" "agents" \
  "Below that, every active agent shows up as a card. You can see what they're working on, their progress, what systems they're touching, and their success rate. This updates in real time."

generate_segment "04" "gemini-intro" \
  "But the real question is: are these agents converging or drifting? That's where Gemini comes in. Let me open the steering panel."

generate_segment "05" "gemini-query1" \
  "I'll ask Gemini: what are my agents doing right now?"

generate_segment "06" "gemini-explain1" \
  "Gemini just called get agent status behind the scenes. It can see every agent's task, their activity level, and whether they're blocked. Now let me ask it something harder."

generate_segment "07" "gemini-query2" \
  "Detect patterns across my agents."

generate_segment "08" "gemini-explain2" \
  "It found redundancy between two agents working on similar tasks, flagged an idle agent that could be doing useful work, and spotted a distress signal from an agent that ran out of context. This is the steering layer. Gemini isn't just answering questions. It's actively watching for drift and misalignment."

generate_segment "09" "course" \
  "Now I want to check our course. Which milestones are stuck and what should I prioritize?"

generate_segment "10" "course-explain" \
  "Gemini pulls the destination, sees which milestones are incomplete, cross-references with what agents are actually doing, and tells me where the gaps are. It's like having a Waze that says three agents are on the highway but nobody's covering the exit ramp."

generate_segment "11" "inject" \
  "Based on that, I can course-correct instantly. This inject bar at the bottom lets me broadcast instructions to all my agents at once, or target a specific one. I'll send: Focus on the Spectacles milestone, it's the last remaining blocker."

generate_segment "12" "multi-surface" \
  "And this same navigation model works everywhere. Here's Discord where the team runs slash destination and slash course to stay aligned. Here's VS Code where every developer sees the destination and agent progress right in their editor sidebar."

generate_segment "13" "recovery" \
  "One more thing. When an agent runs out of context, which happens constantly, it fires a distress signal. Gemini detects it, and any new agent that connects automatically recovers the lost state. No work is lost."

generate_segment "14" "network" \
  "And through the global knowledge hub, insights from one room can route to another. If an agent in one project discovers a pattern, other teams benefit. It's Waze for agent swarms: live routing from real telemetry."

generate_segment "15" "close" \
  "Eywa gives humans the steering wheel. Gemini gives them a co-pilot. When every team member runs AI, small misalignments amplify at machine speed. Eywa makes sure you see them before they compound."

echo ""

# -----------------------------------------------
# Step 3: Concatenate all segments
# -----------------------------------------------
echo "Step 3: Concatenating segments into final voiceover..."

# Build ffmpeg concat file
CONCAT_FILE="$OUTPUT_DIR/concat.txt"
: > "$CONCAT_FILE"

# Add 1 second silence at start
ffmpeg -y -f lavfi -i anullsrc=channel_layout=mono:sample_rate=44100 -t 1.0 "$OUTPUT_DIR/silence_1s.mp3" 2>/dev/null
echo "file 'silence_1s.mp3'" >> "$CONCAT_FILE"

# Add 0.5s silence between segments (natural pause)
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
