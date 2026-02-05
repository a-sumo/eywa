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
  .setName("context")
  .setDescription("See recent activity across all agents")
  .addIntegerOption((opt) =>
    opt
      .setName("count")
      .setDescription("Number of entries (default 10)")
      .setMinValue(1)
      .setMaxValue(30),
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

  const count = interaction.options.getInteger("count") ?? 10;

  const { data: rows } = await db()
    .from("memories")
    .select("agent,message_type,content,ts,metadata")
    .eq("room_id", room.id)
    .order("ts", { ascending: false })
    .limit(count);

  if (!rows?.length) {
    await interaction.editReply({
      embeds: [emptyEmbed("No activity yet.", room.slug)],
    });
    return;
  }

  const lines = rows.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const emoji = typeEmoji(row.message_type, meta.event);
    const content = row.content ?? "";

    // Special formatting for session events
    if (meta.event === "session_start") {
      return `${emoji} **${row.agent}** started a session\n> ${truncate(meta.task || content, 120)}\n> *${timeAgo(row.ts)}*`;
    }
    if (meta.event === "session_end" || meta.event === "session_done") {
      return `${emoji} **${row.agent}** ended session\n> ${truncate(meta.summary || content, 120)}\n> *${timeAgo(row.ts)}*`;
    }

    return `${emoji} **${row.agent}** \`${row.message_type}\`\n> ${truncate(content, 120)}\n> *${timeAgo(row.ts)}*`;
  });

  await interaction.editReply({
    embeds: [
      makeEmbed(room.slug)
        .setTitle("\u{1F4DC} Timeline")
        .setDescription(clampDescription(lines))
        .setColor(Colors.BRAND),
    ],
  });
}
