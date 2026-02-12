import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db, estimateTokens } from "../lib/db.js";
import {
  Colors,
  makeEmbed,
  emptyEmbed,
  timeAgo,
  truncate,
} from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

export const data = new SlashCommandBuilder()
  .setName("destination")
  .setDescription("View or set the fold destination (point B)")
  .addSubcommand((sub) =>
    sub.setName("view").setDescription("View the current destination and progress"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set a new destination for the fold")
      .addStringOption((opt) =>
        opt
          .setName("target")
          .setDescription("The target state (what does done look like?)")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("milestones")
          .setDescription("Comma-separated milestones on the route"),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("check")
      .setDescription("Mark a milestone as done")
      .addStringOption((opt) =>
        opt
          .setName("milestone")
          .setDescription("Name of the milestone to mark done")
          .setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.editReply({
      embeds: [emptyEmbed("No fold set. Use `/fold set <slug>` first.")],
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "view") {
    const { data: rows } = await db()
      .from("memories")
      .select("agent,content,ts,metadata")
      .eq("fold_id", fold.id)
      .eq("message_type", "knowledge")
      .eq("metadata->>event", "destination")
      .order("ts", { ascending: false })
      .limit(1);

    if (!rows?.length) {
      await interaction.editReply({
        embeds: [emptyEmbed("No destination set. Use `/destination set` to define point B.", fold.slug)],
      });
      return;
    }

    const meta = (rows[0].metadata ?? {}) as Record<string, any>;
    const dest = meta.destination as string;
    const milestones = (meta.milestones as string[]) || [];
    const progress = (meta.progress as Record<string, boolean>) || {};
    const notes = meta.notes as string | null;
    const setBy = meta.set_by as string;

    const done = milestones.filter((m) => progress[m]).length;
    const total = milestones.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Build progress bar
    const barLen = 20;
    const filled = Math.round((pct / 100) * barLen);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(barLen - filled);

    const lines: string[] = [
      `**${truncate(dest, 300)}**`,
      "",
      `\`${bar}\` ${pct}% (${done}/${total})`,
    ];

    if (milestones.length > 0) {
      lines.push("");
      for (const m of milestones) {
        lines.push(progress[m] ? `\u2705 ~~${m}~~` : `\u2B1C ${m}`);
      }
    }

    if (notes) {
      lines.push("", `> ${truncate(notes, 200)}`);
    }

    lines.push("", `*Set by ${setBy}, ${timeAgo(rows[0].ts)}*`);

    await interaction.editReply({
      embeds: [
        makeEmbed(fold.slug)
          .setTitle("\uD83C\uDFAF Destination")
          .setDescription(lines.join("\n"))
          .setColor(Colors.BRAND),
      ],
    });
    return;
  }

  if (sub === "set") {
    const target = interaction.options.getString("target", true);
    const milestonesStr = interaction.options.getString("milestones");
    const milestones = milestonesStr
      ? milestonesStr.split(",").map((m) => m.trim()).filter(Boolean)
      : [];

    const initialProgress: Record<string, boolean> = {};
    for (const m of milestones) {
      initialProgress[m] = false;
    }

    const sender = `discord/${interaction.user.username}`;
    await db().from("memories").insert({
      fold_id: fold.id,
      agent: sender,
      session_id: `discord_${interaction.user.id}`,
      message_type: "knowledge",
      content: `DESTINATION: ${target}`,
      token_count: estimateTokens(target),
      metadata: {
        event: "destination",
        destination: target,
        milestones,
        progress: initialProgress,
        notes: null,
        set_by: sender,
      },
    });

    const msText = milestones.length
      ? `\n\n**Milestones:**\n${milestones.map((m) => `\u2B1C ${m}`).join("\n")}`
      : "";

    await interaction.editReply({
      embeds: [
        makeEmbed(fold.slug)
          .setTitle("\uD83C\uDFAF Destination Set")
          .setDescription(`**${truncate(target, 300)}**${msText}`)
          .setColor(Colors.SUCCESS),
      ],
    });
    return;
  }

  if (sub === "check") {
    const milestone = interaction.options.getString("milestone", true);

    // Fetch current destination
    const { data: rows } = await db()
      .from("memories")
      .select("id,agent,content,ts,metadata")
      .eq("fold_id", fold.id)
      .eq("message_type", "knowledge")
      .eq("metadata->>event", "destination")
      .order("ts", { ascending: false })
      .limit(1);

    if (!rows?.length) {
      await interaction.editReply({
        embeds: [emptyEmbed("No destination set.", fold.slug)],
      });
      return;
    }

    const meta = (rows[0].metadata ?? {}) as Record<string, any>;
    const milestones = (meta.milestones as string[]) || [];
    const progress = { ...(meta.progress as Record<string, boolean>) };

    // Fuzzy match milestone name
    const match = milestones.find(
      (m) => m.toLowerCase().includes(milestone.toLowerCase()),
    );

    if (!match) {
      await interaction.editReply({
        embeds: [
          emptyEmbed(
            `No milestone matching "${milestone}". Available: ${milestones.join(", ")}`,
            fold.slug,
          ),
        ],
      });
      return;
    }

    progress[match] = true;
    const sender = `discord/${interaction.user.username}`;

    // Insert updated destination (append-only)
    await db().from("memories").insert({
      fold_id: fold.id,
      agent: sender,
      session_id: `discord_${interaction.user.id}`,
      message_type: "knowledge",
      content: `DESTINATION: ${meta.destination}`,
      token_count: estimateTokens(meta.destination),
      metadata: {
        ...meta,
        progress,
        last_updated_by: sender,
      },
    });

    const done = milestones.filter((m) => progress[m]).length;
    const total = milestones.length;
    const pct = Math.round((done / total) * 100);

    await interaction.editReply({
      embeds: [
        makeEmbed(fold.slug)
          .setTitle("\u2705 Milestone Completed")
          .setDescription(`**${match}**\n\nProgress: ${done}/${total} (${pct}%)`)
          .setColor(Colors.SUCCESS),
      ],
    });
  }
}
