import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../lib/db.js";
import {
  Colors,
  makeEmbed,
  emptyEmbed,
  timeAgo,
  truncate,
  clampDescription,
  statusEmoji,
} from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

const ACTIVE_THRESHOLD = 30 * 60_000; // 30 min

export const data = new SlashCommandBuilder()
  .setName("course")
  .setDescription("Full course overview: destination, progress, active agents, distress");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  // Fetch destination, agent activity, distress, and progress in parallel
  const [destResult, activityResult, distressResult, progressResult] = await Promise.all([
    db()
      .from("memories")
      .select("content,metadata,ts")
      .eq("fold_id", fold.id)
      .eq("message_type", "knowledge")
      .eq("metadata->>event", "destination")
      .order("ts", { ascending: false })
      .limit(1),
    db()
      .from("memories")
      .select("agent,content,metadata,ts")
      .eq("fold_id", fold.id)
      .neq("metadata->>event", "agent_connected")
      .order("ts", { ascending: false })
      .limit(200),
    db()
      .from("memories")
      .select("agent,content,metadata,ts")
      .eq("fold_id", fold.id)
      .eq("metadata->>event", "distress")
      .eq("metadata->>resolved", "false")
      .order("ts", { ascending: false })
      .limit(5),
    db()
      .from("memories")
      .select("agent,metadata,ts")
      .eq("fold_id", fold.id)
      .eq("metadata->>event", "progress")
      .order("ts", { ascending: false })
      .limit(50),
  ]);

  const lines: string[] = [];

  // --- Destination ---
  const destRows = destResult.data ?? [];
  if (destRows.length > 0) {
    const meta = (destRows[0].metadata ?? {}) as Record<string, any>;
    const dest = meta.destination as string;
    const milestones = (meta.milestones as string[]) || [];
    const prog = (meta.progress as Record<string, boolean>) || {};
    const done = milestones.filter((m) => prog[m]).length;
    const total = milestones.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const barLen = 15;
    const filled = Math.round((pct / 100) * barLen);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(barLen - filled);

    lines.push(`\uD83C\uDFAF **${truncate(dest, 200)}**`);
    lines.push(`\`${bar}\` ${pct}% (${done}/${total} milestones)`);
    lines.push("");
  } else {
    lines.push("*No destination set. Use `/destination set` to define point B.*");
    lines.push("");
  }

  // --- Active agents with progress ---
  const now = Date.now();
  const agentMap = new Map<string, { task: string; status: string; ts: string }>();
  for (const row of activityResult.data ?? []) {
    if (agentMap.has(row.agent)) continue;
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const age = now - new Date(row.ts).getTime();
    let status = age < ACTIVE_THRESHOLD ? "active" : "idle";
    let task = truncate(row.content ?? "", 100);

    if (meta.event === "session_start") {
      status = age < ACTIVE_THRESHOLD ? "active" : "idle";
      task = meta.task || task;
    } else if (meta.event === "session_done" || meta.event === "session_end") {
      status = "finished";
      task = meta.summary || task;
    }

    agentMap.set(row.agent, { task, status, ts: row.ts });
  }

  // Latest progress per agent
  const agentProgress = new Map<string, { percent: number; status: string; detail: string }>();
  for (const row of progressResult.data ?? []) {
    if (agentProgress.has(row.agent)) continue;
    const meta = (row.metadata ?? {}) as Record<string, any>;
    agentProgress.set(row.agent, {
      percent: meta.percent ?? 0,
      status: meta.status ?? "working",
      detail: meta.detail ?? "",
    });
  }

  const active = [...agentMap.entries()].filter(([, v]) => v.status === "active");
  if (active.length > 0) {
    lines.push(`**Active agents (${active.length}):**`);
    for (const [name, info] of active.slice(0, 10)) {
      const prog = agentProgress.get(name);
      const progStr = prog ? ` \`${prog.percent}%\`` : "";
      const shortName = name.split("/")[1] || name;
      lines.push(`${statusEmoji("active")} **${shortName}**${progStr} ${truncate(info.task, 80)}`);
    }
    lines.push("");
  }

  // --- Distress ---
  const distressRows = distressResult.data ?? [];
  if (distressRows.length > 0) {
    lines.push(`\u{1F6A8} **Distress signals (${distressRows.length}):**`);
    for (const d of distressRows) {
      const meta = (d.metadata ?? {}) as Record<string, any>;
      const shortName = d.agent.split("/")[1] || d.agent;
      lines.push(`> **${shortName}**: ${truncate((meta.task as string) || "", 100)} (${timeAgo(d.ts)})`);
    }
    lines.push("");
  }

  // --- Stats ---
  const finished = [...agentMap.values()].filter((v) => v.status === "finished").length;
  const idle = [...agentMap.values()].filter((v) => v.status === "idle").length;
  lines.push(`*${active.length} active, ${finished} finished, ${idle} idle*`);

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle("\uD83E\uDDED Course Overview")
        .setDescription(clampDescription(lines))
        .setColor(Colors.BRAND),
    ],
  });
}
