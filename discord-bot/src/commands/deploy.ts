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

const OUTCOME_EMOJI: Record<string, string> = {
  success: "\u2705",
  failure: "\u274C",
  blocked: "\u{1F7E1}",
  in_progress: "\u23F3",
};

const SCOPE_EMOJI: Record<string, string> = {
  worker: "\u2601\uFE0F",
  web: "\u{1F310}",
};

export const data = new SlashCommandBuilder()
  .setName("deploy")
  .setDescription("View deployment health and recent deploys")
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List recent deployments")
      .addIntegerOption((opt) =>
        opt
          .setName("limit")
          .setDescription("Number of deploys to show (default 10)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("health")
      .setDescription("Aggregate deployment health stats"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "list") return listDeploys(interaction);
  if (sub === "health") return deployHealth(interaction);
}

async function listDeploys(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  const limit = interaction.options.getInteger("limit") ?? 10;

  const { data: rows } = await db()
    .from("memories")
    .select("id,agent,content,metadata,ts")
    .eq("fold_id", fold.id)
    .eq("metadata->>system", "deploy")
    .eq("metadata->>action", "deploy")
    .order("ts", { ascending: false })
    .limit(Math.min(limit, 25));

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No deployments found.", fold.slug)],
    });
    return;
  }

  const lines: string[] = [];
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const outcome = (meta.outcome as string) || "unknown";
    const scope = (meta.scope as string) || "unknown";
    const outcomeIcon = OUTCOME_EMOJI[outcome] ?? "\u26AA";
    const scopeIcon = SCOPE_EMOJI[scope] ?? "\u{1F4E6}";
    const shortAgent = (row.agent as string).split("/")[1] || row.agent;
    const content = truncate((row.content as string) || "", 120);

    lines.push(
      `${outcomeIcon} ${scopeIcon} **${scope}** - ${outcome}\n` +
        `> by **${shortAgent}** ${timeAgo(row.ts as string)}\n` +
        (content ? `> ${content}` : ""),
    );
  }

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle(`\u{1F680} Recent Deploys (${rows.length})`)
        .setDescription(clampDescription(lines))
        .setColor(Colors.SUCCESS),
    ],
  });
}

async function deployHealth(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  // Fetch all deploys in last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await db()
    .from("memories")
    .select("agent,metadata,ts")
    .eq("fold_id", fold.id)
    .eq("metadata->>system", "deploy")
    .eq("metadata->>action", "deploy")
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(200);

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No deployments in the last 24 hours.", fold.slug)],
    });
    return;
  }

  // Aggregate stats
  let successCount = 0;
  let failCount = 0;
  const scopeStats = new Map<string, { success: number; fail: number; lastTs: string }>();
  const agentDeploys = new Map<string, number>();

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const outcome = (meta.outcome as string) || "unknown";
    const scope = (meta.scope as string) || "unknown";
    const agent = (row.agent as string).split("/")[1] || row.agent;

    if (outcome === "success") successCount++;
    else if (outcome === "failure") failCount++;

    const s = scopeStats.get(scope) || { success: 0, fail: 0, lastTs: row.ts as string };
    if (outcome === "success") s.success++;
    else if (outcome === "failure") s.fail++;
    if (!scopeStats.has(scope)) scopeStats.set(scope, s);

    agentDeploys.set(agent, (agentDeploys.get(agent) || 0) + 1);
  }

  const total = rows.length;
  const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;
  const statusIcon = failCount === 0 ? "\u2705" : successRate >= 80 ? "\u{1F7E1}" : "\u274C";

  // Build per-scope lines
  const scopeLines: string[] = [];
  for (const [scope, stats] of scopeStats) {
    const icon = SCOPE_EMOJI[scope] ?? "\u{1F4E6}";
    const rate = stats.success + stats.fail > 0
      ? Math.round((stats.success / (stats.success + stats.fail)) * 100)
      : 100;
    scopeLines.push(
      `${icon} **${scope}**: ${stats.success} ok, ${stats.fail} fail (${rate}%) - last ${timeAgo(stats.lastTs)}`,
    );
  }

  // Top deployers
  const topDeployers = Array.from(agentDeploys.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([agent, count]) => `**${agent}**: ${count}`)
    .join(", ");

  const description = [
    `${statusIcon} **${successRate}% success rate** (${successCount}/${total} in 24h)`,
    "",
    "**By target:**",
    ...scopeLines,
    "",
    `**Top deployers:** ${topDeployers}`,
  ].join("\n");

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle("\u{1F680} Deploy Health (24h)")
        .setDescription(description)
        .setColor(failCount === 0 ? Colors.SUCCESS : successRate >= 80 ? Colors.WARNING : Colors.ERROR),
    ],
  });
}
