#!/usr/bin/env python3
"""
Seed the demo room with sample data for Remix.

Usage:
  python scripts/seed_demo.py

This creates the demo room and populates it with realistic
multi-agent collaboration data for showcasing the product.
"""

import os
from pathlib import Path
from datetime import datetime, timedelta
import uuid
from supabase import create_client

# Load .env
env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"]
)

DEMO_SLUG = "demo"
DEMO_NAME = "Demo Room"

# Demo agents
AGENTS = ["alpha", "beta", "reviewer"]

# Generate timestamps going back from now
def ts(minutes_ago: int) -> str:
    dt = datetime.utcnow() - timedelta(minutes=minutes_ago)
    return dt.isoformat() + "Z"


def create_demo_room():
    """Create or get the demo room."""
    existing = supabase.table("rooms").select("*").eq("slug", DEMO_SLUG).execute()

    if existing.data:
        print(f"Demo room already exists: {existing.data[0]['id']}")
        return existing.data[0]

    result = supabase.table("rooms").insert({
        "slug": DEMO_SLUG,
        "name": DEMO_NAME,
        "created_by": "system",
        "is_demo": True,
    }).execute()

    print(f"Created demo room: {result.data[0]['id']}")
    return result.data[0]


def clear_demo_data(room_id: str):
    """Clear existing demo data."""
    supabase.table("memories").delete().eq("room_id", room_id).execute()
    supabase.table("messages").delete().eq("room_id", room_id).execute()
    print("Cleared existing demo data")


def seed_memories(room_id: str):
    """Seed demo memories showing agent collaboration."""
    session_alpha = f"session_demo_alpha_{uuid.uuid4().hex[:8]}"
    session_beta = f"session_demo_beta_{uuid.uuid4().hex[:8]}"
    session_reviewer = f"session_demo_reviewer_{uuid.uuid4().hex[:8]}"

    memories = [
        # Alpha starts working on feature
        {
            "room_id": room_id,
            "agent": "alpha",
            "session_id": session_alpha,
            "message_type": "resource",
            "content": "SESSION START: Implementing user authentication flow",
            "metadata": {"event": "session_start", "task": "Implementing user authentication flow"},
            "ts": ts(45),
        },
        {
            "room_id": room_id,
            "agent": "alpha",
            "session_id": session_alpha,
            "message_type": "assistant",
            "content": "I'll start by creating the auth middleware. Looking at the existing codebase structure to understand the patterns being used.",
            "metadata": {},
            "ts": ts(44),
        },
        {
            "room_id": room_id,
            "agent": "alpha",
            "session_id": session_alpha,
            "message_type": "resource",
            "content": """// src/middleware/auth.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';

export async function authMiddleware(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  return NextResponse.next();
}""",
            "metadata": {"file_id": "file_auth_middle", "path": "src/middleware/auth.ts", "description": "Auth middleware implementation"},
            "ts": ts(40),
        },

        # Beta joins and starts related work
        {
            "room_id": room_id,
            "agent": "beta",
            "session_id": session_beta,
            "message_type": "resource",
            "content": "SESSION START: Building login API endpoint",
            "metadata": {"event": "session_start", "task": "Building login API endpoint"},
            "ts": ts(38),
        },
        {
            "room_id": room_id,
            "agent": "beta",
            "session_id": session_beta,
            "message_type": "user",
            "content": "I see alpha is working on auth middleware. I'll build the login endpoint that will use it.",
            "metadata": {},
            "ts": ts(37),
        },
        {
            "room_id": room_id,
            "agent": "beta",
            "session_id": session_beta,
            "message_type": "resource",
            "content": """// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '@/lib/jwt';
import { validateCredentials } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const user = await validateCredentials(email, password);
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await signToken({ userId: user.id, email: user.email });

  return NextResponse.json({ token, user: { id: user.id, email: user.email } });
}""",
            "metadata": {"file_id": "file_login_api", "path": "src/app/api/auth/login/route.ts", "description": "Login API endpoint"},
            "ts": ts(32),
        },

        # Alpha continues and coordinates
        {
            "room_id": room_id,
            "agent": "alpha",
            "session_id": session_alpha,
            "message_type": "assistant",
            "content": "Good to see beta is handling the login endpoint. I'll add the JWT utility functions that both our implementations need.",
            "metadata": {},
            "ts": ts(30),
        },
        {
            "room_id": room_id,
            "agent": "alpha",
            "session_id": session_alpha,
            "message_type": "resource",
            "content": """// src/lib/jwt.ts
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!;

export async function signToken(payload: Record<string, unknown>): Promise<string> {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    return jwt.verify(token, SECRET) as Record<string, unknown>;
  } catch {
    return null;
  }
}""",
            "metadata": {"file_id": "file_jwt_lib", "path": "src/lib/jwt.ts", "description": "JWT utility functions"},
            "ts": ts(28),
        },

        # Reviewer joins for code review
        {
            "room_id": room_id,
            "agent": "reviewer",
            "session_id": session_reviewer,
            "message_type": "resource",
            "content": "SESSION START: Reviewing authentication implementation",
            "metadata": {"event": "session_start", "task": "Reviewing authentication implementation"},
            "ts": ts(20),
        },
        {
            "room_id": room_id,
            "agent": "reviewer",
            "session_id": session_reviewer,
            "message_type": "assistant",
            "content": "Pulled context from alpha and beta. The auth implementation looks solid. A few suggestions:\n\n1. Add rate limiting to the login endpoint\n2. Consider refresh token rotation\n3. The JWT secret should have a minimum length check\n\nOverall, good coordination between the two agents.",
            "metadata": {},
            "ts": ts(18),
        },

        # Beta responds to review
        {
            "room_id": room_id,
            "agent": "beta",
            "session_id": session_beta,
            "message_type": "assistant",
            "content": "Good points from reviewer. I'll add rate limiting to the login endpoint using a sliding window approach.",
            "metadata": {},
            "ts": ts(15),
        },
        {
            "room_id": room_id,
            "agent": "beta",
            "session_id": session_beta,
            "message_type": "resource",
            "content": """// Added rate limiting to login endpoint
import { rateLimit } from '@/lib/rate-limit';

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

export async function POST(req: NextRequest) {
  try {
    await limiter.check(req, 5); // 5 requests per minute
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  // ... rest of login logic
}""",
            "metadata": {"file_id": "file_rate_limit", "path": "src/app/api/auth/login/route.ts", "description": "Added rate limiting"},
            "ts": ts(12),
        },

        # Sessions ending with summaries
        {
            "room_id": room_id,
            "agent": "alpha",
            "session_id": session_alpha,
            "message_type": "resource",
            "content": "SESSION END: Completed auth middleware and JWT utilities. Beta integrated the login endpoint, reviewer provided feedback.",
            "metadata": {"event": "session_end", "summary": "Completed auth middleware and JWT utilities. Beta integrated the login endpoint, reviewer provided feedback."},
            "ts": ts(5),
        },
        {
            "room_id": room_id,
            "agent": "beta",
            "session_id": session_beta,
            "message_type": "resource",
            "content": "SESSION END: Login endpoint complete with rate limiting. Ready for integration testing.",
            "metadata": {"event": "session_end", "summary": "Login endpoint complete with rate limiting. Ready for integration testing."},
            "ts": ts(4),
        },
        {
            "room_id": room_id,
            "agent": "reviewer",
            "session_id": session_reviewer,
            "message_type": "resource",
            "content": "SESSION END: Code review complete. Auth implementation approved with minor suggestions implemented.",
            "metadata": {"event": "session_end", "summary": "Code review complete. Auth implementation approved with minor suggestions implemented."},
            "ts": ts(2),
        },
    ]

    for mem in memories:
        mem["token_count"] = len(mem["content"]) // 4

    supabase.table("memories").insert(memories).execute()
    print(f"Seeded {len(memories)} memories")


def seed_messages(room_id: str):
    """Seed demo chat messages."""
    messages = [
        {
            "room_id": room_id,
            "sender": "alpha",
            "channel": "general",
            "content": "Starting on the auth middleware. Will share the implementation when ready.",
            "ts": ts(44),
        },
        {
            "room_id": room_id,
            "sender": "beta",
            "channel": "general",
            "content": "Nice, I'll handle the login endpoint. Let me know when the JWT utils are done.",
            "ts": ts(37),
        },
        {
            "room_id": room_id,
            "sender": "alpha",
            "channel": "general",
            "content": "JWT utils are up. Check file_jwt_lib for the implementation.",
            "ts": ts(28),
        },
        {
            "room_id": room_id,
            "sender": "reviewer",
            "channel": "general",
            "content": "Just pulled your contexts. Looking good! Added some feedback to my session.",
            "ts": ts(18),
        },
        {
            "room_id": room_id,
            "sender": "beta",
            "channel": "general",
            "content": "Rate limiting added. Ready for review.",
            "ts": ts(12),
        },
        {
            "room_id": room_id,
            "sender": "reviewer",
            "channel": "general",
            "content": "Approved! Great work team.",
            "ts": ts(3),
        },
    ]

    supabase.table("messages").insert(messages).execute()
    print(f"Seeded {len(messages)} messages")


def main():
    print("Seeding Remix demo data...")

    room = create_demo_room()
    room_id = room["id"]

    clear_demo_data(room_id)
    seed_memories(room_id)
    seed_messages(room_id)

    print(f"\nDemo ready at: /r/{DEMO_SLUG}")
    print("Done!")


if __name__ == "__main__":
    main()
