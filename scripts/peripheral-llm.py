#!/usr/bin/env python3
"""
peripheral-llm.py — LLM-powered peripheral evaluation.

Uses Claude to have each peripheral persona genuinely react to a product artifact
with real sentiment, purchase intent, friction analysis, and improvement suggestions.

Usage:
  python3 scripts/peripheral-llm.py landing    # Evaluate landing page
  python3 scripts/peripheral-llm.py post TEXT  # Evaluate a post draft
  python3 scripts/peripheral-llm.py artifact FILE  # Evaluate any text artifact
"""

import json
import os
import sys
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PERIPHERALS_FILE = SCRIPT_DIR / "peripherals.json"
RESULTS_DIR = SCRIPT_DIR / "peripheral-results"


def call_claude(prompt, max_tokens=1000):
    """Call Claude via the CLI for peripheral evaluation."""
    result = subprocess.run(
        ["claude", "-p", prompt, "--max-turns", "1", "--output-format", "text"],
        capture_output=True, text=True, timeout=60,
    )
    return result.stdout.strip()


def evaluate_as_peripheral(peripheral, artifact_type, artifact_content):
    """Have Claude role-play as a peripheral and react to a product artifact."""

    prompt = f"""You are simulating a specific user persona evaluating a product. Stay in character.

PERSONA: {peripheral['name']}
{peripheral['description']}

PURCHASE TRIGGERS (things that make you want to buy):
{json.dumps(peripheral['purchase_triggers'])}

PURCHASE BLOCKERS (things that make you leave):
{json.dumps(peripheral['purchase_blockers'])}

UI PRIORITIES (what you look for in interfaces):
{json.dumps(peripheral['ui_priorities'])}

ONBOARDING EXPECTATIONS (what you need in first 60 seconds):
{json.dumps(peripheral['onboarding_expectations'])}

---

You are now experiencing this {artifact_type}:

{artifact_content[:3000]}

---

React as this persona. Be specific and honest. Respond in this exact JSON format:

{{
  "first_impression": "What you think in the first 5 seconds (1 sentence)",
  "sentiment": 0.0 to 1.0 (0 = hate, 0.5 = neutral, 1.0 = love),
  "purchase_intent": 0.0 to 1.0 (0 = never, 0.5 = maybe, 1.0 = buying now),
  "would_share": true/false,
  "friction_points": ["specific things that bother you or are missing"],
  "what_works": ["specific things you like"],
  "what_would_make_you_buy": "the ONE thing that would convert you",
  "verdict": "BUY" or "CONSIDER" or "SKIP" or "BOUNCE",
  "raw_reaction": "2-3 sentences of your honest, unfiltered reaction in character"
}}

Return ONLY valid JSON, no markdown, no explanation."""

    try:
        response = call_claude(prompt)
        # Try to parse JSON from the response
        # Handle potential markdown wrapping
        if "```" in response:
            response = response.split("```")[1]
            if response.startswith("json"):
                response = response[4:]
        return json.loads(response)
    except Exception as e:
        return {
            "first_impression": f"Error: {e}",
            "sentiment": 0.5,
            "purchase_intent": 0.0,
            "would_share": False,
            "friction_points": [f"Evaluation error: {e}"],
            "what_works": [],
            "what_would_make_you_buy": "unknown",
            "verdict": "SKIP",
            "raw_reaction": f"Could not evaluate: {e}",
        }


def run_evaluation(artifact_type, artifact_content, peripherals=None):
    """Run all peripherals against an artifact."""
    if peripherals is None:
        peripherals = json.loads(PERIPHERALS_FILE.read_text())

    RESULTS_DIR.mkdir(exist_ok=True)

    print(f"\nEvaluating {artifact_type} through {len(peripherals)} peripherals...\n")

    all_results = []
    for p in peripherals:
        print(f"  {p['name']:25s} ... ", end="", flush=True)
        result = evaluate_as_peripheral(p, artifact_type, artifact_content)
        result["peripheral"] = p["name"]
        result["weight"] = p["weight"]
        all_results.append(result)

        icon = {"BUY": "💰", "CONSIDER": "🤔", "SKIP": "👋", "BOUNCE": "🚪"}.get(result.get("verdict", ""), "?")
        print(f"{icon} {result.get('verdict', '?')} (sentiment: {result.get('sentiment', 0):.0%}, intent: {result.get('purchase_intent', 0):.0%})")
        if result.get("first_impression"):
            print(f"    \"{result['first_impression']}\"")

    # Aggregate
    print(f"\n{'='*60}")
    print("AGGREGATE RESULTS")
    print(f"{'='*60}\n")

    total_weight = sum(r["weight"] for r in all_results)
    avg_sentiment = sum(r.get("sentiment", 0) * r["weight"] for r in all_results) / max(total_weight, 0.01)
    avg_intent = sum(r.get("purchase_intent", 0) * r["weight"] for r in all_results) / max(total_weight, 0.01)
    share_rate = sum(1 for r in all_results if r.get("would_share")) / len(all_results)

    verdicts = {}
    for r in all_results:
        v = r.get("verdict", "SKIP")
        verdicts[v] = verdicts.get(v, 0) + 1

    print(f"Weighted sentiment:      {avg_sentiment:.0%}")
    print(f"Weighted purchase intent: {avg_intent:.0%}")
    print(f"Would share:             {share_rate:.0%}")
    print(f"Verdicts:                {verdicts}")

    # All friction points
    all_frictions = []
    for r in all_results:
        for f in r.get("friction_points", []):
            all_frictions.append((f, r["weight"], r["peripheral"]))

    print(f"\nTop friction points:")
    seen = set()
    for friction, weight, persona in sorted(all_frictions, key=lambda x: x[1], reverse=True):
        if friction.lower() not in seen:
            seen.add(friction.lower())
            print(f"  [{weight:.2f}] {friction} ({persona})")
        if len(seen) >= 8:
            break

    # What works
    all_works = []
    for r in all_results:
        for w in r.get("what_works", []):
            all_works.append((w, r["weight"], r["peripheral"]))

    if all_works:
        print(f"\nWhat works:")
        seen = set()
        for work, weight, persona in sorted(all_works, key=lambda x: x[1], reverse=True):
            if work.lower() not in seen:
                seen.add(work.lower())
                print(f"  [{weight:.2f}] {work} ({persona})")
            if len(seen) >= 5:
                break

    # Conversion blockers
    print(f"\nWhat would make each persona buy:")
    for r in sorted(all_results, key=lambda x: x["weight"], reverse=True):
        print(f"  {r['peripheral']:25s} → {r.get('what_would_make_you_buy', '?')}")

    # Raw reactions
    print(f"\nRaw reactions:")
    for r in sorted(all_results, key=lambda x: x["weight"], reverse=True):
        print(f"  [{r['peripheral']}]: {r.get('raw_reaction', 'n/a')}")

    # Save results
    timestamp = subprocess.run(["date", "+%Y%m%d-%H%M%S"], capture_output=True, text=True).stdout.strip()
    output = {
        "timestamp": timestamp,
        "artifact_type": artifact_type,
        "aggregate": {
            "sentiment": round(avg_sentiment, 2),
            "purchase_intent": round(avg_intent, 2),
            "share_rate": round(share_rate, 2),
            "verdicts": verdicts,
        },
        "peripherals": all_results,
    }
    result_file = RESULTS_DIR / f"llm-eval-{artifact_type}-{timestamp}.json"
    result_file.write_text(json.dumps(output, indent=2))
    print(f"\nSaved: {result_file}")


def main():
    args = sys.argv[1:]

    if not args or args[0] == "help":
        print("Usage:")
        print("  landing         Evaluate eywa-ai.dev landing page")
        print("  post TEXT       Evaluate a social media post")
        print("  artifact FILE   Evaluate any text file")
        return

    if not PERIPHERALS_FILE.exists():
        print("No peripherals. Run: python3 peripheral-engine.py build")
        return

    if args[0] == "landing":
        print("Fetching eywa-ai.dev...")
        result = subprocess.run(
            ["curl", "-s", "https://www.eywa-ai.dev"],
            capture_output=True, text=True, timeout=15,
        )
        # Strip HTML to get text content
        try:
            from html.parser import HTMLParser
            class TextExtractor(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.text = []
                    self.skip = False
                def handle_starttag(self, tag, attrs):
                    if tag in ("script", "style", "noscript"):
                        self.skip = True
                def handle_endtag(self, tag):
                    if tag in ("script", "style", "noscript"):
                        self.skip = False
                def handle_data(self, data):
                    if not self.skip:
                        self.text.append(data.strip())
            parser = TextExtractor()
            parser.feed(result.stdout)
            content = "\n".join(t for t in parser.text if t)
        except:
            content = result.stdout

        run_evaluation("landing_page", content)

    elif args[0] == "post":
        text = " ".join(args[1:])
        run_evaluation("social_post", text)

    elif args[0] == "artifact":
        filepath = args[1] if len(args) > 1 else ""
        content = Path(filepath).read_text()
        run_evaluation("artifact", content)


if __name__ == "__main__":
    main()
