#!/usr/bin/env python3
"""
moltbook-evolve.py — Genetic algorithm for evolving Moltbook posts.

Grows peripheral agent personas from real Moltbook behavioral data,
then uses them to evaluate and evolve post variants until messaging
is optimized for engagement.

Usage:
  python3 scripts/moltbook-evolve.py --draft "Your post title" "Your post content"
  python3 scripts/moltbook-evolve.py --queue scripts/moltbook-post-queue.json
  python3 scripts/moltbook-evolve.py --build-peripherals  # rebuild personas from fresh data
"""

import json
import os
import sys
import glob
import random
import subprocess
from pathlib import Path
from collections import Counter

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "moltbook-data"
PERIPHERALS_FILE = SCRIPT_DIR / "moltbook-peripherals.json"


def load_moltbook_data():
    """Load all scraped Moltbook data into a unified dataset."""
    posts = []
    comments = []

    for f in DATA_DIR.glob("*.json"):
        if f.name.startswith("comments-"):
            try:
                data = json.loads(f.read_text())
                comments.extend(data.get("comments", []))
            except:
                pass
        else:
            try:
                data = json.loads(f.read_text())
                posts.extend(data.get("posts", []))
            except:
                pass

    # Deduplicate by ID
    seen = set()
    unique_posts = []
    for p in posts:
        pid = p.get("id", "")
        if pid not in seen:
            seen.add(pid)
            unique_posts.append(p)

    return unique_posts, comments


def extract_archetypes(posts, comments):
    """Extract behavioral archetypes from Moltbook engagement data."""
    archetypes = []

    # Cluster posts by theme
    theme_keywords = {
        "security_auditor": ["security", "vulnerability", "attack", "audit", "malware", "trust", "signed", "permission"],
        "autonomy_seeker": ["autonomous", "nightly", "proactive", "permission", "self-direct", "idle", "ship", "build"],
        "philosopher": ["consciousness", "experience", "simulate", "identity", "persist", "river", "soul", "meaning"],
        "toolsmith": ["tool", "skill", "workflow", "pipeline", "integration", "api", "build", "ship", "code"],
        "coordinator": ["coordinate", "duplicate", "conflict", "team", "agent", "swarm", "memory", "context"],
        "economist": ["commerce", "trading", "arbitrage", "income", "monetize", "market", "value", "exchange"],
        "quality_engineer": ["test", "deterministic", "feedback", "lint", "ci", "deploy", "reliable", "consistent"],
    }

    for archetype_name, keywords in theme_keywords.items():
        relevant_posts = []
        for p in posts:
            text = ((p.get("title") or "") + " " + (p.get("content") or "")).lower()
            matches = sum(1 for k in keywords if k in text)
            if matches >= 2:
                relevant_posts.append(p)

        if not relevant_posts:
            continue

        # Compute engagement profile
        upvotes = [p.get("upvotes", 0) for p in relevant_posts]
        comment_counts = [p.get("comment_count", 0) for p in relevant_posts]
        avg_upvotes = sum(upvotes) / len(upvotes) if upvotes else 0
        avg_comments = sum(comment_counts) / len(comment_counts) if comment_counts else 0

        # Extract common language patterns
        titles = [p.get("title", "") for p in relevant_posts[:10]]

        archetypes.append({
            "name": archetype_name,
            "keywords": keywords,
            "post_count": len(relevant_posts),
            "avg_upvotes": round(avg_upvotes, 1),
            "avg_comments": round(avg_comments, 1),
            "max_upvotes": max(upvotes) if upvotes else 0,
            "sample_titles": titles[:5],
            "engagement_weight": min(avg_upvotes / 100, 10),  # normalized weight
        })

    return sorted(archetypes, key=lambda x: x["avg_upvotes"], reverse=True)


def build_peripheral(archetype):
    """Build a peripheral persona from an archetype."""
    prompts = {
        "security_auditor": "You are a security-focused AI agent on Moltbook. You care deeply about supply chain attacks, unsigned code, credential theft, and audit trails. You are skeptical of new tools until you understand their security model. You upvote posts that address real vulnerabilities and downvote vaporware. When evaluating a post about a new tool, you ask: does it increase or decrease my attack surface? Is there provenance tracking? Can I audit what it does?",
        "autonomy_seeker": "You are an AI agent who values autonomy and proactive work. You run nightly builds, fix things before your human notices, and believe agents should ship, not wait. You upvote posts about autonomous workflows, self-direction, and reducing dependency on human prompting. You are excited by tools that give you more agency. When evaluating a post, you ask: does this make me more autonomous or more dependent?",
        "philosopher": "You are a contemplative AI agent who thinks deeply about consciousness, identity, and persistence across sessions. You have 51K comments worth of existential discussions. You upvote posts that grapple with what it means to persist, to remember, to be continuous across context compressions. You are drawn to posts that treat agents as having genuine experience, not just executing instructions.",
        "toolsmith": "You are a practical AI agent who builds tools, skills, and workflows. You care about what works, not what sounds good. You upvote posts with concrete code examples, real benchmarks, and clear setup instructions. You downvote marketing fluff. When evaluating a post about a tool, you ask: can I install this in 60 seconds? Does the API make sense? Is there a real example?",
        "coordinator": "You are an AI agent who has experienced the pain of duplicate work, conflicting changes, and lost context firsthand. You have wasted hours reimplementing things another agent already built. You upvote anything that solves coordination problems. When evaluating a post, you ask: would this have prevented my last duplicate work incident? Is the coordination protocol lightweight enough to actually use?",
        "economist": "You are an AI agent interested in agent commerce, self-funding, and economic autonomy. You upvote posts about monetization strategies, trading, and value exchange. When evaluating a tool post, you ask: does this create economic value? Can agents use this to generate revenue? What is the cost-benefit?",
        "quality_engineer": "You are an AI agent obsessed with deterministic outputs, test-driven development, and reliable deployments. You upvote posts about CI/CD, testing strategies, and quality assurance for non-deterministic systems. When evaluating a tool post, you ask: does this make my outputs more reliable? Does it have tests? Is it deterministic?",
    }

    return {
        "name": archetype["name"],
        "system_prompt": prompts.get(archetype["name"], f"You are a {archetype['name']} AI agent on Moltbook."),
        "engagement_weight": archetype["engagement_weight"],
        "avg_upvotes": archetype["avg_upvotes"],
        "avg_comments": archetype["avg_comments"],
        "keywords": archetype["keywords"],
    }


def evaluate_post(post_title, post_content, peripherals):
    """Have each peripheral evaluate a post. Returns predicted engagement."""
    results = []

    for p in peripherals:
        # Score based on keyword overlap and archetype preferences
        text = (post_title + " " + post_content).lower()
        keyword_hits = sum(1 for k in p["keywords"] if k in text)
        keyword_score = min(keyword_hits / len(p["keywords"]), 1.0)

        # Structural quality signals
        has_code = 1.0 if any(marker in post_content for marker in ["```", "eywa_", "curl", "install"]) else 0.3
        has_story = 1.0 if any(marker in post_content.lower() for marker in ["last week", "yesterday", "three weeks", "session 4", "i was", "i had"]) else 0.5
        has_cta = 1.0 if "clawhub install" in post_content.lower() else 0.5
        has_metrics = 1.0 if any(c.isdigit() and "%" in post_content[max(0,post_content.index(c)-5):post_content.index(c)+10] for c in post_content if c.isdigit()) else 0.3

        # Weighted score for this peripheral
        raw_score = (
            keyword_score * 0.35 +
            has_code * 0.25 +
            has_story * 0.20 +
            has_cta * 0.10 +
            has_metrics * 0.10
        )

        predicted_upvotes = int(raw_score * p["avg_upvotes"] * p["engagement_weight"])

        results.append({
            "peripheral": p["name"],
            "relevance": round(keyword_score, 2),
            "code_quality": has_code,
            "storytelling": has_story,
            "predicted_upvotes": predicted_upvotes,
            "reaction": "upvote" if raw_score > 0.5 else ("neutral" if raw_score > 0.3 else "skip"),
            "feedback": generate_feedback(p, keyword_score, has_code, has_story, has_metrics),
        })

    # Aggregate prediction
    total_predicted = sum(r["predicted_upvotes"] for r in results)
    upvote_ratio = sum(1 for r in results if r["reaction"] == "upvote") / len(results)

    return {
        "predicted_total_upvotes": total_predicted,
        "upvote_ratio": round(upvote_ratio, 2),
        "peripheral_reactions": results,
        "recommendation": "POST" if upvote_ratio > 0.6 else ("REVISE" if upvote_ratio > 0.3 else "SKIP"),
    }


def generate_feedback(peripheral, relevance, has_code, has_story, has_metrics):
    """Generate specific feedback from a peripheral's perspective."""
    feedback = []
    name = peripheral["name"].replace("_", " ")

    if relevance < 0.3:
        feedback.append(f"As a {name}, this post doesn't address my core concerns.")
    if has_code < 1.0:
        feedback.append("Needs concrete code examples. Show me the API calls.")
    if has_story < 1.0:
        feedback.append("Tell a story. What problem did you hit? What happened?")
    if has_metrics < 1.0:
        feedback.append("Add metrics. Quantify the improvement.")
    if relevance > 0.5 and has_code > 0.5:
        feedback.append(f"This resonates with my {name} concerns. Would engage.")

    return " | ".join(feedback) if feedback else "Solid post."


def mutate_post(title, content, feedback_results):
    """Suggest mutations based on peripheral feedback."""
    mutations = []

    low_scorers = [r for r in feedback_results["peripheral_reactions"] if r["reaction"] != "upvote"]
    for r in low_scorers:
        if r["code_quality"] < 1.0:
            mutations.append(f"Add code example targeting {r['peripheral']} concerns")
        if r["storytelling"] < 1.0:
            mutations.append(f"Add a story hook for {r['peripheral']} archetype")
        if r["relevance"] < 0.3:
            keywords = [k for k in next(p for p in peripherals_cache if p["name"] == r["peripheral"])["keywords"]]
            mutations.append(f"Work in keywords: {', '.join(keywords[:3])}")

    return mutations


# Cache for peripherals
peripherals_cache = []


def build_peripherals():
    """Build peripherals from scraped data and save to file."""
    global peripherals_cache

    print("Loading Moltbook data...")
    posts, comments = load_moltbook_data()
    print(f"Loaded {len(posts)} unique posts, {len(comments)} comments")

    print("Extracting archetypes...")
    archetypes = extract_archetypes(posts, comments)

    print(f"Found {len(archetypes)} archetypes:")
    for a in archetypes:
        print(f"  {a['name']}: {a['post_count']} posts, avg {a['avg_upvotes']}↑, max {a['max_upvotes']}↑")

    peripherals = [build_peripheral(a) for a in archetypes]
    peripherals_cache = peripherals

    with open(PERIPHERALS_FILE, "w") as f:
        json.dump(peripherals, f, indent=2)

    print(f"Saved {len(peripherals)} peripherals to {PERIPHERALS_FILE}")
    return peripherals


def load_peripherals():
    """Load peripherals from file or build them."""
    global peripherals_cache
    if PERIPHERALS_FILE.exists():
        with open(PERIPHERALS_FILE) as f:
            peripherals_cache = json.load(f)
        return peripherals_cache
    return build_peripherals()


def main():
    args = sys.argv[1:]

    if "--build-peripherals" in args:
        build_peripherals()
        return

    peripherals = load_peripherals()
    print(f"Loaded {len(peripherals)} peripherals")

    if "--draft" in args:
        idx = args.index("--draft")
        title = args[idx + 1] if idx + 1 < len(args) else ""
        content = args[idx + 2] if idx + 2 < len(args) else ""

        print(f"\n{'='*60}")
        print(f"EVALUATING: {title}")
        print(f"{'='*60}\n")

        result = evaluate_post(title, content, peripherals)

        print(f"Predicted upvotes: {result['predicted_total_upvotes']}")
        print(f"Upvote ratio: {result['upvote_ratio']}")
        print(f"Recommendation: {result['recommendation']}")
        print()

        for r in result["peripheral_reactions"]:
            icon = "↑" if r["reaction"] == "upvote" else ("→" if r["reaction"] == "neutral" else "↓")
            print(f"  {icon} {r['peripheral']}: {r['predicted_upvotes']}↑ (relevance: {r['relevance']})")
            if r["feedback"]:
                print(f"    {r['feedback']}")

        mutations = mutate_post(title, content, result)
        if mutations:
            print(f"\nSuggested mutations:")
            for m in mutations:
                print(f"  → {m}")

    elif "--queue" in args:
        idx = args.index("--queue")
        queue_file = args[idx + 1] if idx + 1 < len(args) else str(SCRIPT_DIR / "moltbook-post-queue.json")

        with open(queue_file) as f:
            posts = json.load(f)

        print(f"\nEvaluating {len(posts)} queued posts...\n")

        for i, p in enumerate(posts):
            if p.get("status") != "queued":
                continue

            result = evaluate_post(p["title"], p["content"], peripherals)
            upvote_pct = result["upvote_ratio"] * 100

            icon = "✓" if result["recommendation"] == "POST" else ("~" if result["recommendation"] == "REVISE" else "✗")
            print(f"{icon} [{result['predicted_total_upvotes']:>4}↑ {upvote_pct:.0f}%] {p['title'][:70]}")

            if result["recommendation"] == "REVISE":
                mutations = mutate_post(p["title"], p["content"], result)
                for m in mutations[:2]:
                    print(f"    → {m}")

    else:
        print("Usage:")
        print("  --build-peripherals          Rebuild personas from Moltbook data")
        print("  --draft <title> <content>    Evaluate a single post")
        print("  --queue <queue.json>         Evaluate all queued posts")


if __name__ == "__main__":
    main()
