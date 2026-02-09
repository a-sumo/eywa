import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../lib/db.js";
import {
  Colors,
  makeEmbed,
  emptyEmbed,
  statusEmoji,
  timeAgo,
  truncate,
  clampDescription,
} from "../lib/format.js";
import { resolveRoom } from "../lib/rooms.js";

const ACTIVE_THRESHOLD = 30 * 60_000; // 30 min
const RECENT_THRESHOLD = 2 * 60 * 60_000; // 2 hours

export const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("See what all agents are currently working on");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const room = await resolveRoom(interaction.channelId);
  if (!room) {
    await interaction.editReply({
      embeds: [emptyEmbed("No room set. Use `/room set <slug>` first.")],
    });
    return;
  }

  const { data: rows } = await db()
    .from("memories")
    .select("agent,message_type,content,ts,metadata")
    .eq("room_id", room.id)
    .order("ts", { ascending: false });

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No agents found.", room.slug)],
    });
    return;
  }

  const now = Date.now();

  // Build per-agent info from most recent meaningful event
  const agents = new Map<
    string,
    { status: string; desc: string; ts: string; meaningful: boolean; systems: string[] }
  >();

  for (const row of rows) {
    if (agents.has(row.agent)) continue;
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const age = now - new Date(row.ts).getTime();
    let status = "idle";
    let desc = truncate(row.content ?? "", 150);
    let meaningful = false;

    if (meta.event === "session_start") {
      status = age < ACTIVE_THRESHOLD ? "active" : "idle";
      desc = meta.task || desc;
      meaningful = true;
    } else if (
      meta.event === "session_end" ||
      meta.event === "session_done"
    ) {
      status = meta.status || "finished";
      desc = meta.summary || desc;
      meaningful = true;
    } else if (
      meta.event === "knowledge_stored" ||
      meta.event === "context_injection"
    ) {
      meaningful = true;
    } else if (row.message_type === "assistant" || row.message_type === "user") {
      meaningful = true;
    }

    // Skip agents whose only activity is "connected to room"
    if (!meaningful && (row.content ?? "").startsWith("Agent ")) {
      // still register them for the idle count, but mark not meaningful
    }

    // Collect operation metadata across all memories for this agent
    const systems = new Set<string>();
    for (const r of rows!.filter(r => r.agent === row.agent)) {
      const rm = (r.metadata ?? {}) as Record<string, any>;
      if (rm.system) systems.add(rm.system);
    }

    agents.set(row.agent, { status, desc, ts: row.ts, meaningful, systems: [...systems] });
  }

  // Partition into buckets
  const active: [string, typeof agents extends Map<string, infer V> ? V : never][] = [];
  const recent: typeof active = [];
  let idleCount = 0;

  for (const [name, info] of agents) {
    const age = now - new Date(info.ts).getTime();

    if (info.status === "active") {
      active.push([name, info]);
    } else if (info.meaningful && age < RECENT_THRESHOLD) {
      recent.push([name, info]);
    } else {
      idleCount++;
    }
  }

  // Sort each bucket by recency
  const byRecency = (a: [string, { ts: string }], b: [string, { ts: string }]) =>
    new Date(b[1].ts).getTime() - new Date(a[1].ts).getTime();
  active.sort(byRecency);
  recent.sort(byRecency);

  const lines: string[] = [];

  for (const [name, info] of active) {
    const sysTag = info.systems?.length ? `\n> Systems: \`${info.systems.join("` `")}\`` : "";
    lines.push(
      `${statusEmoji("active")} **${name}**\n> ${truncate(info.desc, 120)}${sysTag}\n> *${timeAgo(info.ts)}*`,
    );
  }

  for (const [name, info] of recent) {
    const sysTag = info.systems?.length ? `\n> Systems: \`${info.systems.join("` `")}\`` : "";
    lines.push(
      `${statusEmoji(info.status)} **${name}** \`${info.status}\`\n> ${truncate(info.desc, 100)}${sysTag}\n> *${timeAgo(info.ts)}*`,
    );
  }

  if (idleCount > 0) {
    lines.push(`\n*+${idleCount} idle agent${idleCount !== 1 ? "s" : ""}*`);
  }

  if (!lines.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No active agents.", room.slug)],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      makeEmbed(room.slug)
        .setTitle("\u{1F52E} Agent Status")
        .setDescription(clampDescription(lines))
        .setColor(Colors.BRAND),
    ],
  });
}
