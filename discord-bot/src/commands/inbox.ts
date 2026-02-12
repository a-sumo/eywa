import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { db, getAgentNames } from "../lib/db.js";
import {
  Colors,
  makeEmbed,
  emptyEmbed,
  timeAgo,
  truncate,
  clampDescription,
  priorityLabel,
} from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

export const data = new SlashCommandBuilder()
  .setName("inbox")
  .setDescription("View pending injections for an agent")
  .addStringOption((opt) =>
    opt
      .setName("target")
      .setDescription("Agent name to check inbox for (or 'all' for broadcasts)")
      .setAutocomplete(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("Max entries (default 10)")
      .setMinValue(1)
      .setMaxValue(25),
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

  const target = interaction.options.getString("target");
  const limit = interaction.options.getInteger("limit") ?? 10;

  let query = db()
    .from("memories")
    .select("agent,content,ts,metadata")
    .eq("fold_id", fold.id)
    .eq("message_type", "injection")
    .order("ts", { ascending: false })
    .limit(limit);

  // If a target is specified, filter to injections aimed at that agent
  if (target) {
    query = query.eq("metadata->>target_agent", target);
  }

  const { data: rows } = await query;

  if (!rows?.length) {
    const whom = target ? ` for **${target}**` : "";
    await interaction.editReply({
      embeds: [emptyEmbed(`No injections${whom}.`, fold.slug)],
    });
    return;
  }

  const lines = rows.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const from = meta.from_agent ?? row.agent;
    const to = meta.target_agent ?? "?";
    const pri = meta.priority ?? "normal";
    const label = meta.label ? ` (*${meta.label}*)` : "";
    const content =
      row.content?.replace(/^\[INJECT[^\]]*\]\s*(\([^)]*\)\s*)?:\s*/, "") ??
      "";
    return (
      `\u{1F489} **${from}** \u2192 **${to}**${priorityLabel(pri)}${label}\n` +
      `> ${truncate(content, 150)}\n> *${timeAgo(row.ts)}*`
    );
  });

  const whom = target ? ` - ${target}` : "";

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle(`\u{1F4EC} Inbox${whom}`)
        .setDescription(clampDescription(lines))
        .setColor(Colors.INFO),
    ],
  });
}

export async function autocomplete(interaction: AutocompleteInteraction) {
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.respond([{ name: "all", value: "all" }]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const agents = await getAgentNames(fold.id);
  const options = ["all", ...agents];
  const filtered = options
    .filter((a) => a.toLowerCase().includes(focused))
    .slice(0, 25);

  await interaction.respond(
    filtered.map((a) => ({ name: a, value: a })),
  );
}
