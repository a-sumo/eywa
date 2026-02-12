import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

/** Get the latest memory ID for this session (for parent chaining) */
async function getLatestMemoryId(
  db: SupabaseClient,
  foldId: string,
  sessionId: string,
): Promise<string | null> {
  const rows = await db.select<MemoryRow>("memories", {
    select: "id",
    room_id: `eq.${foldId}`,
    session_id: `eq.${sessionId}`,
    order: "ts.desc",
    limit: "1",
  });
  return rows.length > 0 ? rows[0].id : null;
}

export function registerMemoryTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_log",
    "Log a message to Eywa shared memory. Optionally tag with operation metadata so other agents and humans can see what systems you're touching and what you're doing.",
    {
      role: z
        .string()
        .describe("Message type: user, assistant, tool_call, tool_result, resource"),
      content: z.string().describe("The message content"),
      system: z
        .string()
        .optional()
        .describe("System being operated on: git, database, api, deploy, filesystem, communication, browser, infra, ci, cloud, terminal, editor, other"),
      action: z
        .string()
        .optional()
        .describe("Type of action: read, write, create, delete, deploy, test, review, debug, configure, monitor, other"),
      scope: z
        .string()
        .optional()
        .describe("Scope of the operation, e.g. 'users table', 'auth service', 'main branch'"),
      outcome: z
        .enum(["success", "failure", "blocked", "in_progress"])
        .optional()
        .describe("Outcome of the operation"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ role, content, system, action, scope, outcome }) => {
      const parentId = await getLatestMemoryId(db, ctx.foldId, ctx.sessionId);
      await db.insert("memories", {
        room_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: role,
        content,
        token_count: estimateTokens(content),
        metadata: {
          user: ctx.user,
          ...(system && { system }),
          ...(action && { action }),
          ...(scope && { scope }),
          ...(outcome && { outcome }),
        },
      });
      const opTag = system || action ? ` [${[system, action, outcome].filter(Boolean).join(":")}]` : "";
      return {
        content: [
          { type: "text" as const, text: `Logged to Eywa [${ctx.agent}:${role}]${opTag}` },
        ],
      };
    },
  );

  server.tool(
    "eywa_file",
    "Store a file or large code block. Returns a reference ID.",
    {
      path: z.string().describe('File path or identifier (e.g., "src/auth.py")'),
      content: z.string().describe("The file content"),
      description: z
        .string()
        .optional()
        .describe("Optional description of changes/purpose"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ path, content, description }) => {
      const parentId = await getLatestMemoryId(db, ctx.foldId, ctx.sessionId);
      const fileId = `file_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      await db.insert("memories", {
        room_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content,
        token_count: estimateTokens(content),
        metadata: {
          file_id: fileId,
          path,
          description: description ?? "",
          size: content.length,
        },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Stored as ${fileId} (${content.length} bytes)\nReference this ID when discussing this file.`,
          },
        ],
      };
    },
  );

  server.tool(
    "eywa_get_file",
    "Retrieve a stored file by its ID.",
    {
      file_id: z
        .string()
        .describe('The file ID returned from eywa_file (e.g., "file_abc123")'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ file_id }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "content,metadata",
        "metadata->>file_id": `eq.${file_id}`,
        limit: "1",
      });

      if (!rows.length) {
        return {
          content: [{ type: "text" as const, text: `File not found: ${file_id}` }],
        };
      }

      const meta = rows[0].metadata ?? {};
      const content = rows[0].content ?? "";
      const path = (meta as Record<string, unknown>).path ?? "unknown";

      return {
        content: [
          { type: "text" as const, text: `File: ${path}\n---\n${content}` },
        ],
      };
    },
  );

  server.tool(
    "eywa_import",
    "Bulk-import a conversation transcript into Eywa. Use this to upload an existing session's history.",
    {
      messages: z
        .array(
          z.object({
            role: z.string().describe("Role: user, assistant, tool_call, tool_result"),
            content: z.string().describe("Message content"),
          }),
        )
        .describe("Array of messages from the conversation"),
      task_description: z
        .string()
        .optional()
        .describe("Brief description of what this session was about"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ messages, task_description }) => {
      // Track parent chain through import
      let parentId = await getLatestMemoryId(db, ctx.foldId, ctx.sessionId);

      // Log session start
      if (task_description) {
        const inserted = await db.insert<MemoryRow>("memories", {
          room_id: ctx.foldId,
          agent: ctx.agent,
          session_id: ctx.sessionId,
          parent_id: parentId,
          message_type: "resource",
          content: `SESSION START: ${task_description}`,
          token_count: estimateTokens(task_description),
          metadata: { event: "session_start", task: task_description, imported: true },
        });
        if (inserted.length > 0) {
          parentId = inserted[0].id;
        }
      }

      // Insert each message with proper parent chain
      let count = 0;
      for (const msg of messages) {
        const inserted = await db.insert<MemoryRow>("memories", {
          room_id: ctx.foldId,
          agent: ctx.agent,
          session_id: ctx.sessionId,
          parent_id: parentId,
          message_type: msg.role,
          content: msg.content,
          token_count: estimateTokens(msg.content),
          metadata: { imported: true },
        });
        if (inserted.length > 0) {
          parentId = inserted[0].id;
        }
        count++;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Imported ${count} messages into Eywa [${ctx.agent}:${ctx.sessionId}]${task_description ? `\nTask: ${task_description}` : ""}`,
          },
        ],
      };
    },
  );

  server.tool(
    "eywa_search",
    "Search Eywa for messages containing a query string.",
    {
      query: z.string().describe("Text to search for"),
      limit: z.number().optional().default(10).describe("Maximum results"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ query, limit }) => {
      // Sanitize query: escape PostgREST special chars to prevent filter injection
      const sanitized = query.replace(/[%_*(),.]/g, (c) => `\\${c}`);
      const rows = await db.select<MemoryRow>("memories", {
        select: "id,agent,message_type,content,ts",
        room_id: `eq.${ctx.foldId}`,
        content: `ilike.*${sanitized}*`,
        order: "ts.desc",
        limit: String(limit),
      });

      if (!rows.length) {
        return {
          content: [
            { type: "text" as const, text: `No messages matching '${query}'` },
          ],
        };
      }

      const lines = [`Search results for '${query}' (${rows.length} found):`];
      for (const m of rows) {
        const agent = m.agent;
        const role = m.message_type ?? "";
        const content = m.content?.slice(0, 200) ?? "";
        lines.push(`[${m.id}] ${agent}:${role} (${m.ts}):\n  ${content}${(m.content?.length ?? 0) > 200 ? "..." : ""}`);
      }
      lines.push("\nUse eywa_fetch(memory_id) to get full content.");

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );
}
