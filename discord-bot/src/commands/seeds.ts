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
} from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

const SILENCE_WARN_MS = 10 * 60_000;
const SILENCE_HIGH_MS = 30 * 60_000;
const SILENCE_CRIT_MS = 60 * 60_000;

export const data = new SlashCommandBuilder()
  .setName("seeds")
  .setDescription("Seed health: active count, success rate, throughput, stalled seeds");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  // Fetch recent memories (last 4 hours for broader seed picture)
  const windowHours = 4;
  const since = new Date(Date.now() - windowHours * 60 * 60_000).toISOString();
  const { data: rows } = await db()
    .from("memories")
    .select("agent,content,ts,metadata,session_id")
    .eq("fold_id", fold.id)
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(3000);

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No recent activity (last 4 hours).", fold.slug)],
    });
    return;
  }

  const now = Date.now();

  // Filter to seed agents only (autonomous/*)
  const seedRows = rows.filter((r) => r.agent.startsWith("autonomous/"));

  if (seedRows.length === 0) {
    await interaction.editReply({
      embeds: [emptyEmbed("No seed agents active in the last 4 hours.", fold.slug)],
    });
    return;
  }

  // Build per-seed data
  interface SeedInfo {
    status: "active" | "finished" | "idle";
    task: string;
    lastSeen: number;
    firstSeen: number;
    opCount: number;
    successCount: number;
    failCount: number;
    sessions: Set<string>;
    silenceMs: number;
  }

  const seeds = new Map<string, SeedInfo>();

  for (const row of seedRows) {
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const ts = new Date(row.ts).getTime();

    if (!seeds.has(row.agent)) {
      const event = meta.event ?? "";
      let status: SeedInfo["status"] = "idle";
      let task = (row.content ?? "").slice(0, 100);

      if (event === "session_start") {
        status = "active";
        task = meta.task || task;
      } else if (event === "session_end" || event === "session_done") {
        status = "finished";
        task = meta.summary || task;
      }

      seeds.set(row.agent, {
        status,
        task,
        lastSeen: ts,
        firstSeen: ts,
        opCount: 0,
        successCount: 0,
        failCount: 0,
        sessions: new Set(),
        silenceMs: now - ts,
      });
    }

    const info = seeds.get(row.agent)!;
    if (ts < info.firstSeen) info.firstSeen = ts;
    if (row.session_id) info.sessions.add(row.session_id);

    if (meta.action || meta.outcome) {
      info.opCount++;
      if (meta.outcome === "success") info.successCount++;
      if (meta.outcome === "failure") info.failCount++;
    }
  }

  // Compute aggregates
  let totalOps = 0;
  let totalSuccess = 0;
  let totalFail = 0;
  let totalSessions = 0;
  let activeCount = 0;
  let finishedCount = 0;
  let stalledCount = 0;
  const activeSeedList: Array<{ name: string; task: string; silenceMs: number; ops: number; successRate: number }> = [];
  const stalledList: Array<{ name: string; silenceMs: number }> = [];

  for (const [name, info] of seeds) {
    totalOps += info.opCount;
    totalSuccess += info.successCount;
    totalFail += info.failCount;
    totalSessions += info.sessions.size;

    if (info.status === "active") {
      if (info.silenceMs >= SILENCE_HIGH_MS) {
        stalledCount++;
        stalledList.push({ name, silenceMs: info.silenceMs });
      } else {
        activeCount++;
      }
      const successRate = info.opCount > 0
        ? Math.round((info.successCount / info.opCount) * 100)
        : 0;
      activeSeedList.push({
        name,
        task: info.task.slice(0, 60),
        silenceMs: info.silenceMs,
        ops: info.opCount,
        successRate,
      });
    } else if (info.status === "finished") {
      finishedCount++;
    }
  }

  const overallSuccessRate = totalOps > 0 ? Math.round((totalSuccess / totalOps) * 100) : 0;
  const throughput = Math.round(totalOps / windowHours);
  const efficiency = totalSessions > 0 ? Math.round(totalOps / totalSessions) : 0;

  // Sort active seeds: stalled first, then by ops desc
  activeSeedList.sort((a, b) => {
    const aStalled = a.silenceMs >= SILENCE_HIGH_MS ? 1 : 0;
    const bStalled = b.silenceMs >= SILENCE_HIGH_MS ? 1 : 0;
    if (aStalled !== bStalled) return bStalled - aStalled;
    return b.ops - a.ops;
  });

  stalledList.sort((a, b) => b.silenceMs - a.silenceMs);

  const lines: string[] = [];

  // Summary
  lines.push("**Seed Health** (last 4h)");
  const healthEmoji = stalledCount > activeCount ? "\u{1F534}" : activeCount > 0 ? "\u{1F7E2}" : "\u{1F7E1}";
  lines.push([
    `${healthEmoji} **${activeCount}** active, **${stalledCount}** stalled, **${finishedCount}** finished`,
    `\u2705 Success rate: **${overallSuccessRate}%** (${totalSuccess}/${totalOps} ops)`,
    `\u{1F4CA} Throughput: **${throughput} ops/hr**`,
    `\u26A1 Efficiency: **${efficiency} ops/session** (${totalSessions} sessions)`,
    `\u{1F331} Total seeds: **${seeds.size}**`,
  ].join("\n"));
  lines.push("");

  // Stalled seeds (silence > 30min)
  if (stalledList.length > 0) {
    lines.push("**Stalled seeds** (silent 30m+):");
    for (const s of stalledList.slice(0, 8)) {
      const shortName = s.name.split("/")[1] || s.name;
      const silenceMin = Math.floor(s.silenceMs / 60_000);
      const silenceLabel = silenceMin >= 60
        ? `${Math.floor(silenceMin / 60)}h ${silenceMin % 60}m`
        : `${silenceMin}m`;
      const pill = s.silenceMs >= SILENCE_CRIT_MS ? "\u{1F534}" : "\u{1F7E0}";
      lines.push(`${pill} **${shortName}** silent ${silenceLabel}`);
    }
    if (stalledList.length > 8) {
      lines.push(`*+${stalledList.length - 8} more stalled*`);
    }
    lines.push("");
  }

  // Active seeds
  const truelyActive = activeSeedList.filter((s) => s.silenceMs < SILENCE_HIGH_MS);
  if (truelyActive.length > 0) {
    lines.push("**Active seeds:**");
    for (const s of truelyActive.slice(0, 8)) {
      const shortName = s.name.split("/")[1] || s.name;
      const silenceMin = Math.floor(s.silenceMs / 60_000);
      const silencePill = s.silenceMs >= SILENCE_WARN_MS ? ` \u{1F7E1}${silenceMin}m` : "";
      lines.push(`\u{1F7E2} **${shortName}** ${s.ops} ops, ${s.successRate}% ok${silencePill}`);
    }
    if (truelyActive.length > 8) {
      lines.push(`*+${truelyActive.length - 8} more active*`);
    }
    lines.push("");
  }

  // Health assessment
  if (totalFail > totalSuccess * 0.3) {
    lines.push("*\u26A0\uFE0F High failure rate. Check agent logs for errors.*");
  }
  if (stalledCount > activeCount && activeCount > 0) {
    lines.push("*\u26A0\uFE0F More seeds stalled than active. Consider restarting stalled sessions.*");
  }

  const embedColor = stalledCount > activeCount
    ? Colors.ERROR
    : activeCount > 0
      ? Colors.SUCCESS
      : Colors.WARNING;

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle("\u{1F331} Seed Health")
        .setDescription(clampDescription(lines))
        .setColor(embedColor),
    ],
  });
}
