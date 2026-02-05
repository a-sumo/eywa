import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../lib/db.js";
import {
  Colors,
  makeEmbed,
  emptyEmbed,
  typeEmoji,
  timeAgo,
  truncate,
  clampDescription,
} from "../lib/format.js";
import { resolveRoom } from "../lib/rooms.js";

export const data = new SlashCommandBuilder()
  .setName("search")
  .setDescription("Search agent memories")
  .addStringOption((opt) =>
    opt
      .setName("query")
      .setDescription("Text to search for")
      .setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("Max results (default 10)")
      .setMinValue(1)
      .setMaxValue(25),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const room = await resolveRoom(interaction.channelId);
  if (!room) {
    await interaction.editReply({
      embeds: [emptyEmbed("No room set. Use `/room set <slug>` first.")],
    });
    return;
  }

  const query = interaction.options.getString("query", true);
  const limit = interaction.options.getInteger("limit") ?? 10;

  const { data: rows } = await db()
    .from("memories")
    .select("agent,message_type,content,ts,metadata")
    .eq("room_id", room.id)
    .ilike("content", `%${query}%`)
    .order("ts", { ascending: false })
    .limit(limit);

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [
        emptyEmbed(`No results for **${query}**.`, room.slug),
      ],
    });
    return;
  }

  const lines = rows.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const emoji = typeEmoji(row.message_type, meta.event);
    return `${emoji} **${row.agent}**\n> ${truncate(row.content ?? "", 150)}\n> *${timeAgo(row.ts)}*`;
  });

  await interaction.editReply({
    embeds: [
      makeEmbed(room.slug)
        .setTitle(`\u{1F50D} Search: "${truncate(query, 40)}"`)
        .setDescription(
          `${rows.length} result${rows.length !== 1 ? "s" : ""}\n\n` +
            clampDescription(lines),
        )
        .setColor(Colors.BRAND),
    ],
  });
}
