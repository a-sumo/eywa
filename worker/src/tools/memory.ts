import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { RemixContext, MemoryRow } from "../lib/types.js";

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

export function registerMemoryTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: RemixContext,
) {
  server.tool(
    "remix_log",
    "Log a message to Remix shared memory.",
    {
      role: z
        .string()
        .describe("Message type: user, assistant, tool_call, tool_result, resource"),
      content: z.string().describe("The message content"),
    },
    async ({ role, content }) => {
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        message_type: role,
        content,
        token_count: estimateTokens(content),
        metadata: { user: ctx.user },
      });
      return {
        content: [
          { type: "text" as const, text: `Logged to Remix [${ctx.agent}:${role}]` },
        ],
      };
    },
  );

  server.tool(
    "remix_file",
    "Store a file or large code block. Returns a reference ID.",
    {
      path: z.string().describe('File path or identifier (e.g., "src/auth.py")'),
      content: z.string().describe("The file content"),
      description: z
        .string()
        .optional()
        .describe("Optional description of changes/purpose"),
    },
    async ({ path, content, description }) => {
      const fileId = `file_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
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
    "remix_get_file",
    "Retrieve a stored file by its ID.",
    {
      file_id: z
        .string()
        .describe('The file ID returned from remix_file (e.g., "file_abc123")'),
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
    "remix_import",
    "Bulk-import a conversation transcript into Remix. Use this to upload an existing session's history.",
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
    async ({ messages, task_description }) => {
      // Log session start
      if (task_description) {
        await db.insert("memories", {
          room_id: ctx.roomId,
          agent: ctx.agent,
          session_id: ctx.sessionId,
          message_type: "resource",
          content: `SESSION START: ${task_description}`,
          token_count: estimateTokens(task_description),
          metadata: { event: "session_start", task: task_description, imported: true },
        });
      }

      // Insert each message
      let count = 0;
      for (const msg of messages) {
        await db.insert("memories", {
          room_id: ctx.roomId,
          agent: ctx.agent,
          session_id: ctx.sessionId,
          message_type: msg.role,
          content: msg.content,
          token_count: estimateTokens(msg.content),
          metadata: { imported: true },
        });
        count++;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Imported ${count} messages into Remix [${ctx.agent}:${ctx.sessionId}]${task_description ? `\nTask: ${task_description}` : ""}`,
          },
        ],
      };
    },
  );

  server.tool(
    "remix_search",
    "Search Remix for messages containing a query string.",
    {
      query: z.string().describe("Text to search for"),
      limit: z.number().optional().default(10).describe("Maximum results"),
    },
    async ({ query, limit }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "id,agent,message_type,content,ts",
        room_id: `eq.${ctx.roomId}`,
        content: `ilike.*${query}*`,
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
        lines.push(`[${m.id.slice(0, 8)}] ${agent}:${role} (${m.ts}):\n  ${content}${(m.content?.length ?? 0) > 200 ? "..." : ""}`);
      }
      lines.push("\nUse remix_fetch(memory_id) to get full content.");

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );
}
