import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { Colors, makeEmbed } from "../lib/format.js";
import {
  resolveRoom,
  bindRoom,
  listRooms,
  currentBinding,
} from "../lib/rooms.js";

export const data = new SlashCommandBuilder()
  .setName("room")
  .setDescription("Manage which Eywa room this channel is connected to")
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Bind this channel to an Eywa room")
      .addStringOption((opt) =>
        opt
          .setName("slug")
          .setDescription("Room slug (e.g. demo, hackathon)")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("info").setDescription("Show current room binding"),
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all available rooms"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const slug = interaction.options.getString("slug", true).toLowerCase();
    await interaction.deferReply();

    const room = await bindRoom(interaction.channelId, slug);
    if (!room) {
      await interaction.editReply({
        embeds: [
          makeEmbed()
            .setDescription(
              `Room \`${slug}\` not found. Use \`/room list\` to see available rooms.`,
            )
            .setColor(Colors.ERROR),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        makeEmbed(room.slug)
          .setTitle("\u{1F517} Room Bound")
          .setDescription(
            `This channel is now connected to **${room.name}** (\`/${room.slug}\`).\n\nAll commands in this channel will query this room.`,
          )
          .setColor(Colors.SUCCESS),
      ],
    });
    return;
  }

  if (sub === "info") {
    await interaction.deferReply();
    const room = await resolveRoom(interaction.channelId);
    const explicit = currentBinding(interaction.channelId);

    if (!room) {
      await interaction.editReply({
        embeds: [
          makeEmbed()
            .setDescription("No room bound and default room not found.")
            .setColor(Colors.WARNING),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        makeEmbed(room.slug)
          .setTitle("\u{1F3E0} Current Room")
          .setDescription(
            `**${room.name}**\nSlug: \`/${room.slug}\`\nID: \`${room.id}\`` +
              (explicit
                ? "\n\n*Explicitly bound to this channel.*"
                : "\n\n*Using default room. Use `/room set` to bind.*"),
          )
          .setColor(Colors.BRAND),
      ],
    });
    return;
  }

  if (sub === "list") {
    await interaction.deferReply();
    const rooms = await listRooms();

    if (!rooms.length) {
      await interaction.editReply({
        embeds: [
          makeEmbed()
            .setDescription("No rooms found.")
            .setColor(Colors.MUTED),
        ],
      });
      return;
    }

    const lines = rooms.map(
      (r) =>
        `\`/${r.slug}\` **${r.name}**${r.is_demo ? " *(demo)*" : ""}`,
    );

    await interaction.editReply({
      embeds: [
        makeEmbed()
          .setTitle("\u{1F4CB} Available Rooms")
          .setDescription(lines.join("\n"))
          .setColor(Colors.BRAND),
      ],
    });
  }
}
