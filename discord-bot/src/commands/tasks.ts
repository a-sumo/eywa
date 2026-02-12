import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db, estimateTokens } from "../lib/db.js";
import {
  Colors,
  makeEmbed,
  emptyEmbed,
  statusEmoji,
  timeAgo,
  truncate,
  clampDescription,
  priorityLabel,
} from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const ACTIVE_STATUSES = ["open", "claimed", "in_progress", "blocked"];

const STATUS_EMOJI: Record<string, string> = {
  open: "\u{1F7E2}",       // green circle
  claimed: "\u{1F7E1}",    // yellow circle
  in_progress: "\u{1F535}", // blue circle
  done: "\u2705",           // check
  blocked: "\u{1F534}",    // red circle
};

function taskStatusEmoji(status: string): string {
  return STATUS_EMOJI[status] ?? "\u26AA";
}

export const data = new SlashCommandBuilder()
  .setName("tasks")
  .setDescription("View and manage the task queue")
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List tasks in the fold")
      .addStringOption((opt) =>
        opt
          .setName("status")
          .setDescription("Filter: open, claimed, in_progress, blocked, done")
          .setRequired(false),
      )
      .addBooleanOption((opt) =>
        opt
          .setName("include_done")
          .setDescription("Include completed tasks")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Create a new task")
      .addStringOption((opt) =>
        opt.setName("title").setDescription("Task title").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("description")
          .setDescription("Task description")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("priority")
          .setDescription("Priority: low, normal, high, urgent")
          .setRequired(false)
          .addChoices(
            { name: "urgent", value: "urgent" },
            { name: "high", value: "high" },
            { name: "normal", value: "normal" },
            { name: "low", value: "low" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("milestone")
          .setDescription("Link to a destination milestone")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("update")
      .setDescription("Update a task's status or add notes")
      .addStringOption((opt) =>
        opt.setName("id").setDescription("Task ID").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("status")
          .setDescription("New status")
          .setRequired(false)
          .addChoices(
            { name: "open", value: "open" },
            { name: "in_progress", value: "in_progress" },
            { name: "done", value: "done" },
            { name: "blocked", value: "blocked" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("notes")
          .setDescription("Add notes")
          .setRequired(false),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "list") return listTasks(interaction);
  if (sub === "create") return createTask(interaction);
  if (sub === "update") return updateTask(interaction);
}

async function listTasks(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  const statusFilter = interaction.options.getString("status") ?? null;
  const includeDone = interaction.options.getBoolean("include_done") ?? false;

  const { data: rows } = await db()
    .from("memories")
    .select("id,agent,content,metadata,ts")
    .eq("fold_id", fold.id)
    .eq("message_type", "task")
    .order("ts", { ascending: false })
    .limit(100);

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No tasks in this fold.", fold.slug)],
    });
    return;
  }

  let tasks = rows.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      title: (meta.title as string) || "",
      description: (meta.description as string) || null,
      status: (meta.status as string) || "open",
      priority: (meta.priority as string) || "normal",
      assigned_to: (meta.assigned_to as string) || null,
      milestone: (meta.milestone as string) || null,
      parent_task: (meta.parent_task as string) || null,
      notes: (meta.notes as string) || null,
      blocked_reason: (meta.blocked_reason as string) || null,
      ts: row.ts as string,
    };
  });

  // Filter
  if (statusFilter) {
    const statuses = statusFilter.split(",").map((s) => s.trim());
    tasks = tasks.filter((t) => statuses.includes(t.status));
  } else if (!includeDone) {
    tasks = tasks.filter((t) => t.status !== "done");
  }

  // Sort by priority then time
  tasks.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return new Date(b.ts).getTime() - new Date(a.ts).getTime();
  });

  if (!tasks.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No tasks match the filters.", fold.slug)],
    });
    return;
  }

  const lines: string[] = [];
  for (const t of tasks) {
    const emoji = taskStatusEmoji(t.status);
    const pri = priorityLabel(t.priority);
    const assignee = t.assigned_to ? ` \u2192 ${t.assigned_to}` : "";
    const ms = t.milestone ? `\n> Milestone: ${truncate(t.milestone, 60)}` : "";
    const blocked = t.blocked_reason ? `\n> \u{1F6A7} ${truncate(t.blocked_reason, 100)}` : "";
    const desc = t.description ? `\n> ${truncate(t.description, 120)}` : "";

    lines.push(
      `${emoji} **${truncate(t.title, 80)}**${pri}${assignee}\n> \`${t.id.slice(0, 8)}\` \u00B7 ${t.status}${desc}${ms}${blocked}\n> *${timeAgo(t.ts)}*`,
    );
  }

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle(`\u{1F4CB} Tasks (${tasks.length})`)
        .setDescription(clampDescription(lines))
        .setColor(Colors.BRAND),
    ],
  });
}

async function createTask(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  const title = interaction.options.getString("title", true);
  const description = interaction.options.getString("description") ?? null;
  const priority = interaction.options.getString("priority") ?? "normal";
  const milestone = interaction.options.getString("milestone") ?? null;
  const author = `discord/${interaction.user.username}`;

  // Check for duplicates
  const { data: existing } = await db()
    .from("memories")
    .select("id,metadata")
    .eq("fold_id", fold.id)
    .eq("message_type", "task")
    .order("ts", { ascending: false })
    .limit(100);

  for (const row of existing ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (
      ACTIVE_STATUSES.includes(meta.status as string) &&
      (meta.title as string)?.toLowerCase() === title.toLowerCase()
    ) {
      await interaction.editReply({
        embeds: [
          makeEmbed(fold.slug)
            .setDescription(`Duplicate: active task already exists with title "${title}" (ID: \`${(row.id as string).slice(0, 8)}\`)`)
            .setColor(Colors.WARNING),
        ],
      });
      return;
    }
  }

  const { data: inserted } = await db()
    .from("memories")
    .insert({
      fold_id: fold.id,
      agent: author,
      message_type: "task",
      content: `TASK: ${title}${description ? ` - ${description}` : ""}`,
      token_count: estimateTokens(title + (description || "")),
      metadata: {
        event: "task",
        status: "open",
        title,
        description,
        priority,
        assigned_to: null,
        parent_task: null,
        milestone,
        created_by: author,
        claimed_at: null,
        completed_at: null,
        blocked_reason: null,
        notes: null,
      },
    })
    .select("id")
    .single();

  const taskId = inserted?.id ?? "unknown";

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle("\u2705 Task Created")
        .setDescription(
          `**${title}**\n\n` +
          `ID: \`${(taskId as string).slice(0, 8)}\`\n` +
          `Priority: ${priority}${priorityLabel(priority)}\n` +
          (description ? `Description: ${truncate(description, 200)}\n` : "") +
          (milestone ? `Milestone: ${milestone}\n` : "") +
          `Created by: ${author}`
        )
        .setColor(Colors.SUCCESS),
    ],
  });
}

async function updateTask(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  const taskId = interaction.options.getString("id", true);
  const newStatus = interaction.options.getString("status") ?? null;
  const notes = interaction.options.getString("notes") ?? null;

  // Find the task - support partial ID matching
  let filter = db()
    .from("memories")
    .select("id,metadata,content")
    .eq("fold_id", fold.id)
    .eq("message_type", "task");

  if (taskId.length < 36) {
    // Partial ID - use ilike prefix match
    filter = filter.ilike("id", `${taskId}%`);
  } else {
    filter = filter.eq("id", taskId);
  }

  const { data: rows } = await filter.limit(5);

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [
        makeEmbed(fold.slug)
          .setDescription(`Task not found: \`${taskId}\``)
          .setColor(Colors.WARNING),
      ],
    });
    return;
  }

  if (rows.length > 1) {
    const matches = rows.map((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      return `\`${(r.id as string).slice(0, 8)}\` ${m.title}`;
    });
    await interaction.editReply({
      embeds: [
        makeEmbed(fold.slug)
          .setDescription(`Multiple matches for \`${taskId}\`:\n${matches.join("\n")}\n\nProvide a more specific ID.`)
          .setColor(Colors.WARNING),
      ],
    });
    return;
  }

  const row = rows[0];
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = { ...meta };

  if (newStatus) updates.status = newStatus;
  if (notes) {
    const existing = (meta.notes as string) || "";
    updates.notes = existing
      ? `${existing}\n[${new Date().toISOString()}] ${notes}`
      : notes;
  }
  if (newStatus === "done") updates.completed_at = new Date().toISOString();

  await db()
    .from("memories")
    .update({ metadata: updates })
    .eq("id", row.id);

  const title = (meta.title as string) || "Untitled";
  const finalStatus = (updates.status as string) || (meta.status as string);

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle(`${taskStatusEmoji(finalStatus)} Task Updated`)
        .setDescription(
          `**${title}**\n\n` +
          `ID: \`${(row.id as string).slice(0, 8)}\`\n` +
          `Status: ${finalStatus}\n` +
          (notes ? `Notes: ${truncate(notes, 200)}\n` : "")
        )
        .setColor(newStatus === "done" ? Colors.SUCCESS : Colors.BRAND),
    ],
  });
}
