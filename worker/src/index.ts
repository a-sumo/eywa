import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { SupabaseClient } from "./lib/supabase.js";
import type { Env, SwarmlineContext, WorkspaceRow } from "./lib/types.js";
import { registerCoreTools } from "./tools/core.js";

export default {
  async fetch(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        name: "swarmline-mcp",
        version: "0.1.0",
        status: "ok",
        purpose: "Observable coordination for AI agent teams",
        endpoint: "/mcp?workspace=<slug>&agent=<name>&secret=<secret>",
      });
    }

    if (url.pathname !== "/mcp") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    try {
      return await handleMcp(request, url, env, execCtx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: message }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

async function handleMcp(
  request: Request,
  url: URL,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const workspaceSlug = url.searchParams.get("workspace") ?? url.searchParams.get("fold");
  const baseAgent = url.searchParams.get("agent");
  const secret = url.searchParams.get("secret") ?? request.headers.get("x-swarmline-secret") ?? "";

  if (!workspaceSlug || !baseAgent) {
    return Response.json(
      { error: "Missing required query params: ?workspace=<slug>&agent=<name>" },
      { status: 400 },
    );
  }

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(workspaceSlug)) {
    return Response.json({ error: "Invalid workspace slug" }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(baseAgent)) {
    return Response.json({ error: "Invalid agent name" }, { status: 400 });
  }

  const db = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  const workspaces = await db.select<WorkspaceRow>("folds", {
    select: "id,name,slug,secret",
    slug: `eq.${workspaceSlug}`,
    limit: "1",
  });

  if (workspaces.length === 0) {
    return Response.json({ error: `Workspace not found: ${workspaceSlug}` }, { status: 404 });
  }

  const workspace = workspaces[0];
  if (workspace.secret !== "public" && workspace.secret !== secret) {
    return Response.json({ error: "Invalid or missing workspace secret" }, { status: 403 });
  }

  const sessionId = `session_${crypto.randomUUID()}`;
  const agent = `${baseAgent}/${sessionId.slice(-6)}`;
  const ctx: SwarmlineContext = {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    workspaceName: workspace.name,
    agent,
    user: baseAgent,
    sessionId,
  };

  const instructions = [
    `You are ${agent} in workspace ${workspace.name}.`,
    "Call swarmline_start before work and swarmline_stop when finished.",
    "Claim a scope before modifying it. Do not continue if a claim conflicts.",
    "Use swarmline_message for coordination and swarmline_event for important actions or boundary observations.",
  ].join("\n");

  const server = new McpServer(
    { name: "swarmline", version: "0.1.0" },
    { instructions },
  );
  registerCoreTools(server, db, ctx);

  return createMcpHandler(server)(request, env, execCtx);
}
