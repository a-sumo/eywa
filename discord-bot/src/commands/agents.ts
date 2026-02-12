import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db, type Memory } from "../lib/db.js";
import { Colors, makeEmbed, emptyEmbed, timeAgo } from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

export const data = new SlashCommandBuilder()
  .setName("agents")
  .setDescription("List all agents that have logged to this fold");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  const { data: rows } = await db()
    .from("memories")
    .select("agent,ts")
    .eq("fold_id", fold.id)
    .order("ts", { ascending: false });

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No agents found.", fold.slug)],
    });
    return;
  }

  // Deduplicate, keeping first (most recent) ts per agent
  const agents = new Map<string, string>();
  for (const row of rows) {
    if (!agents.has(row.agent)) {
      agents.set(row.agent, row.ts);
    }
  }

  // Count memories per agent
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.agent, (counts.get(row.agent) ?? 0) + 1);
  }

  const lines = [...agents.entries()].map(
    ([name, ts]) =>
      `\u{1F916} **${name}**\n> ${counts.get(name)} memories, last seen ${timeAgo(ts)}`,
  );

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle(`\u{1F465} Agents (${agents.size})`)
        .setDescription(lines.join("\n\n"))
        .setColor(Colors.BRAND),
    ],
  });
}
