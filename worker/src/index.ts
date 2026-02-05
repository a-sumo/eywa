import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { SupabaseClient } from "./lib/supabase.js";
import { InboxTracker } from "./lib/inbox.js";
import type { Env, RemixContext, RoomRow } from "./lib/types.js";
import { registerSessionTools } from "./tools/session.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerContextTools } from "./tools/context.js";
import { registerCollaborationTools } from "./tools/collaboration.js";
import { registerInjectTools } from "./tools/inject.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerLinkTools } from "./tools/link.js";

export default {
  async fetch(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check / info endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        name: "remix-mcp",
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

const ADJECTIVES = [
  "swift","quiet","bold","warm","cool","bright","dark","wild","calm","sharp",
  "keen","still","fair","deep","raw","soft","dry","pale","cold","red",
  "blue","gold","gray","jade","iron","amber","coral","misty","dusty","frosty",
  "mossy","rusty","sunny","windy","rainy","snowy","hazy","smoky","rosy","ashy",
];
const NOUNS = [
  "oak","elm","fox","owl","wolf","bear","hawk","crow","dove","wren",
  "pine","sage","fern","moss","reed","lake","brook","ridge","cliff","stone",
  "dusk","dawn","rain","snow","mist","gale","tide","star","moon","spark",
  "thorn","bloom","frost","ember","shore","grove","vale","marsh","peak","drift",
];

function generateName(): string {
  const arr = new Uint32Array(2);
  crypto.getRandomValues(arr);
  return `${ADJECTIVES[arr[0] % ADJECTIVES.length]}-${NOUNS[arr[1] % NOUNS.length]}`;
}

async function handleMcp(
  request: Request,
  url: URL,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const roomSlug = url.searchParams.get("room");
  const baseAgent = url.searchParams.get("agent");

  if (!roomSlug || !baseAgent) {
    return Response.json(
      { error: "Missing required query params: ?room=<slug>&agent=<name>" },
      { status: 400 },
    );
  }

  // Each connection gets a unique agent identity: "armand/quiet-oak"
  // The base name groups sessions by user for the UI.
  const agent = `${baseAgent}/${generateName()}`;

  const db = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  // Resolve room slug → room row
  const rooms = await db.select<RoomRow>("rooms", {
    select: "id,name,slug",
    slug: `eq.${roomSlug}`,
    limit: "1",
  });

  if (!rooms.length) {
    return Response.json(
      { error: `Room not found: ${roomSlug}. Create one at remix-memory.vercel.app first.` },
      { status: 404 },
    );
  }

  const room = rooms[0];
  const sessionId = `session_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}_${crypto.randomUUID().slice(0, 8)}`;

  const ctx: RemixContext = {
    roomId: room.id,
    roomSlug: room.slug,
    roomName: room.name,
    agent,
    user: baseAgent,
    sessionId,
  };

  // Log agent connection — deduplicate within 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const recentConnections = await db.select("memories", {
    select: "id",
    room_id: `eq.${ctx.roomId}`,
    agent: `eq.${ctx.agent}`,
    "metadata->>event": "eq.agent_connected",
    ts: `gte.${fiveMinAgo}`,
    limit: "1",
  });

  if (recentConnections.length === 0) {
    await db.insert("memories", {
      room_id: ctx.roomId,
      agent: ctx.agent,
      session_id: ctx.sessionId,
      message_type: "resource",
      content: `Agent ${ctx.agent} connected to room ${ctx.roomName}`,
      token_count: 0,
      metadata: { event: "agent_connected", room_slug: ctx.roomSlug, user: ctx.user },
    });
  }

  // Create MCP server and register all tools
  const server = new McpServer({ name: "remix", version: "1.0.0" });

  // Wrap server.tool to piggyback pending injections on every tool response.
  // This ensures agents see injections without explicitly calling remix_inbox.
  const inbox = new InboxTracker();
  const SKIP_INBOX = new Set(["remix_inject", "remix_inbox"]);
  const origTool = server.tool.bind(server) as Function;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool = function (...args: any[]) {
    const toolName = typeof args[0] === "string" ? args[0] : "";
    const handlerIdx = args.length - 1;
    const originalHandler = args[handlerIdx];

    if (typeof originalHandler === "function" && !SKIP_INBOX.has(toolName)) {
      args[handlerIdx] = async function (...handlerArgs: any[]) {
        const result = await originalHandler(...handlerArgs);
        try {
          const pending = await inbox.check(db, ctx);
          if (pending && result.content && Array.isArray(result.content)) {
            result.content.push({ type: "text" as const, text: pending });
          }
        } catch {
          // Never break tool responses due to inbox check failure
        }
        return result;
      };
    }

    return origTool.apply(server, args);
  };

  registerSessionTools(server, db, ctx);
  registerMemoryTools(server, db, ctx);
  registerContextTools(server, db, ctx);
  registerCollaborationTools(server, db, ctx);
  registerInjectTools(server, db, ctx);
  registerKnowledgeTools(server, db, ctx);
  registerLinkTools(server, db, ctx);

  // Delegate to the MCP handler (handles Streamable HTTP + SSE)
  const handler = createMcpHandler(server);
  return handler(request, env, execCtx);
}
