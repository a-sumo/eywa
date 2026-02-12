import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { Colors, makeEmbed } from "../lib/format.js";
import {
  resolveFold,
  bindFold,
  listFolds,
  currentBinding,
} from "../lib/folds.js";

export const data = new SlashCommandBuilder()
  .setName("fold")
  .setDescription("Manage which Eywa fold this channel is connected to")
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Bind this channel to an Eywa fold")
      .addStringOption((opt) =>
        opt
          .setName("slug")
          .setDescription("Fold slug (e.g. demo, hackathon)")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("info").setDescription("Show current fold binding"),
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all available folds"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const slug = interaction.options.getString("slug", true).toLowerCase();
    await interaction.deferReply();

    const fold = await bindFold(interaction.channelId, slug);
    if (!fold) {
      await interaction.editReply({
        embeds: [
          makeEmbed()
            .setDescription(
              `Fold \`${slug}\` not found. Use \`/fold list\` to see available folds.`,
            )
            .setColor(Colors.ERROR),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        makeEmbed(fold.slug)
          .setTitle("\u{1F517} Fold Bound")
          .setDescription(
            `This channel is now connected to **${fold.name}** (\`/${fold.slug}\`).\n\nAll commands in this channel will query this fold.`,
          )
          .setColor(Colors.SUCCESS),
      ],
    });
    return;
  }

  if (sub === "info") {
    await interaction.deferReply();
    const fold = await resolveFold(interaction.channelId);
    const explicit = currentBinding(interaction.channelId);

    if (!fold) {
      await interaction.editReply({
        embeds: [
          makeEmbed()
            .setDescription("No fold bound and default fold not found.")
            .setColor(Colors.WARNING),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        makeEmbed(fold.slug)
          .setTitle("\u{1F3E0} Current Fold")
          .setDescription(
            `**${fold.name}**\nSlug: \`/${fold.slug}\`\nID: \`${fold.id}\`` +
              (explicit
                ? "\n\n*Explicitly bound to this channel.*"
                : "\n\n*Using default fold. Use `/fold set` to bind.*"),
          )
          .setColor(Colors.BRAND),
      ],
    });
    return;
  }

  if (sub === "list") {
    await interaction.deferReply();
    const folds = await listFolds();

    if (!folds.length) {
      await interaction.editReply({
        embeds: [
          makeEmbed()
            .setDescription("No folds found.")
            .setColor(Colors.MUTED),
        ],
      });
      return;
    }

    const lines = folds.map(
      (r) =>
        `\`/${r.slug}\` **${r.name}**${r.is_demo ? " *(demo)*" : ""}`,
    );

    await interaction.editReply({
      embeds: [
        makeEmbed()
          .setTitle("\u{1F4CB} Available Folds")
          .setDescription(lines.join("\n"))
          .setColor(Colors.BRAND),
      ],
    });
  }
}
