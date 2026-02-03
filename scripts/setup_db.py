#!/usr/bin/env python3
"""
Setup database for Remix using REST API.
"""

import os
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from datetime import datetime, timedelta
import uuid

# Load .env
env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

def api_request(method, table, data=None, params=None):
    """Make a request to Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items())

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    body = json.dumps(data).encode() if data else None
    req = Request(url, data=body, headers=headers, method=method)

    try:
        with urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode()
        print(f"API Error: {e.code} - {error_body}")
        raise

def check_table(table):
    """Check if a table exists and has expected columns."""
    try:
        api_request("GET", table, params={"select": "*", "limit": "1"})
        return True
    except HTTPError as e:
        if e.code == 404 or "does not exist" in str(e.read()):
            return False
        raise

def ts(minutes_ago: int) -> str:
    dt = datetime.utcnow() - timedelta(minutes=minutes_ago)
    return dt.isoformat() + "Z"

def create_demo_room():
    """Create or get the demo room."""
    DEMO_SLUG = "demo"

    # Check if demo room exists
    try:
        result = api_request("GET", "rooms", params={"slug": f"eq.{DEMO_SLUG}", "select": "*"})
        if result:
            print(f"Demo room already exists: {result[0]['id']}")
            return result[0]
    except HTTPError:
        pass

    # Create demo room
    result = api_request("POST", "rooms", {
        "slug": DEMO_SLUG,
        "name": "Demo Room",
        "created_by": "system",
        "is_demo": True,
    })
    print(f"Created demo room: {result[0]['id']}")
    return result[0]

def clear_demo_data(room_id):
    """Clear existing demo data."""
    try:
        api_request("DELETE", "memories", params={"room_id": f"eq.{room_id}"})
        api_request("DELETE", "messages", params={"room_id": f"eq.{room_id}"})
        print("Cleared existing demo data")
    except HTTPError as e:
        print(f"Could not clear data: {e}")

def seed_demo_data(room_id):
    """Seed demo memories and messages."""
    session_alpha = f"session_demo_alpha_{uuid.uuid4().hex[:8]}"
    session_beta = f"session_demo_beta_{uuid.uuid4().hex[:8]}"
    session_reviewer = f"session_demo_reviewer_{uuid.uuid4().hex[:8]}"

    memories = [
        {
            "room_id": room_id,
            "agent": "alpha",
            "session_id": session_alpha,
            "message_type": "resource",
            "content": "SESSION START: Implementing user authentication flow",
            "token_count": 10,
            "metadata": {"event": "session_start", "task": "Implementing user authentication flow"},
            "ts": ts(45),
        },
        {
            "room_id": room_id,
            "agent": "alpha",
            "session_id": session_alpha,
            "message_type": "assistant",
            "content": "I'll start by creating the auth middleware. Looking at the existing codebase structure to understand the patterns being used.",
            "token_count": 25,
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
            "token_count": 80,
            "metadata": {"file_id": "file_auth_middle", "path": "src/middleware/auth.ts"},
            "ts": ts(40),
        },
        {
            "room_id": room_id,
            "agent": "beta",
            "session_id": session_beta,
            "message_type": "resource",
            "content": "SESSION START: Building login API endpoint",
            "token_count": 8,
            "metadata": {"event": "session_start", "task": "Building login API endpoint"},
            "ts": ts(38),
        },
        {
            "room_id": room_id,
            "agent": "beta",
            "session_id": session_beta,
            "message_type": "user",
            "content": "I see alpha is working on auth middleware. I'll build the login endpoint that will use it.",
            "token_count": 20,
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
            "token_count": 90,
            "metadata": {"file_id": "file_login_api", "path": "src/app/api/auth/login/route.ts"},
            "ts": ts(32),
        },
        {
            "room_id": room_id,
            "agent": "alpha",
            "session_id": session_alpha,
            "message_type": "assistant",
            "content": "Good to see beta is handling the login endpoint. I'll add the JWT utility functions that both our implementations need.",
            "token_count": 25,
            "metadata": {},
            "ts": ts(30),
        },
        {
            "room_id": room_id,
            "agent": "reviewer",
            "session_id": session_reviewer,
            "message_type": "resource",
            "content": "SESSION START: Reviewing authentication implementation",
            "token_count": 8,
            "metadata": {"event": "session_start", "task": "Reviewing authentication implementation"},
            "ts": ts(20),
        },
        {
            "room_id": room_id,
            "agent": "reviewer",
            "session_id": session_reviewer,
            "message_type": "assistant",
            "content": "Pulled context from alpha and beta. The auth implementation looks solid. A few suggestions:\n\n1. Add rate limiting to the login endpoint\n2. Consider refresh token rotation\n3. The JWT secret should have a minimum length check\n\nOverall, good coordination between the two agents.",
            "token_count": 55,
            "metadata": {},
            "ts": ts(18),
        },
        {
            "room_id": room_id,
            "agent": "beta",
            "session_id": session_beta,
            "message_type": "assistant",
            "content": "Good points from reviewer. I'll add rate limiting to the login endpoint using a sliding window approach.",
            "token_count": 20,
            "metadata": {},
            "ts": ts(15),
        },
        {
            "room_id": room_id,
            "agent": "alpha",
            "session_id": session_alpha,
            "message_type": "resource",
            "content": "SESSION END: Completed auth middleware and JWT utilities. Beta integrated the login endpoint, reviewer provided feedback.",
            "token_count": 20,
            "metadata": {"event": "session_end", "summary": "Completed auth middleware and JWT utilities. Beta integrated the login endpoint, reviewer provided feedback."},
            "ts": ts(5),
        },
        {
            "room_id": room_id,
            "agent": "beta",
            "session_id": session_beta,
            "message_type": "resource",
            "content": "SESSION END: Login endpoint complete with rate limiting. Ready for integration testing.",
            "token_count": 15,
            "metadata": {"event": "session_end", "summary": "Login endpoint complete with rate limiting. Ready for integration testing."},
            "ts": ts(4),
        },
        {
            "room_id": room_id,
            "agent": "reviewer",
            "session_id": session_reviewer,
            "message_type": "resource",
            "content": "SESSION END: Code review complete. Auth implementation approved with minor suggestions implemented.",
            "token_count": 15,
            "metadata": {"event": "session_end", "summary": "Code review complete. Auth implementation approved with minor suggestions implemented."},
            "ts": ts(2),
        },
    ]

    messages = [
        {"room_id": room_id, "sender": "alpha", "channel": "general", "content": "Starting on the auth middleware. Will share the implementation when ready.", "ts": ts(44)},
        {"room_id": room_id, "sender": "beta", "channel": "general", "content": "Nice, I'll handle the login endpoint. Let me know when the JWT utils are done.", "ts": ts(37)},
        {"room_id": room_id, "sender": "alpha", "channel": "general", "content": "JWT utils are up. Check file_jwt_lib for the implementation.", "ts": ts(28)},
        {"room_id": room_id, "sender": "reviewer", "channel": "general", "content": "Just pulled your contexts. Looking good! Added some feedback to my session.", "ts": ts(18)},
        {"room_id": room_id, "sender": "beta", "channel": "general", "content": "Rate limiting added. Ready for review.", "ts": ts(12)},
        {"room_id": room_id, "sender": "reviewer", "channel": "general", "content": "Approved! Great work team.", "ts": ts(3)},
    ]

    # Insert memories one by one
    for mem in memories:
        try:
            api_request("POST", "memories", mem)
        except HTTPError as e:
            print(f"Error inserting memory: {e}")
    print(f"Seeded {len(memories)} memories")

    # Insert messages one by one
    for msg in messages:
        try:
            api_request("POST", "messages", msg)
        except HTTPError as e:
            print(f"Error inserting message: {e}")
    print(f"Seeded {len(messages)} messages")

def main():
    print("Setting up Remix database...")
    print(f"Using Supabase URL: {SUPABASE_URL}")

    # Check if rooms table exists
    print("\nChecking tables...")
    try:
        api_request("GET", "rooms", params={"select": "id", "limit": "1"})
        print("  rooms table: OK")
    except HTTPError as e:
        print(f"  rooms table: MISSING - Please run schema.sql in Supabase SQL Editor")
        print(f"  Error: {e}")
        return

    # Check room_id on memories
    try:
        api_request("GET", "memories", params={"select": "room_id", "limit": "1"})
        print("  memories.room_id: OK")
    except HTTPError as e:
        print(f"  memories.room_id: MISSING - Please run schema.sql")
        return

    # Check room_id on messages
    try:
        api_request("GET", "messages", params={"select": "room_id", "limit": "1"})
        print("  messages.room_id: OK")
    except HTTPError as e:
        print(f"  messages.room_id: MISSING - Please run schema.sql")
        return

    print("\nAll tables ready!")

    # Create demo room and seed data
    print("\nSetting up demo room...")
    room = create_demo_room()
    clear_demo_data(room["id"])
    seed_demo_data(room["id"])

    print(f"\nDemo ready at: /r/demo")
    print("Done!")

if __name__ == "__main__":
    main()
