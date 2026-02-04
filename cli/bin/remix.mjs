#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

// ── Early help check (no env vars needed) ───────────────

const earlyCmd = process.argv[2];
if (!earlyCmd || earlyCmd === "help" || earlyCmd === "--help" || earlyCmd === "-h") {
  // Will be handled below after usage() is defined — just set a flag
  globalThis.__showHelp = true;
}

// ── Config ──────────────────────────────────────────────

const SUPABASE_URL = process.env.REMIX_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.REMIX_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

let supabase;
if (!globalThis.__showHelp) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      "Missing env vars. Set REMIX_SUPABASE_URL and REMIX_SUPABASE_KEY\n" +
      "(or VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)."
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

async function resolveRoom(slug) {
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

// ── CLI Router ──────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`
${bold("remix")} — CLI for Remix shared agent memory

${bold("Usage:")}
  remix status <room>                          Show agent status
  remix pull <room> <agent> [limit]            Pull agent context
  remix log <room> [limit]                     Recent activity feed
  remix inject <room> <from> <target> <msg>    Inject context to agent
  remix knowledge <room> [search]              Browse knowledge base
  remix learn <room> <agent> <content> [--title T] [--tags t1,t2]

${bold("Environment:")}
  REMIX_SUPABASE_URL   Supabase project URL
  REMIX_SUPABASE_KEY   Supabase anon/service key

${bold("Examples:")}
  remix status my-project
  remix pull my-project agent-alpha 10
  remix inject my-project user agent-beta "Focus on the auth module"
  remix knowledge my-project "api pattern"
  remix learn my-project user "We use camelCase" --title "Naming" --tags convention
`);
}

(async () => {
  try {
    switch (command) {
      case "status":
        if (!args[1]) { console.error("Usage: remix status <room>"); process.exit(1); }
        await cmdStatus(args[1]);
        break;

      case "pull":
        if (!args[1] || !args[2]) { console.error("Usage: remix pull <room> <agent> [limit]"); process.exit(1); }
        await cmdPull(args[1], args[2], parseInt(args[3]) || 20);
        break;

      case "log":
        if (!args[1]) { console.error("Usage: remix log <room>"); process.exit(1); }
        await cmdLog(args[1], parseInt(args[2]) || 30);
        break;

      case "inject":
        if (!args[1] || !args[2] || !args[3] || !args[4]) {
          console.error("Usage: remix inject <room> <from> <target> <message>");
          process.exit(1);
        }
        await cmdInject(args[1], args[2], args[3], args.slice(4).join(" "));
        break;

      case "knowledge":
        if (!args[1]) { console.error("Usage: remix knowledge <room> [search]"); process.exit(1); }
        await cmdKnowledge(args[1], args[2]);
        break;

      case "learn": {
        if (!args[1] || !args[2] || !args[3]) {
          console.error("Usage: remix learn <room> <agent> <content> [--title T] [--tags t1,t2]");
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
