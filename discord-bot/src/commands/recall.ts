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
  typeEmoji,
  timeAgo,
  truncate,
  clampDescription,
} from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

export const data = new SlashCommandBuilder()
  .setName("recall")
  .setDescription("View a specific agent's recent activity")
  .addStringOption((opt) =>
    opt
      .setName("agent")
      .setDescription("Agent name")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("count")
      .setDescription("Number of entries (default 15)")
      .setMinValue(1)
      .setMaxValue(30),
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

  const agent = interaction.options.getString("agent", true);
  const count = interaction.options.getInteger("count") ?? 15;

  const { data: rows } = await db()
    .from("memories")
    .select("message_type,content,ts,metadata")
    .eq("fold_id", fold.id)
    .eq("agent", agent)
    .order("ts", { ascending: false })
    .limit(count);

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [
        emptyEmbed(`No memories from **${agent}**.`, fold.slug),
      ],
    });
    return;
  }

  const lines = rows.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const emoji = typeEmoji(row.message_type, meta.event);
    const label = meta.event || row.message_type || "unknown";
    const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
    const opTag = opParts.length ? ` \`${opParts.join(":")}\`` : "";
    return `${emoji} \`${label}\`${opTag} *${timeAgo(row.ts)}*\n> ${truncate(row.content ?? "", 150)}`;
  });

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle(`\u{1F9E0} ${agent}`)
        .setDescription(
          `${rows.length} memor${rows.length !== 1 ? "ies" : "y"}\n\n` +
            clampDescription(lines),
        )
        .setColor(Colors.BRAND),
    ],
  });
}

export async function autocomplete(interaction: AutocompleteInteraction) {
  const fold = await resolveFold(interaction.channelId);
  if (!fold) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const agents = await getAgentNames(fold.id);
  const filtered = agents
    .filter((a) => a.toLowerCase().includes(focused))
    .slice(0, 25);

  await interaction.respond(
    filtered.map((a) => ({ name: a, value: a })),
  );
}
