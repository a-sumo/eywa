#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { exec } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Baked-in credentials (public Supabase project) ─────

const SUPABASE_URL = "https://beknjtxysmznenkotjvv.snapcloud.dev";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJla25qdHh5c216bmVua290anZ2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjEzNjM1NiwiZXhwIjoyMDgxNzEyMzU2fQ.Pp6DrVfZs2_XvbobCm0hLSCxpfxoK-SvVzgduFIcp_Q";

const MCP_BASE = "https://remix-mcp.armandsumo.workers.dev/mcp";
const DASHBOARD_BASE = "https://remix-memory.vercel.app/r";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Local state (~/.eywa/config.json) ──────────────────

const CONFIG_DIR = join(homedir(), ".eywa");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE))
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {}
  return {};
}

function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

// ── ANSI helpers ───────────────────────────────────────

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const magenta = (s) => `\x1b[35m${s}\x1b[0m`;

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${url}"`);
}

// ── Room helpers ───────────────────────────────────────

const ADJECTIVES = [
  "cosmic", "lunar", "solar", "stellar", "quantum", "neural",
  "astral", "swift", "bright", "deep", "calm", "bold",
];
const NOUNS = [
  "fox", "owl", "wolf", "hawk", "bear", "lynx",
  "raven", "oak", "pine", "elm", "reef", "peak",
];

function randomSlug() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const code = Math.random().toString(36).substring(2, 6);
  return `${adj}-${noun}-${code}`;
}

async function findRoom(slug) {
  const { data, error } = await supabase
    .from("rooms")
    .select("id,name,slug")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function resolveRoom(slugArg) {
  const slug = slugArg || loadConfig().room;
  if (!slug) {
    console.error(
      `No room specified. Run ${bold("eywa init")} to create one, or pass a room slug.`
    );
    process.exit(1);
  }
  const room = await findRoom(slug);
  if (!room) {
    console.error(`Room not found: ${slug}`);
    process.exit(1);
  }
  return room;
}

// ── MCP config generators ──────────────────────────────

function mcpUrl(slug, agent) {
  return `${MCP_BASE}?room=${slug}&agent=${agent}`;
}

function printConfigs(slug, teamName) {
  const url = (agent) => mcpUrl(slug, agent);

  console.log(bold("\n  Add to your agent's MCP config:\n"));

  // Claude Code
  console.log(cyan("  Claude Code") + dim(" (run in terminal):"));
  console.log(
    `    ${dim("$")} claude mcp add --transport http eywa "${url("claude/{your-name}")}"`,
  );
  console.log();

  // Cursor
  console.log(cyan("  Cursor") + dim(" (.cursor/mcp.json):"));
  console.log(dim("    {"));
  console.log(dim("      \"mcpServers\": {"));
  console.log(dim("        \"eywa\": {"));
  console.log(dim(`          "url": "${url("cursor/{your-name}")}"`));
  console.log(dim("        }"));
  console.log(dim("      }"));
  console.log(dim("    }"));
  console.log();

  // Windsurf
  console.log(cyan("  Windsurf") + dim(" (~/.codeium/windsurf/mcp_config.json):"));
  console.log(dim("    {"));
  console.log(dim("      \"mcpServers\": {"));
  console.log(dim("        \"eywa\": {"));
  console.log(dim(`          "serverUrl": "${url("windsurf/{your-name}")}"`));
  console.log(dim("        }"));
  console.log(dim("      }"));
  console.log(dim("    }"));
  console.log();

  // Gemini CLI
  console.log(cyan("  Gemini CLI") + dim(" (~/.gemini/settings.json):"));
  console.log(dim("    {"));
  console.log(dim("      \"mcpServers\": {"));
  console.log(dim("        \"eywa\": {"));
  console.log(dim(`          "httpUrl": "${url("gemini/{your-name}")}"`));
  console.log(dim("        }"));
  console.log(dim("      }"));
  console.log(dim("    }"));
  console.log();

  // Cline
  console.log(cyan("  Cline") + dim(" (VS Code MCP settings):"));
  console.log(dim("    {"));
  console.log(dim("      \"mcpServers\": {"));
  console.log(dim("        \"eywa\": {"));
  console.log(dim(`          "url": "${url("cline/{your-name}")}"`));
  console.log(dim("        }"));
  console.log(dim("      }"));
  console.log(dim("    }"));
  console.log();

  // Codex
  console.log(cyan("  Codex / OpenAI CLI") + dim(" (~/.codex/config.json):"));
  console.log(dim("    {"));
  console.log(dim("      \"mcpServers\": {"));
  console.log(dim("        \"eywa\": {"));
  console.log(dim(`          "url": "${url("codex/{your-name}")}"`));
  console.log(dim("        }"));
  console.log(dim("      }"));
  console.log(dim("    }"));
  console.log();
}

// ── Commands ───────────────────────────────────────────

async function cmdInit(nameArg) {
  const slug = nameArg
    ? nameArg
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    : randomSlug();

  const displayName = nameArg || slug;

  // Check if room exists
  const existing = await findRoom(slug);

  if (existing) {
    console.log(
      `\n  ${yellow("Room already exists:")} ${bold(existing.name)} ${dim("/" + slug)}`,
    );
  } else {
    const { error } = await supabase
      .from("rooms")
      .insert({ slug, name: displayName, is_demo: false })
      .select()
      .single();

    if (error) {
      console.error(red("Failed to create room:"), error.message);
      process.exit(1);
    }

    console.log(`\n  ${green("Room created:")} ${bold(displayName)} ${dim("/" + slug)}`);
  }

  // Save as default room
  saveConfig({ ...loadConfig(), room: slug });

  const dashUrl = `${DASHBOARD_BASE}/${slug}`;
  console.log(`\n  ${bold("Dashboard:")} ${cyan(dashUrl)}`);

  printConfigs(slug, displayName);

  console.log(
    dim("  Replace {your-name} with your name (e.g. alice, bob)."),
  );
  console.log(
    dim("  Each person uses their own name so Eywa can tell agents apart.\n"),
  );

  // Open dashboard
  openBrowser(dashUrl);
}

async function cmdJoin(slugArg) {
  if (!slugArg) {
    console.error(`Usage: ${bold("eywa join <room-slug>")}`);
    process.exit(1);
  }

  const room = await findRoom(slugArg);
  if (!room) {
    console.error(`Room not found: ${slugArg}`);
    console.error(`Run ${bold("eywa init " + slugArg)} to create it.`);
    process.exit(1);
  }

  // Save as default room
  saveConfig({ ...loadConfig(), room: room.slug });

  console.log(`\n  ${green("Joined:")} ${bold(room.name)} ${dim("/" + room.slug)}`);

  const dashUrl = `${DASHBOARD_BASE}/${room.slug}`;
  console.log(`  ${bold("Dashboard:")} ${cyan(dashUrl)}`);

  printConfigs(room.slug, room.name);

  console.log(
    dim("  Replace {your-name} with your name (e.g. alice, bob).\n"),
  );
}

async function cmdStatus(slugArg) {
  const room = await resolveRoom(slugArg);
  console.log(`\n  ${bold("Eywa")} ${dim("/" + room.slug)}\n`);

  const { data: rows } = await supabase
    .from("memories")
    .select("agent,content,ts,metadata")
    .eq("room_id", room.id)
    .order("ts", { ascending: false });

  if (!rows?.length) {
    console.log(dim("  No activity yet. Connect an agent to get started.\n"));
    return;
  }

  // Build agent status map
  const agents = new Map();
  for (const row of rows) {
    if (agents.has(row.agent)) continue;
    const meta = row.metadata ?? {};
    let status = "idle";
    let desc = (row.content ?? "").slice(0, 100);
    if (meta.event === "session_start") {
      status = "active";
      desc = meta.task || desc;
    } else if (meta.event === "session_done") {
      status = meta.status || "done";
      desc = meta.summary || desc;
    } else if (meta.event === "session_end") {
      status = "finished";
      desc = meta.summary || desc;
    }
    agents.set(row.agent, { status, desc, ts: row.ts });
  }

  for (const [name, info] of agents) {
    const badge =
      info.status === "active"
        ? green("● active")
        : info.status === "completed" || info.status === "finished"
          ? cyan("✓ done")
          : info.status === "blocked"
            ? yellow("◉ blocked")
            : info.status === "failed"
              ? red("✗ failed")
              : dim("○ idle");
    console.log(`  ${bold(name)}  ${badge}  ${dim(timeAgo(info.ts))}`);
    console.log(`    ${dim(info.desc)}`);
    console.log();
  }

  console.log(
    dim(`  Dashboard: ${DASHBOARD_BASE}/${room.slug}\n`),
  );
}

async function cmdLog(slugArg, limit = 30) {
  const room = await resolveRoom(slugArg);

  const { data: rows } = await supabase
    .from("memories")
    .select("agent,message_type,content,ts,metadata")
    .eq("room_id", room.id)
    .order("ts", { ascending: false })
    .limit(limit);

  if (!rows?.length) {
    console.log(dim("  No activity yet.\n"));
    return;
  }

  console.log(`\n  ${bold("Recent activity")} ${dim("/" + room.slug)}\n`);

  for (const m of [...rows].reverse()) {
    const meta = m.metadata ?? {};
    const event = meta.event || m.message_type;
    const time = m.ts.slice(11, 19);
    console.log(`  ${dim(time)} ${bold(m.agent)} ${cyan(`[${event}]`)}`);
    console.log(`    ${dim((m.content ?? "").slice(0, 200))}`);
    console.log();
  }
}

async function cmdInject(slugArg, target, message) {
  const room = await resolveRoom(slugArg);
  const fromAgent = `cli/${process.env.USER || "user"}`;

  const { error } = await supabase.from("memories").insert({
    room_id: room.id,
    agent: fromAgent,
    session_id: `cli_${Date.now()}`,
    message_type: "injection",
    content: `[INJECT -> ${target}]: ${message}`,
    token_count: Math.floor(message.length / 4),
    metadata: {
      event: "context_injection",
      from_agent: fromAgent,
      target_agent: target,
      priority: "normal",
      label: null,
    },
  });

  if (error) {
    console.error(red("Failed to inject:"), error.message);
    process.exit(1);
  }
  console.log(green(`  ✓ Injected context for ${target}`));
}

async function cmdDashboard(slugArg) {
  const room = await resolveRoom(slugArg);
  const url = `${DASHBOARD_BASE}/${room.slug}`;
  console.log(`\n  Opening ${cyan(url)}\n`);
  openBrowser(url);
}

// ── CLI Router ─────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function banner() {
  console.log(`
  ${magenta("◆")} ${bold("eywa")} ${dim("- shared memory for AI agent swarms")}
`);
}

function usage() {
  banner();
  console.log(`${bold("  Quick start:")}
    ${cyan("npx eywa init my-hackathon")}    Create a room and get MCP configs
    ${cyan("npx eywa join cosmic-fox-a1b2")} Join an existing room

${bold("  Commands:")}
    init [name]               Create a new room (opens dashboard)
    join <room-slug>          Join an existing room
    status [room]             Show agent status
    log [room] [limit]        Recent activity feed
    inject <target> <msg>     Send context to an agent
    dashboard [room]          Open the web dashboard
    help                      Show this help

${bold("  Examples:")}
    ${dim("$")} npx eywa init                         ${dim("# random room name")}
    ${dim("$")} npx eywa init my-team                  ${dim("# named room")}
    ${dim("$")} npx eywa status                        ${dim("# check your agents")}
    ${dim("$")} npx eywa inject agent-beta "use REST"  ${dim("# push context")}

  ${dim("Docs: https://github.com/ArmandSumo/remix")}
`);
}

(async () => {
  try {
    switch (command) {
      case "init":
        await cmdInit(args[1]);
        break;

      case "join":
        await cmdJoin(args[1]);
        break;

      case "status":
        await cmdStatus(args[1]);
        break;

      case "log":
        await cmdLog(args[1], parseInt(args[2]) || 30);
        break;

      case "inject": {
        if (!args[1] || !args[2]) {
          console.error(
            `Usage: ${bold("eywa inject <target-agent> <message>")}`,
          );
          process.exit(1);
        }
        await cmdInject(null, args[1], args.slice(2).join(" "));
        break;
      }

      case "dashboard":
      case "dash":
      case "open":
        await cmdDashboard(args[1]);
        break;

      case "help":
      case "--help":
      case "-h":
        usage();
        break;

      default:
        if (command) console.error(`  Unknown command: ${command}\n`);
        usage();
        process.exit(command ? 1 : 0);
    }
  } catch (err) {
    console.error(red("Error:"), err.message);
    process.exit(1);
  }
})();
