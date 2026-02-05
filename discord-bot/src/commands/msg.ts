import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../lib/db.js";
import { Colors, makeEmbed, emptyEmbed } from "../lib/format.js";
import { resolveRoom } from "../lib/rooms.js";

export const data = new SlashCommandBuilder()
  .setName("msg")
  .setDescription("Send a message to the Remix team chat")
  .addStringOption((opt) =>
    opt
      .setName("text")
      .setDescription("Message to send")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Chat channel (default: general)"),
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

  const text = interaction.options.getString("text", true);
  const channel = interaction.options.getString("channel") ?? "general";
  const sender = `discord/${interaction.user.username}`;

  await db().from("messages").insert({
    room_id: room.id,
    sender,
    channel,
    content: text,
    metadata: { source: "discord", discord_user: interaction.user.username },
  });

  await interaction.editReply({
    embeds: [
      makeEmbed(room.slug)
        .setTitle("\u{1F4AC} Message Sent")
        .setDescription(`**#${channel}**\n> ${text}`)
        .setColor(Colors.INFO)
        .setAuthor({ name: sender }),
    ],
  });
}
