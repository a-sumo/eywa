import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.argv[2]; // optional: pass guild ID for instant deploy

if (!token || !clientId) {
  console.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env");
  process.exit(1);
}

const rest = new REST().setToken(token);
const body = commands.map((c) => c.data.toJSON());

console.log(`Deploying ${body.length} slash commands...`);

try {
  if (guildId) {
    // Guild-specific: instant propagation (great for testing)
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body,
    });
    console.log(
      `Deployed ${body.length} commands to guild ${guildId} (instant).`,
    );
  } else {
    // Global: takes up to 1 hour to propagate
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(`Deployed ${body.length} commands globally.`);
    console.log(
      "Tip: For instant testing, pass your guild ID: npm run deploy -- <guild_id>",
    );
  }
} catch (error) {
  console.error("Failed to deploy commands:", error);
  process.exit(1);
}
