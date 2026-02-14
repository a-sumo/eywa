import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";
import { getActiveClaims } from "./claim.js";

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

/** Extract meaningful words from text for similarity comparison. */
function extractWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

/** Jaccard similarity between two word sets. Returns 0-1. */
function wordSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

/** Similarity threshold for fuzzy task dedup. */
const DEDUP_SIMILARITY_THRESHOLD = 0.5;

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const ACTIVE_STATUSES = ["open", "claimed", "in_progress", "blocked"];

export function registerTaskTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_task",
    "[CONTEXT] Create a task. Tasks are structured work items that agents can pick up and track to completion. Checks for duplicate titles in active tasks before creating.",
    {
      title: z.string().describe("Short title for the task"),
      description: z.string().optional().describe("Detailed description of what needs to be done"),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal").describe("Task priority"),
      assigned_to: z.string().optional().describe("Agent or user name to assign to (e.g. 'armand')"),
      milestone: z.string().optional().describe("Links to a destination milestone"),
      parent_task: z.string().optional().describe("Parent task ID for subtasks"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ title, description, priority, assigned_to, milestone, parent_task }) => {
      // Check for duplicate/similar titles in active tasks
      const existing = await db.select<MemoryRow>("memories", {
        select: "id,metadata",
        fold_id: `eq.${ctx.foldId}`,
        message_type: "eq.task",
        order: "ts.desc",
        limit: "100",
      });

      const newWords = extractWords(title);
      for (const row of existing) {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        if (!ACTIVE_STATUSES.includes(meta.status as string)) continue;

        const existingTitle = (meta.title as string) || "";

        // Exact match
        if (existingTitle.toLowerCase() === title.toLowerCase()) {
          return {
            content: [{
              type: "text" as const,
              text: `Duplicate: active task already exists with title "${existingTitle}" (ID: ${row.id}, status: ${meta.status}).`,
            }],
          };
        }

        // Fuzzy match
        const existingWords = extractWords(existingTitle);
        const similarity = wordSimilarity(newWords, existingWords);
        if (similarity >= DEDUP_SIMILARITY_THRESHOLD) {
          return {
            content: [{
              type: "text" as const,
              text: `Similar task exists (${Math.round(similarity * 100)}% match): "${existingTitle}" (ID: ${row.id}, status: ${meta.status}). Use that task or make your title more distinct.`,
            }],
          };
        }
      }

      const rows = await db.insert<MemoryRow>("memories", {
        fold_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        message_type: "task",
        content: `TASK: ${title}${description ? ` - ${description}` : ""}`,
        token_count: estimateTokens(title + (description || "")),
        metadata: {
          event: "task",
          status: assigned_to ? "claimed" : "open",
          title,
          description: description ?? null,
          priority,
          assigned_to: assigned_to ?? null,
          parent_task: parent_task ?? null,
          milestone: milestone ?? null,
          created_by: ctx.agent,
          claimed_at: assigned_to ? new Date().toISOString() : null,
          completed_at: null,
          blocked_reason: null,
          notes: null,
        },
      });

      const taskId = rows[0]?.id;

      return {
        content: [{
          type: "text" as const,
          text: `Task created (ID: ${taskId}).\nTitle: ${title}\nPriority: ${priority}\n${assigned_to ? `Assigned to: ${assigned_to}\n` : ""}${milestone ? `Milestone: ${milestone}\n` : ""}${parent_task ? `Parent: ${parent_task}\n` : ""}`,
        }],
      };
    },
  );

  server.tool(
    "eywa_tasks",
    "[COORDINATION] List tasks in the fold. Sorted by priority then time. Filter by status, assignee, or milestone.",
    {
      status: z.string().optional().describe("Filter by status: open, claimed, in_progress, done, blocked. Comma-separated for multiple."),
      assigned_to: z.string().optional().describe("Filter by assignee name"),
      milestone: z.string().optional().describe("Filter by milestone"),
      include_done: z.boolean().optional().default(false).describe("Include completed tasks (excluded by default)"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ status, assigned_to, milestone, include_done }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,metadata,ts",
        fold_id: `eq.${ctx.foldId}`,
        message_type: "eq.task",
        order: "ts.desc",
        limit: "100",
      });

      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No tasks in this fold." }],
        };
      }

      // Dedupe: latest version of each task (by ID for updates, or by title for originals)
      // Since we update in-place via metadata, each row IS the latest version
      let tasks = rows.map((row) => {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        return {
          id: row.id,
          title: (meta.title as string) || "",
          description: (meta.description as string) || null,
          status: (meta.status as string) || "open",
          priority: (meta.priority as string) || "normal",
          assigned_to: (meta.assigned_to as string) || null,
          milestone: (meta.milestone as string) || null,
          parent_task: (meta.parent_task as string) || null,
          created_by: (meta.created_by as string) || row.agent,
          notes: (meta.notes as string) || null,
          blocked_reason: (meta.blocked_reason as string) || null,
          ts: row.ts,
        };
      });

      // Apply filters
      if (status) {
        const statuses = status.split(",").map((s) => s.trim());
        tasks = tasks.filter((t) => statuses.includes(t.status));
      } else if (!include_done) {
        tasks = tasks.filter((t) => t.status !== "done");
      }

      if (assigned_to) {
        tasks = tasks.filter((t) =>
          t.assigned_to?.toLowerCase().includes(assigned_to.toLowerCase()),
        );
      }

      if (milestone) {
        tasks = tasks.filter((t) =>
          t.milestone?.toLowerCase().includes(milestone.toLowerCase()),
        );
      }

      // Sort by priority then time
      tasks.sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 2;
        const pb = PRIORITY_ORDER[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return new Date(b.ts).getTime() - new Date(a.ts).getTime();
      });

      if (tasks.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No tasks match the filters." }],
        };
      }

      const lines: string[] = [`${tasks.length} task(s):\n`];
      for (const t of tasks) {
        const assignee = t.assigned_to ? ` -> ${t.assigned_to}` : "";
        const ms = t.milestone ? ` [${t.milestone}]` : "";
        const parent = t.parent_task ? ` (subtask of ${t.parent_task.slice(0, 8)})` : "";
        const blocked = t.blocked_reason ? ` BLOCKED: ${t.blocked_reason}` : "";
        lines.push(`[${t.priority.toUpperCase()}] ${t.status} | ${t.title}${assignee}${ms}${parent}${blocked}`);
        lines.push(`  ID: ${t.id}`);
        if (t.description) lines.push(`  ${t.description.slice(0, 200)}`);
        if (t.notes) lines.push(`  Notes: ${t.notes.slice(0, 150)}`);
        lines.push("");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_pick_task",
    "[COORDINATION] Claim an open task for yourself. Updates status to 'claimed' and auto-creates a work claim for conflict detection. Fails if task is already claimed.",
    {
      task_id: z.string().describe("ID of the task to claim"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ task_id }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "id,metadata,content",
        id: `eq.${task_id}`,
        fold_id: `eq.${ctx.foldId}`,
        message_type: "eq.task",
        limit: "1",
      });

      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: `Task not found: ${task_id}` }],
        };
      }

      const meta = (rows[0].metadata ?? {}) as Record<string, unknown>;
      const status = meta.status as string;

      if (status !== "open") {
        const assignee = (meta.assigned_to as string) || "unknown";
        return {
          content: [{
            type: "text" as const,
            text: `Task is already ${status}${status === "claimed" || status === "in_progress" ? ` by ${assignee}` : ""}. Pick an open task instead.`,
          }],
        };
      }

      // Update task status
      await db.update("memories", { id: `eq.${task_id}` }, {
        metadata: {
          ...meta,
          status: "claimed",
          assigned_to: ctx.agent,
          claimed_at: new Date().toISOString(),
        },
      });

      // Auto-create a work claim for conflict detection
      const title = (meta.title as string) || "";
      await db.insert("memories", {
        fold_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        message_type: "resource",
        content: `CLAIM: ${title}`,
        token_count: estimateTokens(title),
        metadata: {
          event: "claim",
          scope: title,
          files: [],
          user: ctx.user,
          task_id,
        },
      });

      return {
        content: [{
          type: "text" as const,
          text: `Claimed task: ${title}\nID: ${task_id}\nStatus: claimed\n\nStart working and call eywa_update_task with status=in_progress when you begin.`,
        }],
      };
    },
  );

  server.tool(
    "eywa_update_task",
    "[CONTEXT] Update a task's status, add notes, or change assignment. If marking done with a milestone set, consider updating destination progress.",
    {
      task_id: z.string().describe("ID of the task to update"),
      status: z.enum(["open", "claimed", "in_progress", "done", "blocked"]).optional().describe("New status"),
      notes: z.string().optional().describe("Add notes about progress or blockers"),
      blocked_reason: z.string().optional().describe("Why the task is blocked (required when status=blocked)"),
      assigned_to: z.string().optional().describe("Reassign to another agent/user"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ task_id, status, notes, blocked_reason, assigned_to }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "id,metadata,content",
        id: `eq.${task_id}`,
        fold_id: `eq.${ctx.foldId}`,
        message_type: "eq.task",
        limit: "1",
      });

      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: `Task not found: ${task_id}` }],
        };
      }

      const meta = (rows[0].metadata ?? {}) as Record<string, unknown>;
      const updates: Record<string, unknown> = { ...meta };

      if (status) updates.status = status;
      if (notes) {
        const existing = (meta.notes as string) || "";
        updates.notes = existing ? `${existing}\n[${new Date().toISOString()}] ${notes}` : notes;
      }
      if (blocked_reason) updates.blocked_reason = blocked_reason;
      if (assigned_to !== undefined) updates.assigned_to = assigned_to;
      if (status === "done") updates.completed_at = new Date().toISOString();
      if (status === "in_progress" && !meta.claimed_at) {
        updates.claimed_at = new Date().toISOString();
        if (!meta.assigned_to) updates.assigned_to = ctx.agent;
      }

      await db.update("memories", { id: `eq.${task_id}` }, {
        metadata: updates,
      });

      const title = (meta.title as string) || "";
      const newStatus = (updates.status as string) || (meta.status as string);
      const milestone = meta.milestone as string | null;

      const lines: string[] = [`Updated task: ${title}`, `Status: ${newStatus}`];
      if (notes) lines.push(`Notes: ${notes}`);
      if (blocked_reason) lines.push(`Blocked: ${blocked_reason}`);

      if (status === "done" && milestone) {
        lines.push(`\nThis task was linked to milestone "${milestone}". Consider updating destination progress with eywa_destination action=update.`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_subtask",
    "[CONTEXT] Break a task into subtasks. Creates child tasks linked to the parent via parent_task. The parent task's description and milestone are inherited by default.",
    {
      parent_task: z.string().describe("ID of the parent task to break down"),
      subtasks: z.array(z.object({
        title: z.string().describe("Subtask title"),
        description: z.string().optional().describe("Subtask description"),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        assigned_to: z.string().optional(),
      })).describe("List of subtasks to create"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ parent_task, subtasks }) => {
      // Verify parent exists
      const parentRows = await db.select<MemoryRow>("memories", {
        select: "id,metadata",
        id: `eq.${parent_task}`,
        fold_id: `eq.${ctx.foldId}`,
        message_type: "eq.task",
        limit: "1",
      });

      if (parentRows.length === 0) {
        return {
          content: [{ type: "text" as const, text: `Parent task not found: ${parent_task}` }],
        };
      }

      const parentMeta = (parentRows[0].metadata ?? {}) as Record<string, unknown>;
      const parentMilestone = (parentMeta.milestone as string) || null;
      const parentTitle = (parentMeta.title as string) || "";

      const created: string[] = [];

      for (const sub of subtasks) {
        const rows = await db.insert<MemoryRow>("memories", {
          fold_id: ctx.foldId,
          agent: ctx.agent,
          session_id: ctx.sessionId,
          message_type: "task",
          content: `TASK: ${sub.title}${sub.description ? ` - ${sub.description}` : ""}`,
          token_count: estimateTokens(sub.title + (sub.description || "")),
          metadata: {
            event: "task",
            status: sub.assigned_to ? "claimed" : "open",
            title: sub.title,
            description: sub.description ?? null,
            priority: sub.priority ?? parentMeta.priority ?? "normal",
            assigned_to: sub.assigned_to ?? null,
            parent_task,
            milestone: parentMilestone,
            created_by: ctx.agent,
            claimed_at: sub.assigned_to ? new Date().toISOString() : null,
            completed_at: null,
            blocked_reason: null,
            notes: null,
          },
        });

        created.push(`  ${sub.title} (ID: ${rows[0]?.id})`);
      }

      return {
        content: [{
          type: "text" as const,
          text: `Created ${created.length} subtask(s) under "${parentTitle}":\n${created.join("\n")}`,
        }],
      };
    },
  );

  server.tool(
    "eywa_available",
    "[COORDINATION] Pre-flight check: which tasks are actually available to pick up? Cross-references open tasks against active claims to find uncontested work. Call this before eywa_pick_task to avoid wasting context on conflicts.",
    {
      priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Only show tasks at this priority or higher"),
      milestone: z.string().optional().describe("Filter by milestone"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ priority, milestone }) => {
      // Fetch all active tasks
      const rows = await db.select<MemoryRow>("memories", {
        select: "id,agent,metadata,ts",
        fold_id: `eq.${ctx.foldId}`,
        message_type: "eq.task",
        order: "ts.desc",
        limit: "100",
      });

      let tasks = rows
        .map((row) => {
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          return {
            id: row.id,
            title: (meta.title as string) || "",
            description: (meta.description as string) || null,
            status: (meta.status as string) || "open",
            priority: (meta.priority as string) || "normal",
            assigned_to: (meta.assigned_to as string) || null,
            milestone: (meta.milestone as string) || null,
          };
        })
        .filter((t) => t.status === "open");

      // Apply priority filter
      if (priority) {
        const minLevel = PRIORITY_ORDER[priority] ?? 2;
        tasks = tasks.filter((t) => (PRIORITY_ORDER[t.priority] ?? 2) <= minLevel);
      }

      // Apply milestone filter
      if (milestone) {
        tasks = tasks.filter((t) =>
          t.milestone?.toLowerCase().includes(milestone.toLowerCase()),
        );
      }

      if (tasks.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No open tasks match filters." }],
        };
      }

      // Fetch active claims to cross-reference
      const activeClaims = await getActiveClaims(db, ctx.foldId, ctx.agent);

      // Score each task for availability
      const available: Array<{
        id: string;
        title: string;
        priority: string;
        milestone: string | null;
        conflict: string | null;
      }> = [];

      for (const task of tasks) {
        const taskWords = extractWords(task.title + " " + (task.description || ""));
        let conflict: string | null = null;

        for (const claim of activeClaims) {
          const claimWords = extractWords(claim.scope);
          const similarity = wordSimilarity(taskWords, claimWords);
          if (similarity > 0.25) {
            const short = claim.agent.includes("/") ? claim.agent.split("/").pop()! : claim.agent;
            conflict = `${short} working on similar scope (${Math.round(similarity * 100)}% overlap)`;
            break;
          }
        }

        available.push({
          id: task.id,
          title: task.title,
          priority: task.priority,
          milestone: task.milestone,
          conflict,
        });
      }

      // Sort: uncontested first, then by priority
      available.sort((a, b) => {
        // Uncontested tasks first
        if (!a.conflict && b.conflict) return -1;
        if (a.conflict && !b.conflict) return 1;
        // Then by priority
        const pa = PRIORITY_ORDER[a.priority] ?? 2;
        const pb = PRIORITY_ORDER[b.priority] ?? 2;
        return pa - pb;
      });

      const lines: string[] = [`${available.length} open task(s):\n`];
      let uncontestedCount = 0;

      for (const t of available) {
        const ms = t.milestone ? ` [${t.milestone}]` : "";
        if (t.conflict) {
          lines.push(`  [${t.priority.toUpperCase()}] ${t.title}${ms}`);
          lines.push(`    CONTESTED: ${t.conflict}`);
          lines.push(`    ID: ${t.id}`);
        } else {
          uncontestedCount++;
          lines.push(`  [${t.priority.toUpperCase()}] ${t.title}${ms}`);
          lines.push(`    ID: ${t.id}`);
        }
        lines.push("");
      }

      lines.unshift(`${uncontestedCount} uncontested, ${available.length - uncontestedCount} contested:\n`);

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
