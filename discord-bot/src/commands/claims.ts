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
} from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

const CLAIM_MAX_AGE = 2 * 60 * 60_000; // 2 hours

export const data = new SlashCommandBuilder()
  .setName("claims")
  .setDescription("View active work claims (who's working on what)");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  const twoHoursAgo = new Date(Date.now() - CLAIM_MAX_AGE).toISOString();

  // Fetch recent claims
  const { data: claimRows } = await db()
    .from("memories")
    .select("agent,metadata,ts,session_id")
    .eq("fold_id", fold.id)
    .eq("metadata->>event", "claim")
    .gte("ts", twoHoursAgo)
    .order("ts", { ascending: false })
    .limit(50);

  if (!claimRows?.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No active work claims.", fold.slug)],
    });
    return;
  }

  // Fetch session ends and unclaims to filter out released claims
  const sessionIds = [...new Set(claimRows.map((r) => r.session_id).filter(Boolean))];
  const { data: endRows } = sessionIds.length > 0
    ? await db()
        .from("memories")
        .select("agent,session_id,metadata")
        .eq("fold_id", fold.id)
        .in("session_id", sessionIds)
        .in("metadata->>event", ["session_end", "session_done", "unclaim"])
        .order("ts", { ascending: false })
        .limit(100)
    : { data: [] };

  const endedSessions = new Set<string>();
  const unclaimedAgents = new Set<string>();
  for (const row of (endRows ?? [])) {
    const meta = (row.metadata ?? {}) as Record<string, string>;
    if (meta.event === "unclaim") {
      unclaimedAgents.add(row.agent);
    } else if (row.session_id) {
      endedSessions.add(row.session_id);
    }
  }

  // Dedupe: keep latest claim per agent, skip ended/unclaimed
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const row of claimRows) {
    if (seen.has(row.agent)) continue;
    if (row.session_id && endedSessions.has(row.session_id)) continue;
    if (unclaimedAgents.has(row.agent)) continue;
    seen.add(row.agent);

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const scope = (meta.scope as string) || "unknown";
    const files = (meta.files as string[]) || [];
    const filesStr = files.length > 0 ? `\n> Files: \`${files.slice(0, 5).join("` `")}\`${files.length > 5 ? ` +${files.length - 5} more` : ""}` : "";

    lines.push(
      `\u{1F3F7}\uFE0F **${row.agent}**\n> ${truncate(scope, 150)}${filesStr}\n> *${timeAgo(row.ts)}*`,
    );
  }

  if (!lines.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No active work claims.", fold.slug)],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle(`\u{1F3F7}\uFE0F Active Claims (${lines.length})`)
        .setDescription(clampDescription(lines))
        .setColor(Colors.BRAND),
    ],
  });
}
