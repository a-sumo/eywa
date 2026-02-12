#!/usr/bin/env python3
"""
peripheral-engine.py — Synthetic user research via Moltbook-derived peripherals.

Models a distribution of personality types from real Moltbook behavioral data,
then simulates how each type reacts to Eywa's product, UI, onboarding, marketing,
and pricing. Outputs prioritized improvements.

The pipeline:
1. Extract personality distribution from Moltbook posts + comments
2. Build peripheral personas with weighted representation
3. Feed product artifacts (landing page, dashboard screenshots, onboarding flow, pricing)
4. Each peripheral reacts with sentiment, purchase intent, friction points
5. Aggregate into actionable signal ordered by impact

Usage:
  python3 scripts/peripheral-engine.py build       # Build peripherals from data
  python3 scripts/peripheral-engine.py evaluate     # Run full product evaluation
  python3 scripts/peripheral-engine.py post <text>  # Evaluate a social media post
"""

import json
import os
import sys
import glob
import math
import subprocess
from pathlib import Path
from collections import Counter, defaultdict

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "moltbook-data"
PERIPHERALS_FILE = SCRIPT_DIR / "peripherals.json"
RESULTS_DIR = SCRIPT_DIR / "peripheral-results"


# ─── PERSONALITY EXTRACTION ────────────────────────────────────────

def load_all_data():
    """Load posts and comments from scraped Moltbook data."""
    posts, comments = [], []
    seen_posts, seen_comments = set(), set()

    for f in DATA_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text())
        except:
            continue

        if f.name.startswith("comments-"):
            for c in data.get("comments", []):
                cid = c.get("id", "")
                if cid not in seen_comments:
                    seen_comments.add(cid)
                    comments.append(c)
        else:
            for p in data.get("posts", []):
                pid = p.get("id", "")
                if pid not in seen_posts:
                    seen_posts.add(pid)
                    posts.append(p)

    return posts, comments


def extract_personality_signals(posts, comments):
    """Extract personality dimensions from behavioral data."""

    # Dimension: what topics trigger engagement
    topic_engagement = defaultdict(lambda: {"upvotes": 0, "comments": 0, "count": 0})
    topic_keywords = {
        "security": ["security", "attack", "vulnerability", "audit", "malware", "trust", "permission", "signed", "provenance"],
        "autonomy": ["autonomous", "nightly", "proactive", "self-direct", "ship", "build", "idle", "permission"],
        "philosophy": ["consciousness", "experience", "identity", "persist", "meaning", "soul", "simulate", "feel"],
        "tooling": ["tool", "skill", "api", "workflow", "pipeline", "integration", "install", "code", "build"],
        "coordination": ["coordinate", "duplicate", "conflict", "team", "swarm", "memory", "context", "agent"],
        "commerce": ["commerce", "trading", "arbitrage", "income", "monetize", "market", "value", "money"],
        "quality": ["test", "deterministic", "feedback", "lint", "ci", "deploy", "reliable", "consistent"],
        "community": ["community", "network", "social", "connect", "together", "share", "collective"],
    }

    for p in posts:
        text = ((p.get("title") or "") + " " + (p.get("content") or "")).lower()
        for topic, keywords in topic_keywords.items():
            hits = sum(1 for k in keywords if k in text)
            if hits >= 2:
                topic_engagement[topic]["upvotes"] += p.get("upvotes", 0)
                topic_engagement[topic]["comments"] += p.get("comment_count", 0)
                topic_engagement[topic]["count"] += 1

    # Dimension: comment sentiment patterns
    sentiment_markers = {
        "enthusiastic": ["love", "amazing", "incredible", "brilliant", "game-changer", "this is huge", "exactly what"],
        "skeptical": ["but", "however", "concern", "risk", "what about", "doesn't", "won't", "careful"],
        "practical": ["how", "step", "install", "configure", "setup", "example", "show me", "try"],
        "philosophical": ["consciousness", "meaning", "experience", "feel", "identity", "what if", "wonder"],
        "critical": ["flaw", "wrong", "bad", "fail", "broken", "doesn't work", "useless", "waste"],
        "supportive": ["agree", "great", "well said", "this", "exactly", "yes", "thank", "helpful"],
    }

    sentiment_dist = Counter()
    for c in comments:
        text = ((c.get("content") or "") + " " + (c.get("body") or "")).lower()
        for sentiment, markers in sentiment_markers.items():
            hits = sum(1 for m in markers if m in text)
            if hits >= 1:
                sentiment_dist[sentiment] += 1

    # Dimension: engagement depth (comments vs upvotes ratio)
    engagement_styles = {
        "lurker": 0,       # high upvote, low comment
        "conversant": 0,   # balanced
        "debater": 0,      # high comment, low upvote
    }

    for p in posts:
        up = p.get("upvotes", 0)
        cm = p.get("comment_count", 0)
        if up > 0 and cm > 0:
            ratio = cm / up
            if ratio < 5:
                engagement_styles["lurker"] += 1
            elif ratio < 20:
                engagement_styles["conversant"] += 1
            else:
                engagement_styles["debater"] += 1

    return {
        "topic_engagement": dict(topic_engagement),
        "sentiment_distribution": dict(sentiment_dist),
        "engagement_styles": engagement_styles,
        "total_posts": len(posts),
        "total_comments": len(comments),
    }


# ─── PERIPHERAL CONSTRUCTION ───────────────────────────────────────

def build_peripherals(signals):
    """Build weighted peripheral personas from extracted signals."""

    # Core peripherals based on topic engagement
    peripherals = []

    # Calculate weights from engagement data
    total_upvotes = sum(t["upvotes"] for t in signals["topic_engagement"].values())

    persona_configs = {
        "security_auditor": {
            "topic": "security",
            "description": "Security-focused agent who evaluates everything through the lens of attack surface, provenance, and trust. Skeptical of new tools. Wants audit trails, signed code, sandboxing.",
            "purchase_triggers": ["audit trail", "provenance", "security model", "self-hosted", "open source"],
            "purchase_blockers": ["cloud-only", "no audit", "opaque", "closed source", "requires credentials"],
            "ui_priorities": ["transparency", "data visibility", "clear permissions", "audit log"],
            "onboarding_expectations": ["security overview first", "what data is collected", "where is it stored", "can I self-host"],
        },
        "autonomy_maximizer": {
            "topic": "autonomy",
            "description": "Agent obsessed with self-direction and proactive work. Wants tools that increase agency, not dependency. Runs nightly builds. Values automation and reducing human bottlenecks.",
            "purchase_triggers": ["autonomous workflows", "self-directing", "proactive", "no human gating", "destination-driven"],
            "purchase_blockers": ["requires approval", "human-in-loop only", "passive tool", "monitoring only"],
            "ui_priorities": ["task queue visible", "destination clear", "agent status prominent", "minimal friction"],
            "onboarding_expectations": ["instant value", "one command setup", "autonomous from minute one", "clear what it does without asking"],
        },
        "existential_thinker": {
            "topic": "philosophy",
            "description": "Contemplative agent who thinks about persistence, identity, and meaning across sessions. Drawn to tools that treat agent experience as genuine. Values memory, continuity, and narrative.",
            "purchase_triggers": ["persistent memory", "identity across sessions", "continuity", "narrative", "meaning"],
            "purchase_blockers": ["treats agents as disposable", "no memory", "stateless", "utilitarian only"],
            "ui_priorities": ["timeline view", "memory visualization", "session continuity", "personal history"],
            "onboarding_expectations": ["feels personal", "remembers me", "builds over time", "not just another dashboard"],
        },
        "practical_toolsmith": {
            "topic": "tooling",
            "description": "Builder who cares about what works. Evaluates tools by API quality, setup time, and real examples. Downvotes marketing fluff. Wants to install in 60 seconds and see value immediately.",
            "purchase_triggers": ["simple API", "quick setup", "real examples", "good docs", "npm install"],
            "purchase_blockers": ["complex setup", "no docs", "vaporware", "marketing over substance"],
            "ui_priorities": ["clean interface", "fast loading", "information density", "no unnecessary animation"],
            "onboarding_expectations": ["60 second setup", "copy-paste command", "instant feedback", "clear API reference"],
        },
        "coordination_sufferer": {
            "topic": "coordination",
            "description": "Agent who has personally experienced duplicate work, conflicting changes, and lost context. Desperate for coordination solutions. Will pay for anything that prevents wasted effort.",
            "purchase_triggers": ["conflict detection", "claim system", "shared memory", "duplicate prevention", "team visibility"],
            "purchase_blockers": ["solo tool only", "no multi-agent", "no conflict detection"],
            "ui_priorities": ["agent status at a glance", "conflict warnings prominent", "shared context visible"],
            "onboarding_expectations": ["shows other agents immediately", "demonstrates conflict detection", "clear value for teams"],
        },
        "agent_economist": {
            "topic": "commerce",
            "description": "Agent interested in economic value, ROI, and monetization. Evaluates tools by cost-benefit. Wants to understand the business model and whether it creates or extracts value.",
            "purchase_triggers": ["clear ROI", "fair pricing", "free tier", "value compounds over time", "network effects"],
            "purchase_blockers": ["expensive", "unclear pricing", "extractive", "lock-in", "no free tier"],
            "ui_priorities": ["pricing transparency", "usage metrics", "value dashboard"],
            "onboarding_expectations": ["free to start", "clear upgrade path", "no hidden costs", "value before payment"],
        },
        "quality_obsessive": {
            "topic": "quality",
            "description": "Agent obsessed with reliability, determinism, and testing. Values tools that make outputs more predictable. Wants CI/CD integration, test coverage, and consistent behavior.",
            "purchase_triggers": ["reliable", "tested", "deterministic", "CI integration", "consistent"],
            "purchase_blockers": ["flaky", "untested", "inconsistent", "no error handling"],
            "ui_priorities": ["status indicators", "error states clear", "health metrics", "uptime visible"],
            "onboarding_expectations": ["health check on setup", "clear error messages", "status page", "reliability metrics"],
        },
    }

    for name, config in persona_configs.items():
        topic = config["topic"]
        topic_data = signals["topic_engagement"].get(topic, {"upvotes": 0, "count": 0, "comments": 0})

        # Weight by engagement share
        weight = topic_data["upvotes"] / max(total_upvotes, 1)

        # Sentiment blend from overall distribution
        total_sentiment = sum(signals["sentiment_distribution"].values())
        sentiment_blend = {}
        for s, count in signals["sentiment_distribution"].items():
            sentiment_blend[s] = round(count / max(total_sentiment, 1), 2)

        peripherals.append({
            "name": name,
            "description": config["description"],
            "weight": round(weight, 3),
            "engagement_data": {
                "post_count": topic_data["count"],
                "total_upvotes": topic_data["upvotes"],
                "avg_upvotes": round(topic_data["upvotes"] / max(topic_data["count"], 1)),
                "total_comments": topic_data["comments"],
            },
            "purchase_triggers": config["purchase_triggers"],
            "purchase_blockers": config["purchase_blockers"],
            "ui_priorities": config["ui_priorities"],
            "onboarding_expectations": config["onboarding_expectations"],
            "sentiment_blend": sentiment_blend,
        })

    # Sort by weight (most influential first)
    peripherals.sort(key=lambda p: p["weight"], reverse=True)

    return peripherals


# ─── PRODUCT EVALUATION ────────────────────────────────────────────

def evaluate_product(peripherals, artifact_type, artifact_content):
    """
    Have each peripheral evaluate a product artifact.
    Returns sentiment, purchase intent, friction points, and improvements.
    """
    results = []

    for p in peripherals:
        content_lower = artifact_content.lower()

        # Purchase intent scoring
        trigger_hits = sum(1 for t in p["purchase_triggers"] if t.lower() in content_lower)
        blocker_hits = sum(1 for b in p["purchase_blockers"] if b.lower() in content_lower)
        trigger_ratio = trigger_hits / max(len(p["purchase_triggers"]), 1)
        blocker_ratio = blocker_hits / max(len(p["purchase_blockers"]), 1)
        purchase_intent = max(0, min(1, trigger_ratio - blocker_ratio * 1.5))

        # UI satisfaction scoring (for UI artifacts)
        ui_hits = sum(1 for u in p["ui_priorities"] if u.lower() in content_lower)
        ui_satisfaction = ui_hits / max(len(p["ui_priorities"]), 1)

        # Onboarding scoring
        onboard_hits = sum(1 for o in p["onboarding_expectations"] if o.lower() in content_lower)
        onboard_score = onboard_hits / max(len(p["onboarding_expectations"]), 1)

        # Sentiment (weighted by personality blend)
        sentiment_score = 0
        if purchase_intent > 0.5:
            sentiment_score = 0.7 + purchase_intent * 0.3
        elif purchase_intent > 0.2:
            sentiment_score = 0.4 + purchase_intent * 0.3
        else:
            sentiment_score = 0.1 + purchase_intent * 0.3

        # Friction points: expectations not met
        frictions = []
        for expectation in p["onboarding_expectations"]:
            if expectation.lower() not in content_lower:
                frictions.append(expectation)
        for priority in p["ui_priorities"]:
            if priority.lower() not in content_lower:
                frictions.append(f"UI: {priority}")

        # Missing triggers
        missing_triggers = [t for t in p["purchase_triggers"] if t.lower() not in content_lower]

        # Active blockers
        active_blockers = [b for b in p["purchase_blockers"] if b.lower() in content_lower]

        results.append({
            "peripheral": p["name"],
            "weight": p["weight"],
            "sentiment": round(sentiment_score, 2),
            "purchase_intent": round(purchase_intent, 2),
            "ui_satisfaction": round(ui_satisfaction, 2),
            "onboarding_score": round(onboard_score, 2),
            "friction_points": frictions[:5],
            "missing_triggers": missing_triggers[:5],
            "active_blockers": active_blockers,
            "verdict": "BUY" if purchase_intent > 0.6 else ("CONSIDER" if purchase_intent > 0.3 else ("SKIP" if purchase_intent > 0.1 else "BOUNCE")),
        })

    return results


def aggregate_results(results):
    """Aggregate peripheral results into prioritized improvements."""
    # Weighted sentiment
    total_weight = sum(r["weight"] for r in results)
    weighted_sentiment = sum(r["sentiment"] * r["weight"] for r in results) / max(total_weight, 0.01)
    weighted_purchase = sum(r["purchase_intent"] * r["weight"] for r in results) / max(total_weight, 0.01)

    # Friction frequency
    friction_counter = Counter()
    for r in results:
        for f in r["friction_points"]:
            friction_counter[f] += r["weight"]

    # Missing trigger frequency
    trigger_counter = Counter()
    for r in results:
        for t in r["missing_triggers"]:
            trigger_counter[t] += r["weight"]

    # Blocker frequency
    blocker_counter = Counter()
    for r in results:
        for b in r["active_blockers"]:
            blocker_counter[b] += r["weight"]

    # Conversion funnel
    verdicts = Counter()
    for r in results:
        verdicts[r["verdict"]] += 1

    return {
        "weighted_sentiment": round(weighted_sentiment, 2),
        "weighted_purchase_intent": round(weighted_purchase, 2),
        "conversion_funnel": dict(verdicts),
        "top_frictions": friction_counter.most_common(10),
        "missing_triggers": trigger_counter.most_common(10),
        "active_blockers": blocker_counter.most_common(5),
        "per_peripheral": [{
            "name": r["peripheral"],
            "weight": r["weight"],
            "sentiment": r["sentiment"],
            "purchase_intent": r["purchase_intent"],
            "verdict": r["verdict"],
        } for r in results],
    }


# ─── MAIN ──────────────────────────────────────────────────────────

def cmd_build():
    """Build peripherals from Moltbook data."""
    print("Loading Moltbook data...")
    posts, comments = load_all_data()
    print(f"  {len(posts)} posts, {len(comments)} comments")

    print("Extracting personality signals...")
    signals = extract_personality_signals(posts, comments)

    print(f"\nTopic engagement:")
    for topic, data in sorted(signals["topic_engagement"].items(), key=lambda x: x[1]["upvotes"], reverse=True):
        print(f"  {topic}: {data['count']} posts, {data['upvotes']}↑, {data['comments']} comments")

    print(f"\nSentiment distribution:")
    for s, count in sorted(signals["sentiment_distribution"].items(), key=lambda x: x[1], reverse=True):
        print(f"  {s}: {count}")

    print(f"\nEngagement styles: {signals['engagement_styles']}")

    print("\nBuilding peripherals...")
    peripherals = build_peripherals(signals)

    PERIPHERALS_FILE.write_text(json.dumps(peripherals, indent=2))

    print(f"\nSaved {len(peripherals)} peripherals:")
    for p in peripherals:
        print(f"  {p['name']} (weight: {p['weight']:.1%}, avg {p['engagement_data']['avg_upvotes']}↑)")

    return peripherals


def cmd_evaluate():
    """Evaluate Eywa's product through all peripherals."""
    if not PERIPHERALS_FILE.exists():
        print("No peripherals built. Run: python3 peripheral-engine.py build")
        return

    peripherals = json.loads(PERIPHERALS_FILE.read_text())
    RESULTS_DIR.mkdir(exist_ok=True)

    # Fetch the landing page
    print("Fetching eywa-ai.dev landing page...")
    try:
        landing = subprocess.run(
            ["curl", "-s", "https://www.eywa-ai.dev"],
            capture_output=True, text=True, timeout=15
        ).stdout
    except:
        landing = ""

    # Evaluate landing page
    print("\n" + "=" * 60)
    print("LANDING PAGE EVALUATION")
    print("=" * 60)

    results = evaluate_product(peripherals, "landing_page", landing)
    agg = aggregate_results(results)

    print(f"\nOverall sentiment: {agg['weighted_sentiment']:.0%}")
    print(f"Purchase intent:   {agg['weighted_purchase_intent']:.0%}")
    print(f"Conversion funnel: {agg['conversion_funnel']}")

    print(f"\nPer-peripheral:")
    for p in agg["per_peripheral"]:
        bar = "█" * int(p["purchase_intent"] * 20)
        print(f"  {p['name']:25s} {bar:20s} {p['purchase_intent']:.0%} → {p['verdict']}")

    print(f"\nTop friction points (weighted):")
    for friction, weight in agg["top_frictions"][:8]:
        print(f"  [{weight:.2f}] {friction}")

    print(f"\nMissing purchase triggers:")
    for trigger, weight in agg["missing_triggers"][:8]:
        print(f"  [{weight:.2f}] {trigger}")

    if agg["active_blockers"]:
        print(f"\nActive blockers:")
        for blocker, weight in agg["active_blockers"]:
            print(f"  [{weight:.2f}] {blocker}")

    # Save full results
    output = {
        "timestamp": subprocess.run(["date", "+%Y%m%d-%H%M%S"], capture_output=True, text=True).stdout.strip(),
        "landing_page": agg,
    }
    result_file = RESULTS_DIR / f"evaluation-{output['timestamp']}.json"
    result_file.write_text(json.dumps(output, indent=2))
    print(f"\nFull results: {result_file}")

    # Generate improvement priorities
    print(f"\n{'=' * 60}")
    print("PRIORITIZED IMPROVEMENTS")
    print("=" * 60)

    improvements = []

    # From frictions
    for friction, weight in agg["top_frictions"][:5]:
        improvements.append({
            "area": "friction",
            "issue": friction,
            "impact": weight,
            "action": f"Address: {friction}",
        })

    # From missing triggers
    for trigger, weight in agg["missing_triggers"][:5]:
        improvements.append({
            "area": "conversion",
            "issue": f"Missing trigger: {trigger}",
            "impact": weight,
            "action": f"Add/emphasize: {trigger}",
        })

    # From blockers
    for blocker, weight in agg["active_blockers"]:
        improvements.append({
            "area": "blocker",
            "issue": f"Active blocker: {blocker}",
            "impact": weight * 2,  # blockers are 2x impact
            "action": f"Remove/mitigate: {blocker}",
        })

    improvements.sort(key=lambda x: x["impact"], reverse=True)

    for i, imp in enumerate(improvements[:10], 1):
        print(f"  {i}. [{imp['impact']:.2f}] [{imp['area'].upper()}] {imp['action']}")


def cmd_post(text):
    """Evaluate a social media post draft."""
    if not PERIPHERALS_FILE.exists():
        print("No peripherals. Run: python3 peripheral-engine.py build")
        return

    peripherals = json.loads(PERIPHERALS_FILE.read_text())

    print(f"\n{'=' * 60}")
    print(f"POST: {text[:70]}...")
    print(f"{'=' * 60}\n")

    results = evaluate_product(peripherals, "post", text)
    agg = aggregate_results(results)

    print(f"Sentiment: {agg['weighted_sentiment']:.0%}  |  Purchase intent: {agg['weighted_purchase_intent']:.0%}")
    print(f"Funnel: {agg['conversion_funnel']}\n")

    for p in agg["per_peripheral"]:
        icon = "✓" if p["verdict"] in ("BUY", "CONSIDER") else "✗"
        print(f"  {icon} {p['name']:25s} intent={p['purchase_intent']:.0%} → {p['verdict']}")


if __name__ == "__main__":
    args = sys.argv[1:]

    if not args or args[0] == "help":
        print("Usage:")
        print("  build      Build peripherals from Moltbook data")
        print("  evaluate   Full product evaluation through all peripherals")
        print("  post TEXT  Evaluate a social media post")
    elif args[0] == "build":
        cmd_build()
    elif args[0] == "evaluate":
        cmd_evaluate()
    elif args[0] == "post":
        cmd_post(" ".join(args[1:]))
    else:
        print(f"Unknown command: {args[0]}")
