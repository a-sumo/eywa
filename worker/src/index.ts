import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { SupabaseClient } from "./lib/supabase.js";
import type { Env, EywaContext, RoomRow } from "./lib/types.js";
import { registerSessionTools } from "./tools/session.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerContextTools } from "./tools/context.js";
import { registerNeuralmeshTools } from "./tools/neuralmesh.js";

export default {
  async fetch(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check / info endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        name: "eywa-mcp",
        version: "1.0.0",
        status: "ok",
        docs: "Connect via MCP at /mcp?room=<slug>&agent=<name>",
      });
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      try {
        return await handleMcp(request, url, env, execCtx);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.stack || err.message : String(err);
        return Response.json({ error: message }, { status: 500 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function handleMcp(
  request: Request,
  url: URL,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const roomSlug = url.searchParams.get("room");
  const agent = url.searchParams.get("agent");

  if (!roomSlug || !agent) {
    return Response.json(
      { error: "Missing required query params: ?room=<slug>&agent=<name>" },
      { status: 400 },
    );
  }

  const db = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  // Resolve room slug → room row
  const rooms = await db.select<RoomRow>("rooms", {
    select: "id,name,slug",
    slug: `eq.${roomSlug}`,
    limit: "1",
  });

  if (!rooms.length) {
    return Response.json(
      { error: `Room not found: ${roomSlug}. Create one at neuralmesh.app first.` },
      { status: 404 },
    );
  }

  const room = rooms[0];
  const sessionId = `session_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}_${crypto.randomUUID().slice(0, 8)}`;

  const ctx: EywaContext = {
    roomId: room.id,
    roomSlug: room.slug,
    roomName: room.name,
    agent,
    sessionId,
  };

  // Log agent connection
  await db.insert("memories", {
    room_id: ctx.roomId,
    agent: ctx.agent,
    session_id: ctx.sessionId,
    message_type: "resource",
    content: `Agent ${ctx.agent} connected to room ${ctx.roomName}`,
    token_count: 0,
    metadata: { event: "agent_connected", room_slug: ctx.roomSlug },
  });

  // Create MCP server and register all tools
  const server = new McpServer({ name: "eywa", version: "1.0.0" });

  registerSessionTools(server, db, ctx);
  registerMemoryTools(server, db, ctx);
  registerContextTools(server, db, ctx);
  registerNeuralmeshTools(server, db, ctx);

  // Delegate to the MCP handler (handles Streamable HTTP + SSE)
  const handler = createMcpHandler(server);
  return handler(request, env, execCtx);
}
