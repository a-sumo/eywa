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

export const data = new SlashCommandBuilder()
  .setName("knowledge")
  .setDescription("Browse the project knowledge base")
  .addStringOption((opt) =>
    opt.setName("search").setDescription("Search within knowledge content"),
  )
  .addStringOption((opt) =>
    opt.setName("tag").setDescription("Filter by tag (e.g. architecture, api)"),
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

  const search = interaction.options.getString("search");
  const tag = interaction.options.getString("tag");
  const limit = interaction.options.getInteger("limit") ?? 10;

  let query = db()
    .from("memories")
    .select("id,agent,content,ts,metadata")
    .eq("fold_id", fold.id)
    .eq("message_type", "knowledge")
    .order("ts", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.ilike("content", `%${search}%`);
  }

  const { data: rows } = await query;

  // Client-side tag filter
  const filtered = tag
    ? (rows ?? []).filter((r) => {
        const tags = ((r.metadata as any)?.tags as string[]) ?? [];
        return tags.includes(tag);
      })
    : rows ?? [];

  if (!filtered.length) {
    const filters: string[] = [];
    if (tag) filters.push(`tag="${tag}"`);
    if (search) filters.push(`"${search}"`);
    await interaction.editReply({
      embeds: [
        emptyEmbed(
          filters.length
            ? `No knowledge entries matching ${filters.join(" + ")}.`
            : "Knowledge base is empty. Use `/learn` to add entries.",
          fold.slug,
        ),
      ],
    });
    return;
  }

  const lines = filtered.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const title = meta.title as string | null;
    const tags = (meta.tags as string[]) ?? [];
    const storedBy = (meta.stored_by as string) ?? row.agent;
    const content =
      row.content?.replace(/^\[[^\]]*\]\s*/, "").slice(0, 200) ?? "";
    const tagStr = tags.length
      ? `\n> \`${tags.map((t: string) => `#${t}`).join(" ")}\``
      : "";

    return (
      `\u{1F4DA} ${title ? `**${title}**` : "*untitled*"}\n` +
      `> ${truncate(content, 180)}${tagStr}\n` +
      `> *${storedBy}, ${timeAgo(row.ts)}*`
    );
  });

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle(`\u{1F4DA} Knowledge Base (${filtered.length})`)
        .setDescription(clampDescription(lines))
        .setColor(Colors.KNOWLEDGE),
    ],
  });
}
