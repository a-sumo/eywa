#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { exec } from "node:child_process";

// ── Config file (~/.remix/config.json) ──────────────────

const CONFIG_DIR = join(homedir(), ".remix");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

// ── Early help/login check (no env vars needed) ─────────

const earlyCmd = process.argv[2];
if (!earlyCmd || earlyCmd === "help" || earlyCmd === "--help" || earlyCmd === "-h" || earlyCmd === "login") {
  globalThis.__skipInit = true;
}

// ── Config resolution: config file → env vars ───────────

const savedConfig = loadConfig();
const SUPABASE_URL = process.env.REMIX_SUPABASE_URL || process.env.VITE_SUPABASE_URL || savedConfig.supabaseUrl;
const SUPABASE_KEY = process.env.REMIX_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || savedConfig.supabaseKey;
const DEFAULT_ROOM = savedConfig.room || null;

let supabase;
if (!globalThis.__skipInit) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      "Not logged in. Run " + bold("remix login") + " first.\n" +
      "Or set REMIX_SUPABASE_URL and REMIX_SUPABASE_KEY."
    );
    process.exit(1);
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ── Helpers ─────────────────────────────────────────────

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }

async function resolveRoom(slugArg) {
  const slug = slugArg || DEFAULT_ROOM;
  if (!slug) {
    console.error("No room specified. Run " + bold("remix login") + " or pass a room slug.");
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("rooms")
    .select("id,name,slug")
    .eq("slug", slug)
    .limit(1)
    .single();

  if (error || !data) {
    console.error(`Room not found: ${slug}`);
    process.exit(1);
  }
  return data;
}

// ── Commands ────────────────────────────────────────────

async function cmdStatus(roomSlug) {
  const room = await resolveRoom(roomSlug);
  console.log(bold(`\n  Remix · ${room.name} /${room.slug}\n`));

  const { data: rows } = await supabase
    .from("memories")
    .select("agent,content,ts,metadata")
    .eq("room_id", room.id)
    .order("ts", { ascending: false });

  if (!rows?.length) {
    console.log(dim("  No activity yet.\n"));
    return;
  }

  const agents = new Map();
  for (const row of rows) {
    if (agents.has(row.agent)) continue;
    const meta = row.metadata ?? {};
    let status = "idle";
    let desc = (row.content ?? "").slice(0, 100);
    if (meta.event === "session_start") { status = "active"; desc = meta.task || desc; }
    else if (meta.event === "session_done") { status = meta.status || "done"; desc = meta.summary || desc; }
    else if (meta.event === "session_end") { status = "finished"; desc = meta.summary || desc; }
    agents.set(row.agent, { status, desc, ts: row.ts });
  }

  for (const [name, info] of agents) {
    const statusBadge =
      info.status === "active" ? green("● active") :
      info.status === "completed" || info.status === "finished" ? cyan("✓ done") :
      info.status === "blocked" ? yellow("◉ blocked") :
      info.status === "failed" ? red("✗ failed") :
      dim("○ idle");
    console.log(`  ${bold(name)}  ${statusBadge}  ${dim(timeAgo(info.ts))}`);
    console.log(`    ${info.desc}`);
    console.log();
  }
}

async function cmdPull(roomSlug, agentName, limit = 20) {
  const room = await resolveRoom(roomSlug);

  const { data: rows } = await supabase
    .from("memories")
    .select("message_type,content,ts,metadata")
    .eq("room_id", room.id)
    .eq("agent", agentName)
    .order("ts", { ascending: false })
    .limit(limit);

  if (!rows?.length) {
    console.log(dim(`No context from ${agentName}`));
    return;
  }

  console.log(bold(`\n  Context from ${agentName} (${rows.length} items)\n`));

  for (const m of [...rows].reverse()) {
    const meta = m.metadata ?? {};
    const label = meta.event || m.message_type || "";
    console.log(`  ${dim(m.ts.slice(11, 19))} ${cyan(`[${label}]`)}`);
    console.log(`    ${(m.content ?? "").slice(0, 300)}`);
    console.log();
  }
}

async function cmdInject(roomSlug, fromAgent, targetAgent, content, priority = "normal") {
  const room = await resolveRoom(roomSlug);

  const { error } = await supabase.from("memories").insert({
    room_id: room.id,
    agent: fromAgent,
    session_id: `cli_${Date.now()}`,
    message_type: "injection",
    content: `[INJECT → ${targetAgent}]: ${content}`,
    token_count: Math.floor(content.length / 4),
    metadata: {
      event: "context_injection",
      from_agent: fromAgent,
      target_agent: targetAgent,
      priority,
      label: null,
    },
  });

  if (error) {
    console.error("Failed to inject:", error.message);
    process.exit(1);
  }
  console.log(green(`✓ Injected context for ${targetAgent} (${priority})`));
}

async function cmdKnowledge(roomSlug, search) {
  const room = await resolveRoom(roomSlug);

  let query = supabase
    .from("memories")
    .select("id,agent,content,metadata,ts")
    .eq("room_id", room.id)
    .eq("message_type", "knowledge")
    .order("ts", { ascending: false })
    .limit(30);

  if (search) {
    query = query.ilike("content", `%${search}%`);
  }

  const { data: rows } = await query;

  if (!rows?.length) {
    console.log(dim(search ? `No knowledge matching "${search}"` : "Knowledge base is empty."));
    return;
  }

  console.log(bold(`\n  Knowledge base (${rows.length} entries)\n`));

  for (const m of rows) {
    const meta = m.metadata ?? {};
    const tags = (meta.tags ?? []).join(", ");
    const title = meta.title;
    console.log(`  ${title ? bold(title) : dim("(untitled)")}  ${tags ? yellow(`{${tags}}`) : ""}`);
    console.log(`    ${(m.content ?? "").replace(/^\[[^\]]*\]\s*/, "").slice(0, 200)}`);
    console.log(`    ${dim(`— ${meta.stored_by || m.agent}, ${timeAgo(m.ts)}`)}`);
    console.log();
  }
}

async function cmdLog(roomSlug, limit = 30) {
  const room = await resolveRoom(roomSlug);

  const { data: rows } = await supabase
    .from("memories")
    .select("agent,message_type,content,ts,metadata")
    .eq("room_id", room.id)
    .order("ts", { ascending: false })
    .limit(limit);

  if (!rows?.length) {
    console.log(dim("No activity."));
    return;
  }

  console.log(bold(`\n  Recent activity in /${room.slug}\n`));

  for (const m of [...rows].reverse()) {
    const meta = m.metadata ?? {};
    const event = meta.event;
    const typeLabel = event || m.message_type;
    const time = m.ts.slice(11, 19);
    console.log(`  ${dim(time)} ${bold(m.agent)} ${cyan(`[${typeLabel}]`)}`);
    console.log(`    ${(m.content ?? "").slice(0, 200)}`);
    console.log();
  }
}

async function cmdLearn(roomSlug, fromAgent, content, title, tags) {
  const room = await resolveRoom(roomSlug);

  const { error } = await supabase.from("memories").insert({
    room_id: room.id,
    agent: fromAgent,
    session_id: `cli_${Date.now()}`,
    message_type: "knowledge",
    content: `${title ? `[${title}] ` : ""}${content}`,
    token_count: Math.floor(content.length / 4),
    metadata: {
      event: "knowledge_stored",
      tags: tags ? tags.split(",").map((t) => t.trim()) : [],
      title: title || null,
      stored_by: fromAgent,
    },
  });

  if (error) {
    console.error("Failed to store:", error.message);
    process.exit(1);
  }
  console.log(green(`✓ Knowledge stored${title ? `: "${title}"` : ""}`));
}

async function cmdLogin() {
  const PORT = 19876;

  console.log(bold("\n  Remix Login\n"));
  console.log(dim("  Opening browser...\n"));

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      // CORS headers for the web app
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === "POST" && req.url === "/callback") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            const { supabaseUrl, supabaseKey, room } = data;

            if (!supabaseUrl || !supabaseKey || !room) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: "Missing fields" }));
              return;
            }

            // Save config
            saveConfig({ supabaseUrl, supabaseKey, room });

            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));

            console.log(green("  ✓ Logged in!"));
            console.log(`  Room: ${bold("/" + room)}`);
            console.log(`  Config saved to ${dim(CONFIG_FILE)}`);
            console.log(`\n  Try: ${cyan("remix status")}\n`);

            server.close();
            resolve();
          } catch (err) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(PORT, () => {
      const authUrl = `https://remix-memory.vercel.app/cli-auth?port=${PORT}`;

      // Open browser (cross-platform)
      const cmd = process.platform === "darwin" ? "open" :
                  process.platform === "win32" ? "start" : "xdg-open";
      exec(`${cmd} "${authUrl}"`);

      console.log(`  If browser didn't open, visit:`);
      console.log(`  ${cyan(authUrl)}\n`);
      console.log(dim("  Waiting for authorization...\n"));
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      console.error(red("\n  Timed out waiting for authorization."));
      server.close();
      reject(new Error("Timeout"));
    }, 120_000);
  });
}

async function cmdInit(slugArg, nameArg) {
  const adjectives = ["cosmic", "lunar", "solar", "stellar", "quantum", "neural", "cyber", "astral"];
  const nouns = ["fox", "owl", "wolf", "hawk", "bear", "lynx", "raven", "phoenix"];

  function randomSlug() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const code = Math.random().toString(36).substring(2, 6);
    return `${adj}-${noun}-${code}`;
  }

  const slug = slugArg || randomSlug();
  const name = nameArg || slug.split("-").slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  // Check if room already exists
  const { data: existing } = await supabase
    .from("rooms")
    .select("id,slug,name")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();

  if (existing) {
    console.log(yellow(`Room /${slug} already exists: "${existing.name}"`));
    console.log(`\n  Dashboard: ${dim("https://remix-memory.vercel.app/r/" + slug)}`);
    console.log(`  Connect:   ${dim(`claude mcp add --transport http remix "https://remix-mcp.armandsumo.workers.dev/mcp?room=${slug}&agent=YOUR_NAME"`)}`);
    return;
  }

  const { data, error } = await supabase
    .from("rooms")
    .insert({ slug, name, is_demo: false })
    .select()
    .single();

  if (error) {
    console.error(red("Failed to create room:"), error.message);
    process.exit(1);
  }

  console.log(green(`✓ Room created: ${bold(name)} /${slug}`));
  console.log(`\n  Dashboard: ${cyan("https://remix-memory.vercel.app/r/" + slug)}`);
  console.log(`  Connect:   ${dim(`claude mcp add --transport http remix "https://remix-mcp.armandsumo.workers.dev/mcp?room=${slug}&agent=YOUR_NAME"`)}`);
  console.log();
}

// ── CLI Router ──────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`
${bold("remix")} — CLI for Remix shared agent memory

${bold("Usage:")}
  remix login                                  Log in via browser (saves config)
  remix init [slug] [name]                     Create a new room
  remix status [room]                          Show agent status
  remix pull [room] <agent> [limit]            Pull agent context
  remix log [room] [limit]                     Recent activity feed
  remix inject [room] <from> <target> <msg>    Inject context to agent
  remix knowledge [room] [search]              Browse knowledge base
  remix learn [room] <agent> <content> [--title T] [--tags t1,t2]

  Room argument is optional after ${bold("remix login")} (uses saved room).

${bold("Examples:")}
  remix login                                  Open browser, pick room, done
  remix status                                 Status for your logged-in room
  remix status my-project                      Status for a specific room
  remix pull agent-alpha 10                    Pull context (room from config)
  remix inject user agent-beta "Focus on auth"
  remix knowledge "api pattern"
  remix learn user "We use camelCase" --title "Naming" --tags convention
`);
}

(async () => {
  try {
    switch (command) {
      case "login":
        await cmdLogin();
        break;

      case "init":
        // init needs supabase too
        if (!supabase) {
          if (SUPABASE_URL && SUPABASE_KEY) {
            supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
          } else {
            console.error("Run " + bold("remix login") + " first.");
            process.exit(1);
          }
        }
        await cmdInit(args[1], args[2]);
        break;

      case "status":
        await cmdStatus(args[1]);
        break;

      case "pull": {
        if (!args[1]) { console.error("Usage: remix pull [room] <agent> [limit]"); process.exit(1); }
        let pullRoom, pullAgent, pullLimit = 20;
        if (args.length >= 4) {
          pullRoom = args[1]; pullAgent = args[2]; pullLimit = parseInt(args[3]) || 20;
        } else if (args.length === 3) {
          if (/^\d+$/.test(args[2])) {
            pullAgent = args[1]; pullLimit = parseInt(args[2]) || 20;
          } else {
            pullRoom = args[1]; pullAgent = args[2];
          }
        } else {
          pullAgent = args[1];
        }
        if (!pullAgent) { console.error("Usage: remix pull [room] <agent> [limit]"); process.exit(1); }
        await cmdPull(pullRoom, pullAgent, pullLimit);
        break;
      }

      case "log":
        await cmdLog(args[1], parseInt(args[2]) || 30);
        break;

      case "inject":
        if (!args[1] || !args[2] || !args[3]) {
          console.error("Usage: remix inject [room] <from> <target> <message>");
          process.exit(1);
        }
        // If 4+ args: room from target message...
        // If 3 args and we have a default room: from target message
        if (args[4]) {
          await cmdInject(args[1], args[2], args[3], args.slice(4).join(" "));
        } else if (DEFAULT_ROOM) {
          await cmdInject(DEFAULT_ROOM, args[1], args[2], args.slice(3).join(" "));
        } else {
          console.error("Usage: remix inject <room> <from> <target> <message>");
          process.exit(1);
        }
        break;

      case "knowledge":
        await cmdKnowledge(args[1], args[2]);
        break;

      case "learn": {
        if (!args[1] || !args[2]) {
          console.error("Usage: remix learn [room] <agent> <content> [--title T] [--tags t1,t2]");
          process.exit(1);
        }
        // Parse --title and --tags flags
        let title = null;
        let tags = null;
        const contentParts = [];
        let i = 3;
        while (i < args.length) {
          if (args[i] === "--title" && args[i + 1]) { title = args[i + 1]; i += 2; }
          else if (args[i] === "--tags" && args[i + 1]) { tags = args[i + 1]; i += 2; }
          else { contentParts.push(args[i]); i++; }
        }
        await cmdLearn(args[1], args[2], contentParts.join(" "), title, tags);
        break;
      }

      case "help":
      case "--help":
      case "-h":
        usage();
        break;

      default:
        if (command) console.error(`Unknown command: ${command}\n`);
        usage();
        process.exit(command ? 1 : 0);
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();
