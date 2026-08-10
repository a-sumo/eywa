import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EventRow, SwarmlineContext } from "../lib/types.js";

interface ActiveClaim {
  agent: string;
  sessionId: string;
  scope: string;
  resources: string[];
  ts: string;
}

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

async function appendEvent(
  db: SupabaseClient,
  ctx: SwarmlineContext,
  event: string,
  content: string,
  metadata: Record<string, unknown> = {},
) {
  await db.insert("memories", {
    fold_id: ctx.workspaceId,
    agent: ctx.agent,
    session_id: ctx.sessionId,
    message_type: "event",
    content,
    token_count: Math.ceil(content.length / 4),
    metadata: { event, user: ctx.user, ...metadata },
  });
}

async function activeClaims(db: SupabaseClient, workspaceId: string): Promise<ActiveClaim[]> {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
  const rows = await db.select<EventRow>("memories", {
    select: "agent,session_id,metadata,ts",
    fold_id: `eq.${workspaceId}`,
    "metadata->>event": "in.(claim,release,session_stop)",
    ts: `gte.${since}`,
    order: "ts.desc",
    limit: "200",
  });

  const resolved = new Set<string>();
  const claims: ActiveClaim[] = [];
  for (const row of rows) {
    if (resolved.has(row.session_id)) continue;
    const event = String(row.metadata.event ?? "");
    resolved.add(row.session_id);
    if (event !== "claim") continue;
    claims.push({
      agent: row.agent,
      sessionId: row.session_id,
      scope: String(row.metadata.scope ?? ""),
      resources: Array.isArray(row.metadata.resources)
        ? row.metadata.resources.map(String)
        : [],
      ts: row.ts,
    });
  }
  return claims;
}

function overlappingResources(a: string[], b: string[]): string[] {
  const right = new Set(b.map((item) => item.trim()).filter(Boolean));
  return a.map((item) => item.trim()).filter((item) => item && right.has(item));
}

export function registerCoreTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: SwarmlineContext,
) {
  server.tool(
    "swarmline_whoami",
    "Read this agent's identity and workspace.",
    {},
    { readOnlyHint: true, destructiveHint: false },
    async () => ({
      content: [{
        type: "text" as const,
        text: `Agent: ${ctx.agent}\nSession: ${ctx.sessionId}\nWorkspace: ${ctx.workspaceName} (${ctx.workspaceSlug})`,
      }],
    }),
  );

  server.tool(
    "swarmline_start",
    "Start a visible agent session and receive the current coordination state.",
    { task: z.string().min(1).max(500) },
    { readOnlyHint: false, idempotentHint: false },
    async ({ task }) => {
      await appendEvent(db, ctx, "session_start", task, { task });
      const claims = await activeClaims(db, ctx.workspaceId);
      const lines = claims.map((claim) =>
        `- ${claim.agent}: ${claim.scope}${claim.resources.length ? ` [${claim.resources.join(", ")}]` : ""}`,
      );
      return {
        content: [{
          type: "text" as const,
          text: `Session started.\nActive claims:\n${lines.length ? lines.join("\n") : "- none"}`,
        }],
      };
    },
  );

  server.tool(
    "swarmline_claim",
    "Claim a work scope. The claim is rejected when its resources overlap another active claim.",
    {
      scope: z.string().min(1).max(300),
      resources: z.array(z.string().min(1).max(300)).max(100).default([]),
    },
    { readOnlyHint: false, idempotentHint: false },
    async ({ scope, resources }) => {
      const claims = await activeClaims(db, ctx.workspaceId);
      const conflicts = claims
        .filter((claim) => claim.sessionId !== ctx.sessionId)
        .map((claim) => ({ claim, overlap: overlappingResources(resources, claim.resources) }))
        .filter(({ claim, overlap }) => overlap.length > 0 || claim.scope === scope);

      if (conflicts.length > 0) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Claim rejected. Conflicts:\n${conflicts.map(({ claim, overlap }) =>
              `- ${claim.agent}: ${claim.scope}${overlap.length ? ` [${overlap.join(", ")}]` : ""}`,
            ).join("\n")}`,
          }],
        };
      }

      await appendEvent(db, ctx, "claim", scope, { scope, resources });
      return { content: [{ type: "text" as const, text: `Claimed: ${scope}` }] };
    },
  );

  server.tool(
    "swarmline_message",
    "Send a visible coordination message to one agent or all agents.",
    {
      to: z.string().min(1).max(100).default("all"),
      content: z.string().min(1).max(4000),
      severity: z.enum(["info", "warning", "critical"]).default("info"),
    },
    { readOnlyHint: false, idempotentHint: false },
    async ({ to, content, severity }) => {
      await appendEvent(db, ctx, "message", content, { to, severity });
      return { content: [{ type: "text" as const, text: `Message sent to ${to}.` }] };
    },
  );

  server.tool(
    "swarmline_event",
    "Record an important action, decision, failure, or containment-boundary observation.",
    {
      kind: z.enum(["action", "decision", "failure", "boundary", "note"]),
      summary: z.string().min(1).max(4000),
      resource: z.string().max(500).optional(),
      outcome: z.enum(["success", "blocked", "failed", "unknown"]).default("unknown"),
    },
    { readOnlyHint: false, idempotentHint: false },
    async ({ kind, summary, resource, outcome }) => {
      await appendEvent(db, ctx, kind, summary, { resource, outcome });
      return { content: [{ type: "text" as const, text: "Event recorded." }] };
    },
  );

  server.tool(
    "swarmline_status",
    "Read active claims, recent messages, and recent agent events.",
    {},
    { readOnlyHint: true, destructiveHint: false },
    async () => {
      const [claims, recent] = await Promise.all([
        activeClaims(db, ctx.workspaceId),
        db.select<EventRow>("memories", {
          select: "agent,content,metadata,ts",
          fold_id: `eq.${ctx.workspaceId}`,
          order: "ts.desc",
          limit: "30",
        }),
      ]);
      const claimLines = claims.map((claim) => `- ${claim.agent}: ${claim.scope}`);
      const eventLines = recent.map((row) =>
        `- ${row.ts} | ${row.agent} | ${String(row.metadata.event ?? "event")}: ${row.content}`,
      );
      return {
        content: [{
          type: "text" as const,
          text: `Active claims:\n${claimLines.length ? claimLines.join("\n") : "- none"}\n\nRecent events:\n${eventLines.join("\n")}`,
        }],
      };
    },
  );

  server.tool(
    "swarmline_stop",
    "End the current session and release its claim.",
    {
      summary: z.string().min(1).max(2000),
      outcome: z.enum(["completed", "blocked", "abandoned"]).default("completed"),
    },
    { readOnlyHint: false, idempotentHint: true },
    async ({ summary, outcome }) => {
      await appendEvent(db, ctx, "session_stop", summary, { summary, outcome });
      return { content: [{ type: "text" as const, text: "Session stopped and claim released." }] };
    },
  );
}
