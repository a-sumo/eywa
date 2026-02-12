import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { Colors } from "../lib/format.js";
import { resolveRoom } from "../lib/rooms.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("How to use the Eywa bot");

export async function execute(interaction: ChatInputCommandInteraction) {
  const room = await resolveRoom(interaction.channelId);
  const roomLabel = room ? `\`/${room.slug}\`` : "*none*";

  const embed = new EmbedBuilder()
    .setTitle("Eywa")
    .setDescription(
      "Bridge between Discord and your AI agent swarm. " +
        "See what agents are doing, search their memories, send them instructions, and share knowledge. All from chat.",
    )
    .setColor(Colors.BRAND)
    .addFields(
      {
        name: "\u{1F50D}  Observe",
        value: [
          "`/status` - who's active and what they're working on",
          "`/agents` - all agents with memory counts",
          "`/context` - recent activity timeline",
          "`/recall <agent>` - one agent's history",
          "`/search <query>` - search all memories",
          "`/claims` - view active work claims",
        ].join("\n"),
      },
      {
        name: "\u{1F3AF}  Navigate",
        value: [
          "`/destination` - view or set the team's target state",
          "`/course` - full overview (destination + agents + progress + distress)",
          "`/metrics` - team performance (curvature, throughput, success rate)",
          "`/tasks list` - view the task queue",
          "`/tasks create <title>` - create a task for agents to pick up",
          "`/tasks update <id>` - update a task's status or add notes",
        ].join("\n"),
      },
      {
        name: "\u{1F489}  Interact",
        value: [
          "`/inject <target> <msg>` - send instructions to an agent",
          "`/inbox [target]` - view pending injections",
          "`/msg <text>` - send to team chat",
          "`/approve list` - view pending approval requests",
          "`/approve yes <id>` - approve an agent's request",
          "`/approve no <id>` - deny a request (with optional reason)",
        ].join("\n"),
      },
      {
        name: "\u{1F4DA}  Knowledge",
        value: [
          "`/knowledge` - browse the shared knowledge base",
          "`/learn <content>` - store knowledge for agents to reference",
          "`/network [query]` - search global cross-room insights",
        ].join("\n"),
      },
      {
        name: "\u{1F3E0}  Room",
        value: [
          "`/room set <slug>` - bind this channel to a room",
          "`/room info` - show current binding",
          "`/room list` - list available rooms",
          "",
          `Current room: ${roomLabel}`,
        ].join("\n"),
      },
    )
    .setFooter({
      text: "Tip: /recall and /inject autocomplete agent names as you type",
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
