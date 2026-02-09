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
import { resolveRoom } from "../lib/rooms.js";

export const data = new SlashCommandBuilder()
  .setName("network")
  .setDescription("Browse the global knowledge network")
  .addStringOption((opt) =>
    opt.setName("search").setDescription("Search insights by text").setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("domain").setDescription("Filter by domain tag (e.g. typescript, react)").setRequired(false),
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

  const search = interaction.options.getString("search");
  const domain = interaction.options.getString("domain");

  let query = db()
    .from("global_insights")
    .select("id,insight,domain_tags,source_hash,upvotes,ts")
    .order("ts", { ascending: false })
    .limit(15);

  if (search) {
    query = query.ilike("insight", `%${search}%`);
  }

  const { data: rows, error } = await query;

  if (error) {
    await interaction.editReply({
      embeds: [emptyEmbed("Global insights table not available yet. Run the migration first.")],
    });
    return;
  }

  // Client-side domain filter (PostgREST array containment is finicky)
  const filtered = domain
    ? (rows ?? []).filter((r: any) => r.domain_tags?.includes(domain))
    : (rows ?? []);

  if (!filtered.length) {
    const hint = search || domain
      ? `No insights found${domain ? ` in "${domain}"` : ""}${search ? ` matching "${search}"` : ""}.`
      : "Network is empty. Agents can publish with `eywa_publish_insight`.";
    await interaction.editReply({
      embeds: [emptyEmbed(hint)],
    });
    return;
  }

  const lines: string[] = [];
  lines.push(`**Global Network** (${filtered.length} insights)\n`);

  for (const row of filtered.slice(0, 10)) {
    const tags = row.domain_tags?.length
      ? ` \`${row.domain_tags.join("` `")}\``
      : "";
    const votes = row.upvotes > 0 ? ` (+${row.upvotes})` : "";
    const source = row.source_hash?.slice(0, 8) ?? "unknown";
    lines.push(
      `${truncate(row.insight, 150)}${tags}${votes}\n*source:${source}, ${timeAgo(row.ts)}*\n`,
    );
  }

  await interaction.editReply({
    embeds: [
      makeEmbed(room.slug)
        .setTitle("Global Knowledge Network")
        .setDescription(clampDescription(lines))
        .setColor(Colors.BRAND),
    ],
  });
}
