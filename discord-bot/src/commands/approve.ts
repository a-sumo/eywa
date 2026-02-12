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
import { resolveRoom } from "../lib/rooms.js";

const RISK_EMOJI: Record<string, string> = {
  low: "\u{1F7E2}",       // green
  medium: "\u{1F7E1}",    // yellow
  high: "\u{1F7E0}",      // orange
  critical: "\u{1F534}",  // red
};

const STATUS_EMOJI: Record<string, string> = {
  pending: "\u23F3",     // hourglass
  approved: "\u2705",    // check
  denied: "\u274C",      // cross
};

function riskEmoji(level: string): string {
  return RISK_EMOJI[level] ?? "\u26AA";
}

export const data = new SlashCommandBuilder()
  .setName("approve")
  .setDescription("View and respond to agent approval requests")
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List pending approval requests")
      .addBooleanOption((opt) =>
        opt
          .setName("all")
          .setDescription("Include resolved approvals")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("yes")
      .setDescription("Approve a request")
      .addStringOption((opt) =>
        opt.setName("id").setDescription("Approval ID").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("Optional message to the agent")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("no")
      .setDescription("Deny a request")
      .addStringOption((opt) =>
        opt.setName("id").setDescription("Approval ID").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("reason")
          .setDescription("Reason for denial")
          .setRequired(false),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "list") return listApprovals(interaction);
  if (sub === "yes") return resolveApproval(interaction, "approved");
  if (sub === "no") return resolveApproval(interaction, "denied");
}

async function listApprovals(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const room = await resolveRoom(interaction.channelId);
  if (!room) {
    await interaction.editReply({
      embeds: [emptyEmbed("No room set. Use `/room set <slug>` first.")],
    });
    return;
  }

  const showAll = interaction.options.getBoolean("all") ?? false;

  let query = db()
    .from("memories")
    .select("id,agent,content,metadata,ts")
    .eq("room_id", room.id)
    .eq("message_type", "approval_request")
    .order("ts", { ascending: false })
    .limit(50);

  if (!showAll) {
    query = query.eq("metadata->>status", "pending");
  }

  const { data: rows } = await query;

  if (!rows?.length) {
    const msg = showAll
      ? "No approval requests found."
      : "No pending approval requests.";
    await interaction.editReply({
      embeds: [emptyEmbed(msg, room.slug)],
    });
    return;
  }

  const lines: string[] = [];
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const status = (meta.status as string) || "pending";
    const risk = (meta.risk_level as string) || "medium";
    const action = (meta.action_description as string) || "Unknown action";
    const scope = (meta.scope as string) || null;
    const ctx = (meta.context as string) || null;

    const statusIcon = STATUS_EMOJI[status] ?? "\u26AA";
    const riskIcon = riskEmoji(risk);

    let line =
      `${statusIcon} **${truncate(action, 120)}**\n` +
      `> \`${(row.id as string).slice(0, 8)}\` ${riskIcon} ${risk} risk, by **${row.agent}**`;

    if (scope) line += `\n> Scope: ${truncate(scope, 100)}`;
    if (ctx) line += `\n> Context: ${truncate(ctx, 100)}`;

    if (status === "approved" || status === "denied") {
      const resolvedBy = (meta.resolved_by as string) || "unknown";
      const responseMsg = (meta.response_message as string) || "";
      line += `\n> ${status === "approved" ? "Approved" : "Denied"} by ${resolvedBy}`;
      if (responseMsg) line += `: ${truncate(responseMsg, 80)}`;
    }

    line += `\n> *${timeAgo(row.ts as string)}*`;
    lines.push(line);
  }

  const title = showAll
    ? `Approvals (${rows.length})`
    : `Pending Approvals (${rows.length})`;

  await interaction.editReply({
    embeds: [
      makeEmbed(room.slug)
        .setTitle(`\u{1F6E1}\uFE0F ${title}`)
        .setDescription(clampDescription(lines))
        .setColor(Colors.BRAND),
    ],
  });
}

async function resolveApproval(
  interaction: ChatInputCommandInteraction,
  decision: "approved" | "denied",
) {
  await interaction.deferReply();
  const room = await resolveRoom(interaction.channelId);
  if (!room) {
    await interaction.editReply({
      embeds: [emptyEmbed("No room set. Use `/room set <slug>` first.")],
    });
    return;
  }

  const approvalId = interaction.options.getString("id", true);
  const message =
    interaction.options.getString("message") ??
    interaction.options.getString("reason") ??
    null;
  const resolvedBy = `discord/${interaction.user.username}`;

  // Find the approval - support partial ID matching
  let query = db()
    .from("memories")
    .select("id,agent,metadata,content")
    .eq("room_id", room.id)
    .eq("message_type", "approval_request");

  if (approvalId.length < 36) {
    query = query.ilike("id", `${approvalId}%`);
  } else {
    query = query.eq("id", approvalId);
  }

  const { data: rows } = await query.limit(5);

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [
        makeEmbed(room.slug)
          .setDescription(`Approval request not found: \`${approvalId}\``)
          .setColor(Colors.WARNING),
      ],
    });
    return;
  }

  if (rows.length > 1) {
    const matches = rows.map((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      return `\`${(r.id as string).slice(0, 8)}\` ${truncate((m.action_description as string) || "unknown", 60)}`;
    });
    await interaction.editReply({
      embeds: [
        makeEmbed(room.slug)
          .setDescription(
            `Multiple matches for \`${approvalId}\`:\n${matches.join("\n")}\n\nProvide a more specific ID.`,
          )
          .setColor(Colors.WARNING),
      ],
    });
    return;
  }

  const row = rows[0];
  const meta = (row.metadata ?? {}) as Record<string, unknown>;

  // Check if already resolved
  if (meta.status !== "pending") {
    await interaction.editReply({
      embeds: [
        makeEmbed(room.slug)
          .setDescription(
            `This request was already **${meta.status}** by ${(meta.resolved_by as string) || "unknown"}.`,
          )
          .setColor(Colors.WARNING),
      ],
    });
    return;
  }

  // Update the approval
  const updatedMeta = {
    ...meta,
    status: decision,
    resolved_by: resolvedBy,
    resolved_at: new Date().toISOString(),
    response_message: message ?? "",
  };

  await db()
    .from("memories")
    .update({ metadata: updatedMeta })
    .eq("id", row.id);

  // Also inject notification to the requesting agent so they see it
  const action = (meta.action_description as string) || "Unknown action";
  const notifContent =
    decision === "approved"
      ? `APPROVED by ${resolvedBy}: ${action}${message ? `. ${message}` : ". Proceed."}`
      : `DENIED by ${resolvedBy}: ${action}${message ? `. Reason: ${message}` : ". Do NOT proceed."}`;

  await db().from("memories").insert({
    room_id: room.id,
    agent: resolvedBy,
    message_type: "injection",
    content: notifContent,
    token_count: Math.floor(notifContent.length / 4),
    metadata: {
      event: "context_injection",
      target: row.agent,
      label: `Approval ${decision}`,
      priority: "high",
    },
  });

  const emoji = decision === "approved" ? "\u2705" : "\u274C";
  const verb = decision === "approved" ? "Approved" : "Denied";
  const color = decision === "approved" ? Colors.SUCCESS : Colors.ERROR;

  await interaction.editReply({
    embeds: [
      makeEmbed(room.slug)
        .setTitle(`${emoji} ${verb}`)
        .setDescription(
          `**${truncate(action, 120)}**\n\n` +
            `ID: \`${(row.id as string).slice(0, 8)}\`\n` +
            `Agent: ${row.agent}\n` +
            `${verb} by: ${resolvedBy}\n` +
            (message ? `Message: ${truncate(message, 200)}\n` : "") +
            `\nThe agent will see this on their next tool call.`,
        )
        .setColor(color),
    ],
  });
}
