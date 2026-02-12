import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../lib/db.js";
import {
  Colors,
  makeEmbed,
  emptyEmbed,
  truncate,
  clampDescription,
} from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

// Curvature computation (mirrors worker/src/tools/collaboration.ts)
const ACTION_WEIGHTS: Record<string, number> = {
  deploy: 5, create: 4, write: 3, test: 3,
  delete: 2, review: 2, debug: 2, configure: 1.5,
  read: 1, monitor: 0.5,
};
const OUTCOME_MULT: Record<string, number> = {
  success: 1.0, in_progress: 0.5, failure: -1.0, blocked: -2.0,
};
const HIGH_IMPACT_ACTIONS = new Set(["deploy", "create", "write", "test", "delete", "review"]);

function computeCurvature(
  ops: Array<{ action?: string; outcome?: string }>,
  durationMinutes: number,
): number {
  if (ops.length === 0 || durationMinutes <= 0) return 0;
  const mins = Math.max(durationMinutes, 1);

  let weightedSum = 0;
  let failBlockCount = 0;
  let highImpact = 0;

  for (const op of ops) {
    const w = ACTION_WEIGHTS[op.action ?? ""] ?? 0;
    const m = OUTCOME_MULT[op.outcome ?? ""] ?? 0.5;
    weightedSum += w * m;
    if (op.outcome === "failure" || op.outcome === "blocked") failBlockCount++;
    if (HIGH_IMPACT_ACTIONS.has(op.action ?? "")) highImpact++;
  }

  const momentum = weightedSum / mins;
  const drag = failBlockCount / mins;
  const signal = highImpact / Math.max(ops.length, 1);

  return Math.round((momentum - drag) * signal * 100) / 100;
}

const ACTIVE_THRESHOLD = 30 * 60_000; // 30 min

export const data = new SlashCommandBuilder()
  .setName("metrics")
  .setDescription("Team performance: curvature, throughput, success rate, convergence");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  // Fetch recent operations with metadata (last 2 hours)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const { data: rows } = await db()
    .from("memories")
    .select("agent,content,ts,metadata")
    .eq("fold_id", fold.id)
    .gte("ts", twoHoursAgo)
    .order("ts", { ascending: false })
    .limit(2000);

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No recent activity (last 2 hours).", fold.slug)],
    });
    return;
  }

  const now = Date.now();

  // Build per-agent operation data
  const agentOps = new Map<string, {
    ops: Array<{ action?: string; outcome?: string }>;
    firstTs: number;
    lastTs: number;
    successCount: number;
    failCount: number;
    blockedCount: number;
    totalOps: number;
    systems: Set<string>;
    isActive: boolean;
  }>();

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const ts = new Date(row.ts).getTime();

    if (!agentOps.has(row.agent)) {
      const age = now - ts;
      agentOps.set(row.agent, {
        ops: [],
        firstTs: ts,
        lastTs: ts,
        successCount: 0,
        failCount: 0,
        blockedCount: 0,
        totalOps: 0,
        systems: new Set(),
        isActive: meta.event === "session_start" && age < ACTIVE_THRESHOLD,
      });
    }

    const agent = agentOps.get(row.agent)!;
    if (ts < agent.firstTs) agent.firstTs = ts;
    if (ts > agent.lastTs) agent.lastTs = ts;

    if (meta.system) agent.systems.add(meta.system);

    if (meta.action || meta.outcome) {
      agent.ops.push({ action: meta.action, outcome: meta.outcome });
      agent.totalOps++;
      if (meta.outcome === "success") agent.successCount++;
      if (meta.outcome === "failure") agent.failCount++;
      if (meta.outcome === "blocked") agent.blockedCount++;
    }
  }

  // Compute per-agent curvature
  const agentMetrics: Array<{
    name: string;
    kappa: number;
    ops: number;
    successRate: number;
    isActive: boolean;
    systems: string[];
  }> = [];

  let totalOps = 0;
  let totalSuccess = 0;
  let totalFail = 0;
  let totalBlocked = 0;
  let activeCount = 0;

  for (const [name, info] of agentOps) {
    const durationMin = (info.lastTs - info.firstTs) / 60000;
    const kappa = computeCurvature(info.ops, durationMin);
    const successRate = info.totalOps > 0
      ? Math.round((info.successCount / info.totalOps) * 100)
      : 0;

    agentMetrics.push({
      name,
      kappa,
      ops: info.totalOps,
      successRate,
      isActive: info.isActive,
      systems: [...info.systems],
    });

    totalOps += info.totalOps;
    totalSuccess += info.successCount;
    totalFail += info.failCount;
    totalBlocked += info.blockedCount;
    if (info.isActive) activeCount++;
  }

  // Sort by curvature descending
  agentMetrics.sort((a, b) => b.kappa - a.kappa);

  // Team aggregates
  const teamSuccessRate = totalOps > 0 ? Math.round((totalSuccess / totalOps) * 100) : 0;
  const windowHours = 2;
  const throughput = Math.round(totalOps / windowHours);
  const converging = agentMetrics.filter(a => a.kappa > 0 && a.ops > 0).length;
  const diverging = agentMetrics.filter(a => a.kappa < 0).length;
  const stalled = agentMetrics.filter(a => a.kappa === 0 && a.ops === 0).length;
  const withOps = agentMetrics.filter(a => a.ops > 0);
  const teamKappa = withOps.length > 0
    ? Math.round(withOps.reduce((sum, a) => sum + a.kappa, 0) / withOps.length * 100) / 100
    : 0;

  const lines: string[] = [];

  // Team summary
  const kappaEmoji = teamKappa > 0 ? "\u2B06\uFE0F" : teamKappa < 0 ? "\u2B07\uFE0F" : "\u27A1\uFE0F";
  lines.push("**Team Overview** (last 2h)");
  lines.push([
    `${kappaEmoji} Curvature: **\u03BA=${teamKappa}**`,
    `\u{1F4CA} Throughput: **${throughput} ops/hr**`,
    `\u2705 Success rate: **${teamSuccessRate}%**`,
    `\u{1F9EE} Operations: **${totalOps}** (${totalSuccess} ok, ${totalFail} fail, ${totalBlocked} blocked)`,
    `\u{1F465} Agents: **${activeCount}** active, **${agentMetrics.length}** total`,
    `\u{1F3AF} Convergence: **${converging}** converging, **${diverging}** diverging, **${stalled}** stalled`,
  ].join("\n"));
  lines.push("");

  // Top convergers (kappa > 0, sorted by kappa desc)
  const topConvergers = agentMetrics.filter(a => a.kappa > 0).slice(0, 5);
  if (topConvergers.length > 0) {
    lines.push("**Top convergers:**");
    for (const a of topConvergers) {
      const shortName = a.name.split("/")[1] || a.name;
      const activePill = a.isActive ? " \u{1F7E2}" : "";
      const sysStr = a.systems.length > 0 ? ` \`${a.systems.join("` `")}\`` : "";
      lines.push(`\u2B06\uFE0F **${shortName}**${activePill} \u03BA=${a.kappa} (${a.ops} ops, ${a.successRate}% ok)${sysStr}`);
    }
    lines.push("");
  }

  // Diverging agents (kappa < 0)
  const divergers = agentMetrics.filter(a => a.kappa < 0).slice(0, 3);
  if (divergers.length > 0) {
    lines.push("**Needs attention (negative curvature):**");
    for (const a of divergers) {
      const shortName = a.name.split("/")[1] || a.name;
      lines.push(`\u2B07\uFE0F **${shortName}** \u03BA=${a.kappa} (${a.ops} ops, ${a.successRate}% ok)`);
    }
    lines.push("");
  }

  // Active agents with zero curvature (logged but no tagged operations)
  const zeroKappa = agentMetrics.filter(a => a.kappa === 0 && a.isActive && a.ops === 0);
  if (zeroKappa.length > 0) {
    const names = zeroKappa.slice(0, 5).map(a => a.name.split("/")[1] || a.name).join(", ");
    const more = zeroKappa.length > 5 ? ` +${zeroKappa.length - 5} more` : "";
    lines.push(`*Invisible (active but no tagged operations): ${names}${more}*`);
  }

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle("\u{1F4C8} Team Metrics")
        .setDescription(clampDescription(lines))
        .setColor(teamKappa > 0 ? Colors.SUCCESS : teamKappa < 0 ? Colors.ERROR : Colors.WARNING),
    ],
  });
}
