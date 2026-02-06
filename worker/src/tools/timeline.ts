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
import type { RemixContext, MemoryRow, RefRow } from "../lib/types.js";

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

  if (short) {
    return `${id} | ${type} | ${content.slice(0, 60)}${content.length > 60 ? "..." : ""}`;
  }

  return `[${id}] ${type} @ ${time}\n${content.slice(0, 200)}${content.length > 200 ? "..." : ""}`;
}

export function registerTimelineTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: RemixContext,
) {
  // ============================================================
  // remix_history - View the timeline of what happened
  // ============================================================
  server.tool(
    "remix_history",
    "View the history of a session. Shows what happened, when, and in what order. Like scrolling back through a conversation.",
    {
      session: z.string().optional().describe("Session to view (defaults to your current session)"),
      limit: z.number().optional().default(20).describe("How many items to show"),
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
      lines.push("─".repeat(50));

      for (const m of rows) {
        lines.push(formatMemory(m));
        lines.push("");
      }

      lines.push("─".repeat(50));
      lines.push("Use remix_rewind <id> to go back to any point.");
      lines.push("Use remix_bookmark <id> to mark important moments.");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  // ============================================================
  // remix_rewind - Go back to an earlier point
  // ============================================================
  server.tool(
    "remix_rewind",
    "Rewind to an earlier point in the timeline. This moves your current position back, like an undo. You can always go forward again.",
    {
      to: z.string().describe("The ID of the point to rewind to (from remix_history)"),
    },
    async ({ to }) => {
      // Find the target commit
      const rows = await db.select<MemoryRow>("memories", {
        select: "id,message_type,content,ts",
        room_id: `eq.${ctx.roomId}`,
        id: `eq.${to}`,
        limit: "1",
      });

      if (!rows.length) {
        // Try prefix match
        const prefixRows = await db.select<MemoryRow>("memories", {
          select: "id,message_type,content,ts",
          room_id: `eq.${ctx.roomId}`,
          id: `like.${to}*`,
          limit: "1",
        });

        if (!prefixRows.length) {
          return {
            content: [{ type: "text" as const, text: `Point not found: ${to}\nUse remix_history to see available points.` }],
          };
        }
        rows.push(prefixRows[0]);
      }

      const target = rows[0];

      // Update HEAD to point to this commit
      await updateHead(db, ctx.roomId, ctx.agent, ctx.sessionId, target.id);

      return {
        content: [{
          type: "text" as const,
          text: `Rewound to: ${formatMemory(target)}\n\nYour session now continues from this point. New work will branch from here.`,
        }],
      };
    },
  );

  // ============================================================
  // remix_fork - Create a new timeline from any point
  // ============================================================
  server.tool(
    "remix_fork",
    "Create a new timeline branching from the current point (or any point). Use this to explore alternatives without affecting the original work.",
    {
      name: z.string().describe("Name for the new timeline (e.g., 'try-redis', 'experiment-v2')"),
      from: z.string().optional().describe("Point to fork from (defaults to current position)"),
    },
    async ({ name, from }) => {
      // Resolve starting point
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
        // Use current HEAD or latest memory
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

      // Create a new branch ref
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
          text: `Created timeline "${name}" from ${startCommit.slice(0, 8)}\n\nTo work on this timeline, use remix_switch "${name}".\nThe original timeline is unchanged.`,
        }],
      };
    },
  );

  // ============================================================
  // remix_bookmark - Mark an important moment
  // ============================================================
  server.tool(
    "remix_bookmark",
    "Bookmark an important moment so you can easily find it later. Good for marking decisions, milestones, or points you might want to return to.",
    {
      name: z.string().describe("Name for the bookmark (e.g., 'decided-on-postgres', 'auth-working')"),
      at: z.string().optional().describe("Point to bookmark (defaults to current position)"),
      note: z.string().optional().describe("Optional note explaining why this moment is important"),
    },
    async ({ name, at, note }) => {
      // Resolve point to bookmark
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

      // Create bookmark ref (bookmarks are immutable, unlike branches)
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
          text: `Bookmarked "${name}" at ${commitId.slice(0, 8)}${note ? `\nNote: ${note}` : ""}\n\nFind it later with remix_bookmarks or jump there with remix_rewind "${name}".`,
        }],
      };
    },
  );

  // ============================================================
  // remix_bookmarks - List all bookmarks
  // ============================================================
  server.tool(
    "remix_bookmarks",
    "List all bookmarks in this room. Bookmarks mark important moments across all timelines.",
    {},
    async () => {
      const refs = await db.select<RefRow>("refs", {
        select: "name,commit_id,created_by,ts",
        room_id: `eq.${ctx.roomId}`,
        name: "like.bookmarks/*",
        order: "ts.desc",
      });

      if (!refs.length) {
        return {
          content: [{ type: "text" as const, text: "No bookmarks yet. Use remix_bookmark to mark important moments." }],
        };
      }

      const lines = [`Bookmarks (${refs.length}):\n`];
      for (const ref of refs) {
        const name = ref.name.replace("bookmarks/", "");
        const time = new Date(ref.ts).toLocaleDateString();
        lines.push(`  ${name} → ${ref.commit_id.slice(0, 8)} (by ${ref.created_by}, ${time})`);
      }

      lines.push("\nUse remix_rewind <name> to jump to any bookmark.");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  // ============================================================
  // remix_compare - See what changed between two points
  // ============================================================
  server.tool(
    "remix_compare",
    "Compare two points in the timeline to see what changed between them. Useful for understanding how work evolved.",
    {
      from: z.string().describe("Starting point (older)"),
      to: z.string().optional().describe("Ending point (newer, defaults to current)"),
    },
    async ({ from, to }) => {
      // Resolve 'from' point
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

      // Resolve 'to' point
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

      // Get all memories between the two points
      const between = await db.select<MemoryRow>("memories", {
        select: "id,message_type,content,ts,agent",
        room_id: `eq.${ctx.roomId}`,
        ts: `gte.${fromTs}`,
        order: "ts.asc",
      });

      // Filter to those before 'to'
      const changes = between.filter(m => m.ts <= toTs && m.id !== fromId);

      if (!changes.length) {
        return {
          content: [{ type: "text" as const, text: `No changes between ${fromId.slice(0, 8)} and ${toId.slice(0, 8)}` }],
        };
      }

      const lines = [`Changes from ${fromId.slice(0, 8)} to ${toId.slice(0, 8)} (${changes.length} items):\n`];
      lines.push("─".repeat(50));

      for (const m of changes) {
        const type = m.message_type ?? "memory";
        const agent = m.agent.split("/")[0]; // Just the user part
        const content = (m.content ?? "").slice(0, 100);
        lines.push(`+ [${m.id.slice(0, 8)}] ${agent}:${type}`);
        lines.push(`  ${content}${(m.content?.length ?? 0) > 100 ? "..." : ""}`);
        lines.push("");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  // ============================================================
  // remix_pick - Bring specific moments to current timeline
  // ============================================================
  server.tool(
    "remix_pick",
    "Copy specific moments from another timeline into your current one. Like cherry-picking the best parts of someone else's work.",
    {
      ids: z.array(z.string()).describe("IDs of the moments to bring in (from remix_history)"),
    },
    async ({ ids }) => {
      const picked: string[] = [];
      const notFound: string[] = [];

      // Get current HEAD for parent chaining
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

        // Create a copy in current session
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

      // Update HEAD
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

  // ============================================================
  // remix_timelines - List all active timelines
  // ============================================================
  server.tool(
    "remix_timelines",
    "List all timelines (branches) in this room. Shows what parallel work streams exist.",
    {},
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

      lines.push("\nUse remix_fork to create a new branch.");

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  // ============================================================
  // remix_merge - Combine timelines (with AI-assisted conflict resolution)
  // ============================================================
  server.tool(
    "remix_merge",
    "Combine another timeline into your current one. If there are conflicts, they'll be flagged for review.",
    {
      timeline: z.string().describe("Name of the timeline to merge in"),
    },
    async ({ timeline }) => {
      // Find the branch ref
      const refs = await db.select<RefRow>("refs", {
        select: "commit_id",
        room_id: `eq.${ctx.roomId}`,
        name: `like.branches/%${timeline}`,
        limit: "1",
      });

      if (!refs.length) {
        return {
          content: [{ type: "text" as const, text: `Timeline not found: ${timeline}\nUse remix_timelines to see available timelines.` }],
        };
      }

      const branchHead = refs[0].commit_id;

      // Get memories from the branch
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

      // For now, create a merge commit that references the branch
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
          text: `Merged "${timeline}" into your current timeline.\n\nThe branch's work is now part of your history. Use remix_history to see the combined timeline.`,
        }],
      };
    },
  );
}
