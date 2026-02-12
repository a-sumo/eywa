import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../lib/db.js";
import {
  Colors,
  makeEmbed,
  emptyEmbed,
  clampDescription,
  timeAgo,
  truncate,
} from "../lib/format.js";
import { resolveRoom } from "../lib/rooms.js";

export const data = new SlashCommandBuilder()
  .setName("checkpoints")
  .setDescription("View recent seed checkpoints and distress signals")
  .addStringOption((o) =>
    o
      .setName("filter")
      .setDescription("Filter by type")
      .addChoices(
        { name: "All", value: "all" },
        { name: "Distress only", value: "distress" },
        { name: "Checkpoints only", value: "checkpoint" },
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const room = await resolveRoom(interaction.channelId);
  if (!room) {
    await interaction.editReply({
      embeds: [emptyEmbed("No room set. Use `/room set <slug>` first.")],
    });
    return;
  }

  const filter = interaction.options.getString("filter") ?? "all";
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  // Fetch checkpoints and distress signals from the last 24 hours
  const events =
    filter === "distress"
      ? ["distress"]
      : filter === "checkpoint"
        ? ["checkpoint"]
        : ["checkpoint", "distress"];

  const { data: rows } = await db()
    .from("memories")
    .select("agent,content,ts,metadata")
    .eq("room_id", room.id)
    .gte("ts", since)
    .in("metadata->>event", events)
    .order("ts", { ascending: false })
    .limit(30);

  if (!rows?.length) {
    const label =
      filter === "distress"
        ? "distress signals"
        : filter === "checkpoint"
          ? "checkpoints"
          : "checkpoints or distress signals";
    await interaction.editReply({
      embeds: [emptyEmbed(`No ${label} in the last 24 hours.`, room.slug)],
    });
    return;
  }

  const lines: string[] = [];
  let distressCount = 0;
  let checkpointCount = 0;
  let unresolvedDistress = 0;

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const isDistress = meta.event === "distress";
    const isResolved = meta.resolved === true;

    if (isDistress) {
      distressCount++;
      if (!isResolved) unresolvedDistress++;
    } else {
      checkpointCount++;
    }

    const shortName = row.agent.split("/")[1] || row.agent;
    const ago = timeAgo(row.ts);
    const task = truncate(meta.task || "", 80);
    const done = truncate(meta.done || "", 100);
    const remaining = truncate(meta.remaining || "", 100);

    if (isDistress) {
      const resolvedTag = isResolved ? " \u2705 resolved" : " \u{1F534} **UNRESOLVED**";
      lines.push(
        `\u{1F6A8} **${shortName}**${resolvedTag} (${ago})\n` +
          (task ? `> **Task:** ${task}\n` : "") +
          (done ? `> **Done:** ${done}\n` : "") +
          (remaining ? `> **Remaining:** ${remaining}\n` : "") +
          (meta.relay_to ? `> **Relay to:** ${meta.relay_to}` : ""),
      );
    } else {
      lines.push(
        `\u{1F4BE} **${shortName}** (${ago})\n` +
          (task ? `> **Task:** ${task}\n` : "") +
          (done ? `> **Done:** ${done}\n` : "") +
          (remaining ? `> **Remaining:** ${remaining}` : ""),
      );
    }
  }

  // Summary header
  const summaryParts: string[] = [];
  if (checkpointCount > 0) summaryParts.push(`${checkpointCount} checkpoint${checkpointCount !== 1 ? "s" : ""}`);
  if (distressCount > 0) summaryParts.push(`${distressCount} distress signal${distressCount !== 1 ? "s" : ""}`);
  if (unresolvedDistress > 0) summaryParts.push(`**${unresolvedDistress} unresolved**`);
  const summary = summaryParts.join(", ");

  const embedColor =
    unresolvedDistress > 0
      ? Colors.ERROR
      : distressCount > 0
        ? Colors.WARNING
        : Colors.BRAND;

  const title =
    filter === "distress"
      ? "\u{1F6A8} Distress Signals"
      : filter === "checkpoint"
        ? "\u{1F4BE} Checkpoints"
        : "\u{1F4BE} Checkpoints & Distress";

  await interaction.editReply({
    embeds: [
      makeEmbed(room.slug)
        .setTitle(title)
        .setDescription(clampDescription([`${summary} (last 24h)`, "", ...lines]))
        .setColor(embedColor),
    ],
  });
}
