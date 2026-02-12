import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { db, getAgentNames, estimateTokens } from "../lib/db.js";
import { Colors, makeEmbed, emptyEmbed, priorityLabel } from "../lib/format.js";
import { resolveFold } from "../lib/folds.js";

export const data = new SlashCommandBuilder()
  .setName("inject")
  .setDescription("Send context or instructions to an agent")
  .addStringOption((opt) =>
    opt
      .setName("target")
      .setDescription("Agent name, user prefix, or 'all' for broadcast")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("message")
      .setDescription("The context or instructions to send")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("priority")
      .setDescription("Priority level")
      .addChoices(
        { name: "Normal", value: "normal" },
        { name: "\u26A0\uFE0F High", value: "high" },
        { name: "\u{1F6A8} Urgent", value: "urgent" },
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName("label")
      .setDescription("Short label (e.g. 'bug report', 'feature request')"),
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

  const target = interaction.options.getString("target", true);
  const message = interaction.options.getString("message", true);
  const priority = interaction.options.getString("priority") ?? "normal";
  const label = interaction.options.getString("label");
  const sender = `discord/${interaction.user.username}`;

  await db().from("memories").insert({
    fold_id: fold.id,
    agent: sender,
    session_id: `discord_${interaction.user.id}`,
    message_type: "injection",
    content: `[INJECT \u2192 ${target}]${label ? ` (${label})` : ""}: ${message}`,
    token_count: estimateTokens(message),
    metadata: {
      event: "context_injection",
      from_agent: sender,
      target_agent: target,
      priority,
      label: label ?? null,
      source: "discord",
    },
  });

  const targetLabel = target === "all" ? "all agents" : `**${target}**`;

  await interaction.editReply({
    embeds: [
      makeEmbed(fold.slug)
        .setTitle("\u{1F489} Injection Sent")
        .setDescription(
          `Sent to ${targetLabel}${priorityLabel(priority)}${label ? ` *${label}*` : ""}\n\n> ${message}`,
        )
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

  // Include "all" as an option, plus all agent names
  const options = ["all", ...agents];
  const filtered = options
    .filter((a) => a.toLowerCase().includes(focused))
    .slice(0, 25);

  await interaction.respond(
    filtered.map((a) => ({ name: a, value: a })),
  );
}
