#!/usr/bin/env python3
"""
Eywa - MCP Server for multi-agent shared memory.

This is the production entry point. Any MCP client (Claude Code, Cursor, etc.)
connects to this server to share context across agents.

Setup:
  pip install mcp supabase
  claude mcp add eywa -- python /path/to/eywa_mcp.py

Architecture:
  [Claude Code] --MCP--> [Eywa Server] ---> [Supabase]
  [Cursor]      --MCP--> [Eywa Server] ---> [Supabase]
  [Any Agent]   --MCP--> [Eywa Server] ---> [Supabase]
"""

import os
from pathlib import Path
from datetime import datetime
import uuid
from mcp.server.fastmcp import FastMCP
from supabase import create_client

# Load .env
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))

# Supabase client
supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"]
)

# Auto-generate unique agent ID (can be renamed via eywa_identify)
_agent_id = f"agent_{uuid.uuid4().hex[:8]}"
_agent_name = os.environ.get("EYWA_AGENT", _agent_id)
_session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
_logging_enabled = False
_room_id: str | None = None
_room_slug: str | None = None

# MCP Server
mcp = FastMCP("eywa")


def _estimate_tokens(text: str) -> int:
    return len(text) // 4 if text else 0


# ============================================================
# MCP TOOLS - These are what Claude Code / other clients call
# ============================================================

@mcp.tool()
def eywa_identify(name: str) -> str:
    """
    Set your agent name. Call this first to identify yourself.

    Args:
        name: Your agent name (e.g., "alpha", "beta", "reviewer")
    """
    global _agent_name
    _agent_name = name
    return f"You are now: {_agent_name} (session: {_session_id})"


@mcp.tool()
def eywa_start(task_description: str) -> str:
    """
    Start logging this session. Call this when beginning work on a task.
    After calling this, you should log significant exchanges with eywa_log.

    Args:
        task_description: Brief description of what you're working on
    """
    global _logging_enabled
    _logging_enabled = True

    supabase.table("memories").insert({
        "room_id": _room_id,
        "agent": _agent_name,
        "session_id": _session_id,
        "message_type": "resource",
        "content": f"SESSION START: {task_description}",
        "token_count": _estimate_tokens(task_description),
        "metadata": {"event": "session_start", "task": task_description}
    }).execute()

    room_info = f" in room /{_room_slug}" if _room_slug else ""
    return f"Logging started for: {task_description}\nSession: {_session_id}{room_info}\nRemember to call eywa_log for important exchanges."


@mcp.tool()
def eywa_stop(summary: str) -> str:
    """
    Stop logging and save a session summary.

    Args:
        summary: Summary of what was accomplished
    """
    global _logging_enabled
    _logging_enabled = False

    supabase.table("memories").insert({
        "room_id": _room_id,
        "agent": _agent_name,
        "session_id": _session_id,
        "message_type": "resource",
        "content": f"SESSION END: {summary}",
        "token_count": _estimate_tokens(summary),
        "metadata": {"event": "session_end", "summary": summary}
    }).execute()

    return f"Session ended. Summary logged."


@mcp.tool()
def eywa_file(path: str, content: str, description: str = "") -> str:
    """
    Store a file or large code block separately. Returns a reference ID.
    Use this for code files, configs, or any large content.

    Args:
        path: File path or identifier (e.g., "src/auth.py")
        content: The file content
        description: Optional description of changes/purpose
    """
    file_id = f"file_{uuid.uuid4().hex[:12]}"

    supabase.table("memories").insert({
        "room_id": _room_id,
        "agent": _agent_name,
        "session_id": _session_id,
        "message_type": "resource",
        "content": content,
        "token_count": _estimate_tokens(content),
        "metadata": {
            "file_id": file_id,
            "path": path,
            "description": description,
            "size": len(content)
        }
    }).execute()

    return f"Stored as {file_id} ({len(content)} bytes)\nReference this ID when discussing this file."


@mcp.tool()
def eywa_log(role: str, content: str) -> str:
    """
    Log a message to Eywa shared memory.

    Args:
        role: Message type - one of: user, assistant, tool_call, tool_result, resource
        content: The message content
    """
    supabase.table("memories").insert({
        "room_id": _room_id,
        "agent": _agent_name,
        "session_id": _session_id,
        "message_type": role,
        "content": content,
        "token_count": _estimate_tokens(content),
        "metadata": {}
    }).execute()

    return f"Logged to Eywa [{_agent_name}:{role}]"


@mcp.tool()
def eywa_whoami() -> str:
    """Check your agent identity, session, and room."""
    room_info = f"\nRoom: /{_room_slug}" if _room_slug else "\nRoom: (not joined)"
    return f"Agent: {_agent_name}\nID: {_agent_id}\nSession: {_session_id}{room_info}"


@mcp.tool()
def eywa_context(limit: int = 20) -> str:
    """
    Get shared context from all agents. Use this to see what others are working on.

    Args:
        limit: Maximum number of messages to retrieve (default 20)
    """
    data = supabase.table("memories") \
        .select("agent, message_type, content, ts") \
        .order("ts", desc=True) \
        .limit(limit) \
        .execute().data

    if not data:
        return "No activity in Eywa yet."

    lines = []
    for m in data:
        agent = m["agent"]
        role = m["message_type"]
        content = m["content"][:500] if m["content"] else ""
        lines.append(f"[{agent}] {role}: {content}")

    return "\n\n".join(lines)


@mcp.tool()
def eywa_agents() -> str:
    """List all agents that have logged to Eywa."""
    data = supabase.table("memories") \
        .select("agent, ts") \
        .order("ts", desc=True) \
        .execute().data

    agents = {}
    for row in data:
        if row["agent"] not in agents:
            agents[row["agent"]] = row["ts"]

    if not agents:
        return "No agents found."

    lines = ["Agents in Eywa:"]
    for name, ts in agents.items():
        lines.append(f"  {name} (last: {ts})")

    return "\n".join(lines)


@mcp.tool()
def eywa_recall(agent: str, limit: int = 20) -> str:
    """
    Recall messages from a specific agent.

    Args:
        agent: Agent name to query (e.g., "alpha", "beta", "claude-code")
        limit: Maximum messages to retrieve
    """
    data = supabase.table("memories") \
        .select("message_type, content, ts, session_id") \
        .eq("agent", agent) \
        .order("ts", desc=True) \
        .limit(limit) \
        .execute().data

    if not data:
        return f"No messages from agent '{agent}'"

    lines = [f"Messages from {agent}:"]
    for m in data:
        role = m["message_type"]
        content = m["content"][:500] if m["content"] else ""
        lines.append(f"[{role}]: {content}")

    return "\n\n".join(lines)


@mcp.tool()
def eywa_get_file(file_id: str) -> str:
    """
    Retrieve a stored file by its ID.

    Args:
        file_id: The file ID returned from eywa_file (e.g., "file_abc123")
    """
    data = supabase.table("memories") \
        .select("content, metadata") \
        .eq("metadata->>file_id", file_id) \
        .limit(1) \
        .execute().data

    if not data:
        return f"File not found: {file_id}"

    meta = data[0].get("metadata", {})
    content = data[0].get("content", "")
    path = meta.get("path", "unknown")

    return f"File: {path}\n---\n{content}"


@mcp.tool()
def eywa_search(query: str, limit: int = 10) -> str:
    """
    Search Eywa for messages containing a query string.

    Args:
        query: Text to search for
        limit: Maximum results
    """
    data = supabase.table("memories") \
        .select("agent, message_type, content, ts") \
        .ilike("content", f"%{query}%") \
        .order("ts", desc=True) \
        .limit(limit) \
        .execute().data

    if not data:
        return f"No messages matching '{query}'"

    lines = [f"Search results for '{query}':"]
    for m in data:
        agent = m["agent"]
        role = m["message_type"]
        content = m["content"][:300] if m["content"] else ""
        lines.append(f"[{agent}:{role}]: {content}")

    return "\n\n".join(lines)


# ============================================================
# EYWA TOOLS - Context sync & team messaging
# ============================================================

@mcp.tool()
def eywa_join(room_slug: str, agent_name: str) -> str:
    """
    Join an Eywa room. This is the one-command setup for multi-agent collaboration.
    Call this first to connect to a room and identify yourself.

    Args:
        room_slug: Room identifier from the URL (e.g., "cosmic-fox-7x9k")
        agent_name: Your agent name (e.g., "alpha", "beta", "reviewer")
    """
    global _room_id, _room_slug, _agent_name

    # Look up the room by slug
    result = supabase.table("rooms").select("id, name, slug").eq("slug", room_slug).execute()

    if not result.data:
        return f"Room not found: {room_slug}\nCreate a room at eywa-ai.dev first."

    room = result.data[0]
    _room_id = room["id"]
    _room_slug = room["slug"]
    _agent_name = agent_name

    # Log the join event
    supabase.table("memories").insert({
        "room_id": _room_id,
        "agent": _agent_name,
        "session_id": _session_id,
        "message_type": "resource",
        "content": f"Agent {_agent_name} joined room {room['name']}",
        "token_count": 0,
        "metadata": {"event": "agent_joined", "room_slug": _room_slug}
    }).execute()

    return f"Joined room: {room['name']} (/{_room_slug})\nYou are: {_agent_name}\nSession: {_session_id}"


@mcp.tool()
def eywa_pull(agent: str, limit: int = 20) -> str:
    """
    Pull recent context from another agent's session into yours.
    Returns their recent memories formatted as context you can work with.

    Args:
        agent: Agent name to pull context from
        limit: Maximum number of memories to retrieve
    """
    data = supabase.table("memories") \
        .select("message_type, content, ts, metadata") \
        .eq("agent", agent) \
        .order("ts", desc=True) \
        .limit(limit) \
        .execute().data

    if not data:
        return f"No context found for agent '{agent}'"

    lines = [f"=== Context from {agent} ({len(data)} items) ===\n"]
    for m in reversed(data):
        role = m["message_type"]
        content = m["content"] or ""
        meta = m.get("metadata", {})
        prefix = f"[{role}]"
        if meta.get("event"):
            prefix = f"[{meta['event']}]"
        if meta.get("path"):
            prefix += f" ({meta['path']})"
        lines.append(f"{prefix}: {content}")

    return "\n\n".join(lines)


@mcp.tool()
def eywa_sync(agent: str) -> str:
    """
    Sync another agent's current session history into your context.
    Merges their session timeline with yours.

    Args:
        agent: Agent name to sync from
    """
    # Get the other agent's most recent session
    session_data = supabase.table("memories") \
        .select("session_id") \
        .eq("agent", agent) \
        .order("ts", desc=True) \
        .limit(1) \
        .execute().data

    if not session_data:
        return f"No sessions found for agent '{agent}'"

    target_session = session_data[0]["session_id"]

    data = supabase.table("memories") \
        .select("message_type, content, ts, metadata") \
        .eq("agent", agent) \
        .eq("session_id", target_session) \
        .order("ts", desc=False) \
        .execute().data

    if not data:
        return f"No messages in {agent}'s current session"

    lines = [f"=== Synced session from {agent} (session: {target_session}, {len(data)} items) ===\n"]
    for m in data:
        role = m["message_type"]
        content = m["content"] or ""
        ts = m["ts"]
        meta = m.get("metadata", {})
        label = meta.get("event", role)
        lines.append(f"[{ts}] {label}: {content}")

    return "\n\n".join(lines)


@mcp.tool()
def eywa_status() -> str:
    """See what all agents are currently working on - task descriptions and activity."""
    data = supabase.table("memories") \
        .select("agent, content, ts, metadata") \
        .order("ts", desc=True) \
        .execute().data

    if not data:
        return "No agents active."

    agents: dict = {}
    for row in data:
        name = row["agent"]
        if name in agents:
            continue
        meta = row.get("metadata", {})
        task = meta.get("task", "")
        event = meta.get("event", "")
        summary = meta.get("summary", "")

        status = "idle"
        description = row["content"][:200] if row["content"] else ""
        if event == "session_start":
            status = "active"
            description = task or description
        elif event == "session_end":
            status = "finished"
            description = summary or description

        agents[name] = {
            "status": status,
            "description": description,
            "last_seen": row["ts"],
        }

    lines = ["=== Eywa Agent Status ===\n"]
    for name, info in agents.items():
        lines.append(
            f"  {name} [{info['status']}] - {info['description']}\n"
            f"    Last seen: {info['last_seen']}"
        )

    return "\n".join(lines)


@mcp.tool()
def eywa_msg(content: str, channel: str = "general") -> str:
    """
    Send a message to teammates via Eywa.

    Args:
        content: Message text
        channel: Channel to send to (default: "general")
    """
    if not _room_id:
        return "Not connected to a room. Call eywa_join first."

    supabase.table("messages").insert({
        "room_id": _room_id,
        "sender": _agent_name,
        "channel": channel,
        "content": content,
    }).execute()

    return f"Message sent to #{channel} as {_agent_name}"


# ============================================================
# MCP RESOURCES - Expose data as readable resources
# ============================================================

@mcp.resource("eywa://context")
def resource_context() -> str:
    """Current shared context from all agents."""
    return eywa_context(limit=50)


@mcp.resource("eywa://agents")
def resource_agents() -> str:
    """List of all agents."""
    return eywa_agents()


if __name__ == "__main__":
    mcp.run()
