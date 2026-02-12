import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db, estimateTokens } from "../lib/db.js";
import { Colors, makeEmbed, emptyEmbed } from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

export const data = new SlashCommandBuilder()
  .setName("learn")
  .setDescription("Store knowledge for the team's agents to reference")
  .addStringOption((opt) =>
    opt
      .setName("content")
      .setDescription("The knowledge to store")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("title")
      .setDescription("Short title for quick scanning"),
  )
  .addStringOption((opt) =>
    opt
      .setName("tags")
      .setDescription("Comma-separated tags (e.g. api,convention,gotcha)"),
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

  const content = interaction.options.getString("content", true);
  const title = interaction.options.getString("title");
  const tagsRaw = interaction.options.getString("tags");
  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];
  const sender = `discord/${interaction.user.username}`;

  await db().from("memories").insert({
    fold_id: fold.id,
    agent: sender,
    session_id: `discord_${interaction.user.id}`,
    message_type: "knowledge",
    content: `${title ? `[${title}] ` : ""}${content}`,
    token_count: estimateTokens(content),
    metadata: {
      event: "knowledge_stored",
      tags,
      title: title ?? null,
      stored_by: sender,
      source: "discord",
    },
  });

  const tagStr = tags.length
    ? `\n\`${tags.map((t) => `#${t}`).join(" ")}\``
    : "";

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle("\u{1F4DA} Knowledge Stored")
        .setDescription(
          `${title ? `**${title}**\n` : ""}> ${content}${tagStr}`,
        )
        .setColor(Colors.KNOWLEDGE),
    ],
  });
}
