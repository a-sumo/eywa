import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { initDb } from "./lib/db.js";
import { commandMap } from "./commands/index.js";

// ── Validate env ────────────────────────────────────────────────

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "SUPABASE_URL", "SUPABASE_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    console.error("Copy .env.example to .env and fill in the values.");
    process.exit(1);
  }
}

// ── Init ────────────────────────────────────────────────────────

initDb(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ── Ready ───────────────────────────────────────────────────────

client.once(Events.ClientReady, (c) => {
  const line = `Remix Discord Bot | ${c.user.tag} | ${c.guilds.cache.size} server${c.guilds.cache.size !== 1 ? "s" : ""}`;
  console.log();
  console.log(`  \u2554${"═".repeat(line.length + 2)}\u2557`);
  console.log(`  \u2551 ${line} \u2551`);
  console.log(`  \u255A${"═".repeat(line.length + 2)}\u255D`);
  console.log();
  console.log(`  ${commandMap.size} commands registered`);
  console.log(`  Default room: ${process.env.DEFAULT_ROOM ?? "demo"}`);
  console.log();
});

// ── Interactions ────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  // Slash commands
  if (interaction.isChatInputCommand()) {
    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[${interaction.commandName}]`, error);
      const content = "Something went wrong. Check the bot logs.";
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content }).catch(() => {});
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  // Autocomplete
  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`[autocomplete:${interaction.commandName}]`, error);
        await interaction.respond([]).catch(() => {});
      }
    }
  }
});

// ── Start ───────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);
