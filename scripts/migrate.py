#!/usr/bin/env python3
"""
Run database migrations for Remix.
"""

import os
from pathlib import Path
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

def run_migrations():
    print("Running migrations...")

    # Check if rooms table exists by trying to query it
    try:
        result = supabase.table("rooms").select("id").limit(1).execute()
        print("Rooms table already exists")
    except Exception as e:
        if "relation" in str(e) and "does not exist" in str(e):
            print("Need to create rooms table - please run schema.sql in Supabase SQL Editor")
            print("The anon key cannot create tables directly.")
            return False
        else:
            # Table exists but might be empty
            print("Rooms table exists")

    # Check if room_id column exists on memories
    try:
        result = supabase.table("memories").select("room_id").limit(1).execute()
        print("room_id column exists on memories")
    except Exception as e:
        if "column" in str(e).lower():
            print("Need to add room_id column - please run schema.sql in Supabase SQL Editor")
            return False

    # Check if room_id column exists on messages
    try:
        result = supabase.table("messages").select("room_id").limit(1).execute()
        print("room_id column exists on messages")
    except Exception as e:
        if "column" in str(e).lower():
            print("Need to add room_id column - please run schema.sql in Supabase SQL Editor")
            return False

    print("All migrations complete!")
    return True

if __name__ == "__main__":
    run_migrations()
