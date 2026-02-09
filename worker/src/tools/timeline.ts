/**
 * Git-inspired timeline tools for Eywa.
 *
 * These give teams version control semantics for agent work:
 * - View history of what happened
 * - Rewind to earlier states
 * - Fork to explore alternatives
 * - Bookmark important decisions
 * - Merge work back together
 *
 * Naming is user-friendly (not Git jargon) since non-devs use Eywa.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow, RefRow } from "../lib/types.js";

/** HEAD ref name for a session */
function headRef(agent: string, sessionId: string): string {
  return `heads/${agent}/${sessionId}`;
}

/** Get the current HEAD commit for a session */
async function getHead(
  db: SupabaseClient,
  roomId: string,
  agent: string,
  sessionId: string,
): Promise<string | null> {
  const refs = await db.select<RefRow>("refs", {
    select: "commit_id",
    room_id: `eq.${roomId}`,
    name: `eq.${headRef(agent, sessionId)}`,
    limit: "1",
  });
  return refs.length > 0 ? refs[0].commit_id : null;
}

/** Update or create HEAD ref */
async function updateHead(
  db: SupabaseClient,
  roomId: string,
  agent: string,
  sessionId: string,
  commitId: string,
): Promise<void> {
  await db.upsert("refs", {
    room_id: roomId,
    name: headRef(agent, sessionId),
    commit_id: commitId,
    created_by: agent,
  }, "room_id,name");
}

/** Format a memory for display */
function formatMemory(m: MemoryRow, short = false): string {
  const id = m.id.slice(0, 8);
  const type = m.message_type ?? "memory";
  const time = new Date(m.ts).toLocaleString();
  const content = m.content ?? "";
  const meta = (m.metadata ?? {}) as Record<string, string>;
  const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
  const opTag = opParts.length > 0 ? ` [${opParts.join(":")}]` : "";

  if (short) {
    return `${id} | ${type} | ${content.slice(0, 60)}${content.length > 60 ? "..." : ""}${opTag}`;
  }

  return `[${id}] ${type} @ ${time}${opTag}\n${content.slice(0, 200)}${content.length > 200 ? "..." : ""}`;
}

export function registerTimelineTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_history",
    "View the history of a session. Shows what happened, when, and in what order. Like scrolling back through a conversation.",
    {
      session: z.string().optional().describe("Session to view (defaults to your current session)"),
      limit: z.number().optional().default(20).describe("How many items to show"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ session, limit }) => {
      const targetSession = session ?? ctx.sessionId;

      const rows = await db.select<MemoryRow>("memories", {
        select: "id,message_type,content,ts,parent_id,metadata",
        room_id: `eq.${ctx.roomId}`,
        session_id: `eq.${targetSession}`,
        order: "ts.desc",
        limit: String(limit),
      });

      if (!rows.length) {
        return {
          content: [{ type: "text" as const, text: `No history found for session ${targetSession}` }],
        };
      }

      const lines = [`Timeline for ${targetSession} (${rows.length} items):\n`];
      lines.push("\u2500".repeat(50));

      for (const m of rows) {
        lines.push(formatMemory(m));
        lines.push("");
      }

      lines.push("\u2500".repeat(50));
      lines.push("Use eywa_rewind <id> to go back to any point.");
      lines.push("Use eywa_bookmark <id> to mark important moments.");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_rewind",
    "Rewind to an earlier point in the timeline. This moves your current position back, like an undo. You can always go forward again.",
    {
      to: z.string().describe("The ID of the point to rewind to (from eywa_history)"),
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
    async ({ to }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "id,message_type,content,ts",
        room_id: `eq.${ctx.roomId}`,
        id: `eq.${to}`,
        limit: "1",
      });

      if (!rows.length) {
        const prefixRows = await db.select<MemoryRow>("memories", {
          select: "id,message_type,content,ts",
          room_id: `eq.${ctx.roomId}`,
          id: `like.${to}*`,
          limit: "1",
        });

        if (!prefixRows.length) {
          return {
            content: [{ type: "text" as const, text: `Point not found: ${to}\nUse eywa_history to see available points.` }],
          };
        }
        rows.push(prefixRows[0]);
      }

      const target = rows[0];
      await updateHead(db, ctx.roomId, ctx.agent, ctx.sessionId, target.id);

      return {
        content: [{
          type: "text" as const,
          text: `Rewound to: ${formatMemory(target)}\n\nYour session now continues from this point. New work will branch from here.`,
        }],
      };
    },
  );

  server.tool(
    "eywa_fork",
    "Create a new timeline branching from the current point (or any point). Use this to explore alternatives without affecting the original work.",
    {
      name: z.string().describe("Name for the new timeline (e.g., 'try-redis', 'experiment-v2')"),
      from: z.string().optional().describe("Point to fork from (defaults to current position)"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ name, from }) => {
      let startCommit: string;

      if (from) {
        const rows = await db.select<MemoryRow>("memories", {
          select: "id",
          room_id: `eq.${ctx.roomId}`,
          id: `like.${from}*`,
          limit: "1",
        });
        if (!rows.length) {
          return {
            content: [{ type: "text" as const, text: `Point not found: ${from}` }],
          };
        }
        startCommit = rows[0].id;
      } else {
        const head = await getHead(db, ctx.roomId, ctx.agent, ctx.sessionId);
        if (head) {
          startCommit = head;
        } else {
          const latest = await db.select<MemoryRow>("memories", {
            select: "id",
            room_id: `eq.${ctx.roomId}`,
            session_id: `eq.${ctx.sessionId}`,
            order: "ts.desc",
            limit: "1",
          });
          if (!latest.length) {
            return {
              content: [{ type: "text" as const, text: "No starting point found. Log something first." }],
            };
          }
          startCommit = latest[0].id;
        }
      }

      const branchName = `branches/${ctx.agent}/${name}`;

      await db.upsert("refs", {
        room_id: ctx.roomId,
        name: branchName,
        commit_id: startCommit,
        created_by: ctx.agent,
      }, "room_id,name");

      return {
        content: [{
          type: "text" as const,
          text: `Created timeline "${name}" from ${startCommit.slice(0, 8)}\n\nTo work on this timeline, use eywa_switch "${name}".\nThe original timeline is unchanged.`,
        }],
      };
    },
  );

  server.tool(
    "eywa_bookmark",
    "Bookmark an important moment so you can easily find it later. Good for marking decisions, milestones, or points you might want to return to.",
    {
      name: z.string().describe("Name for the bookmark (e.g., 'decided-on-postgres', 'auth-working')"),
      at: z.string().optional().describe("Point to bookmark (defaults to current position)"),
      note: z.string().optional().describe("Optional note explaining why this moment is important"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ name, at, note }) => {
      let commitId: string;

      if (at) {
        const rows = await db.select<MemoryRow>("memories", {
          select: "id",
          room_id: `eq.${ctx.roomId}`,
          id: `like.${at}*`,
          limit: "1",
        });
        if (!rows.length) {
          return {
            content: [{ type: "text" as const, text: `Point not found: ${at}` }],
          };
        }
        commitId = rows[0].id;
      } else {
        const latest = await db.select<MemoryRow>("memories", {
          select: "id",
          room_id: `eq.${ctx.roomId}`,
          session_id: `eq.${ctx.sessionId}`,
          order: "ts.desc",
          limit: "1",
        });
        if (!latest.length) {
          return {
            content: [{ type: "text" as const, text: "Nothing to bookmark yet." }],
          };
        }
        commitId = latest[0].id;
      }

      const bookmarkName = `bookmarks/${name}`;

      await db.insert("refs", {
        room_id: ctx.roomId,
        name: bookmarkName,
        commit_id: commitId,
        created_by: ctx.agent,
        metadata: note ? { note } : {},
      });

      return {
        content: [{
          type: "text" as const,
          text: `Bookmarked "${name}" at ${commitId.slice(0, 8)}${note ? `\nNote: ${note}` : ""}\n\nFind it later with eywa_bookmarks or jump there with eywa_rewind "${name}".`,
        }],
      };
    },
  );

  server.tool(
    "eywa_bookmarks",
    "List all bookmarks in this room. Bookmarks mark important moments across all timelines.",
    {},
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async () => {
      const refs = await db.select<RefRow>("refs", {
        select: "name,commit_id,created_by,ts",
        room_id: `eq.${ctx.roomId}`,
        name: "like.bookmarks/*",
        order: "ts.desc",
      });

      if (!refs.length) {
        return {
          content: [{ type: "text" as const, text: "No bookmarks yet. Use eywa_bookmark to mark important moments." }],
        };
      }

      const lines = [`Bookmarks (${refs.length}):\n`];
      for (const ref of refs) {
        const name = ref.name.replace("bookmarks/", "");
        const time = new Date(ref.ts).toLocaleDateString();
        lines.push(`  ${name} -> ${ref.commit_id.slice(0, 8)} (by ${ref.created_by}, ${time})`);
      }

      lines.push("\nUse eywa_rewind <name> to jump to any bookmark.");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_compare",
    "Compare two points in the timeline to see what changed between them. Useful for understanding how work evolved.",
    {
      from: z.string().describe("Starting point (older)"),
      to: z.string().optional().describe("Ending point (newer, defaults to current)"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ from, to }) => {
      const fromRows = await db.select<MemoryRow>("memories", {
        select: "id,ts",
        room_id: `eq.${ctx.roomId}`,
        id: `like.${from}*`,
        limit: "1",
      });

      if (!fromRows.length) {
        return {
          content: [{ type: "text" as const, text: `Point not found: ${from}` }],
        };
      }
      const fromId = fromRows[0].id;
      const fromTs = fromRows[0].ts;

      let toTs: string;
      let toId: string;

      if (to) {
        const toRows = await db.select<MemoryRow>("memories", {
          select: "id,ts",
          room_id: `eq.${ctx.roomId}`,
          id: `like.${to}*`,
          limit: "1",
        });
        if (!toRows.length) {
          return {
            content: [{ type: "text" as const, text: `Point not found: ${to}` }],
          };
        }
        toId = toRows[0].id;
        toTs = toRows[0].ts;
      } else {
        const latest = await db.select<MemoryRow>("memories", {
          select: "id,ts",
          room_id: `eq.${ctx.roomId}`,
          session_id: `eq.${ctx.sessionId}`,
          order: "ts.desc",
          limit: "1",
        });
        if (!latest.length) {
          return {
            content: [{ type: "text" as const, text: "No current point to compare to." }],
          };
        }
        toId = latest[0].id;
        toTs = latest[0].ts;
      }

      const between = await db.select<MemoryRow>("memories", {
        select: "id,message_type,content,ts,agent,metadata",
        room_id: `eq.${ctx.roomId}`,
        ts: `gte.${fromTs}`,
        order: "ts.asc",
      });

      const changes = between.filter(m => m.ts <= toTs && m.id !== fromId);

      if (!changes.length) {
        return {
          content: [{ type: "text" as const, text: `No changes between ${fromId.slice(0, 8)} and ${toId.slice(0, 8)}` }],
        };
      }

      const lines = [`Changes from ${fromId.slice(0, 8)} to ${toId.slice(0, 8)} (${changes.length} items):\n`];
      lines.push("\u2500".repeat(50));

      for (const m of changes) {
        const type = m.message_type ?? "memory";
        const agent = m.agent.split("/")[0];
        const content = (m.content ?? "").slice(0, 100);
        const meta = (m.metadata ?? {}) as Record<string, string>;
        const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
        const opTag = opParts.length > 0 ? ` [${opParts.join(":")}]` : "";
        lines.push(`+ [${m.id.slice(0, 8)}] ${agent}:${type}${opTag}`);
        lines.push(`  ${content}${(m.content?.length ?? 0) > 100 ? "..." : ""}`);
        lines.push("");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_pick",
    "Copy specific moments from another timeline into your current one. Like cherry-picking the best parts of someone else's work.",
    {
      ids: z.array(z.string()).describe("IDs of the moments to bring in (from eywa_history)"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ ids }) => {
      const picked: string[] = [];
      const notFound: string[] = [];

      let parentId = await getHead(db, ctx.roomId, ctx.agent, ctx.sessionId);

      for (const id of ids) {
        const rows = await db.select<MemoryRow>("memories", {
          select: "message_type,content,metadata",
          room_id: `eq.${ctx.roomId}`,
          id: `like.${id}*`,
          limit: "1",
        });

        if (!rows.length) {
          notFound.push(id);
          continue;
        }

        const source = rows[0];

        const inserted = await db.insert<MemoryRow>("memories", {
          room_id: ctx.roomId,
          agent: ctx.agent,
          session_id: ctx.sessionId,
          parent_id: parentId,
          message_type: source.message_type,
          content: source.content,
          token_count: Math.floor((source.content?.length ?? 0) / 4),
          metadata: {
            ...source.metadata,
            picked_from: id,
            picked_by: ctx.agent,
          },
        });

        if (inserted.length > 0) {
          parentId = inserted[0].id;
          picked.push(id);
        }
      }

      if (parentId) {
        await updateHead(db, ctx.roomId, ctx.agent, ctx.sessionId, parentId);
      }

      const lines: string[] = [];
      if (picked.length > 0) {
        lines.push(`Picked ${picked.length} moment(s): ${picked.map(p => p.slice(0, 8)).join(", ")}`);
      }
      if (notFound.length > 0) {
        lines.push(`Not found: ${notFound.join(", ")}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") || "Nothing to pick." }],
      };
    },
  );

  server.tool(
    "eywa_timelines",
    "List all timelines (branches) in this room. Shows what parallel work streams exist.",
    {},
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async () => {
      const refs = await db.select<RefRow>("refs", {
        select: "name,commit_id,created_by,ts",
        room_id: `eq.${ctx.roomId}`,
        name: "like.branches/*",
        order: "ts.desc",
      });

      const heads = await db.select<RefRow>("refs", {
        select: "name,commit_id,created_by,ts",
        room_id: `eq.${ctx.roomId}`,
        name: "like.heads/*",
        order: "ts.desc",
      });

      if (!refs.length && !heads.length) {
        return {
          content: [{ type: "text" as const, text: "No timelines yet. Sessions will appear as you work." }],
        };
      }

      const lines: string[] = ["Active timelines:\n"];

      if (heads.length > 0) {
        lines.push("Sessions:");
        for (const h of heads.slice(0, 10)) {
          const name = h.name.replace("heads/", "");
          lines.push(`  ${name} @ ${h.commit_id.slice(0, 8)}`);
        }
        if (heads.length > 10) {
          lines.push(`  ... and ${heads.length - 10} more`);
        }
        lines.push("");
      }

      if (refs.length > 0) {
        lines.push("Named branches:");
        for (const ref of refs) {
          const name = ref.name.replace("branches/", "").split("/").pop();
          lines.push(`  ${name} @ ${ref.commit_id.slice(0, 8)} (by ${ref.created_by.split("/")[0]})`);
        }
      }

      lines.push("\nUse eywa_fork to create a new branch.");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_merge",
    "Combine another timeline into your current one. If there are conflicts, they'll be flagged for review.",
    {
      timeline: z.string().describe("Name of the timeline to merge in"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ timeline }) => {
      const refs = await db.select<RefRow>("refs", {
        select: "commit_id",
        room_id: `eq.${ctx.roomId}`,
        name: `like.branches/%${timeline}`,
        limit: "1",
      });

      if (!refs.length) {
        return {
          content: [{ type: "text" as const, text: `Timeline not found: ${timeline}\nUse eywa_timelines to see available timelines.` }],
        };
      }

      const branchHead = refs[0].commit_id;

      const branchMemories = await db.select<MemoryRow>("memories", {
        select: "id,message_type,content,metadata,ts",
        room_id: `eq.${ctx.roomId}`,
        id: `eq.${branchHead}`,
        limit: "1",
      });

      if (!branchMemories.length) {
        return {
          content: [{ type: "text" as const, text: `Branch point not found.` }],
        };
      }

      let parentId = await getHead(db, ctx.roomId, ctx.agent, ctx.sessionId);

      const mergeResult = await db.insert<MemoryRow>("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content: `MERGE: Incorporated timeline "${timeline}" (${branchHead.slice(0, 8)})`,
        token_count: 10,
        metadata: {
          event: "merge",
          merged_branch: timeline,
          merged_commit: branchHead,
          user: ctx.user,
        },
      });

      if (mergeResult.length > 0) {
        await updateHead(db, ctx.roomId, ctx.agent, ctx.sessionId, mergeResult[0].id);
      }

      return {
        content: [{
          type: "text" as const,
          text: `Merged "${timeline}" into your current timeline.\n\nThe branch's work is now part of your history. Use eywa_history to see the combined timeline.`,
        }],
      };
    },
  );
}
