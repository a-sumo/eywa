#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { exec, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Baked-in defaults (public Supabase project) ─────
// Uses the anon key (public, RLS-enforced). NOT the service_role key.

const SUPABASE_URL = "https://beknjtxysmznenkotjvv.snapcloud.dev";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJla25qdHh5c216bmVua290anZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMzYzNTYsImV4cCI6MjA4MTcxMjM1Nn0.5ecajJdpaK4FN-CuQI2ExfZWhCZl0rUrbFT6MGV-egs";

const MCP_BASE = "https://mcp.eywa-ai.dev/mcp";
const DASHBOARD_BASE = "https://eywa-ai.dev/r";

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
const blue = (s) => `\x1b[34m${s}\x1b[0m`;

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

function userName() {
  return process.env.USER || process.env.USERNAME || "user";
}

function hasBin(bin) {
  try {
    execSync(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch { return false; }
}

// Auto-detect installed agents and configure MCP for each one.
// Returns array of { agent, status, detail } results.
function autoConfigureAgents(slug) {
  const name = userName();
  const results = [];
  const home = homedir();

  // Helper: merge eywa into a JSON config file
  function mergeJsonConfig(filePath, urlKey, agentPrefix) {
    const url = mcpUrl(slug, `${agentPrefix}/${name}`);
    let existing = {};
    try {
      if (existsSync(filePath)) {
        existing = JSON.parse(readFileSync(filePath, "utf-8"));
      }
    } catch {}

    if (!existing.mcpServers) existing.mcpServers = {};

    // Already configured with same room? Skip.
    const current = existing.mcpServers.eywa;
    if (current) {
      const currentUrl = current.url || current.serverUrl || current.httpUrl || "";
      if (currentUrl.includes(`room=${slug}`)) {
        return { status: "exists", detail: filePath };
      }
    }

    existing.mcpServers.eywa = { [urlKey]: url };

    // Ensure parent dir exists
    const dir = join(filePath, "..");
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n");
    return { status: "configured", detail: filePath };
  }

  // 1. Claude Code
  if (hasBin("claude")) {
    const url = mcpUrl(slug, `claude/${name}`);
    try {
      const list = execSync("claude mcp list 2>&1", { encoding: "utf-8" });
      if (list.includes("eywa") && list.includes(slug)) {
        results.push({ agent: "Claude Code", status: "exists", detail: "already configured" });
      } else {
        if (list.includes("eywa")) {
          execSync("claude mcp remove eywa 2>/dev/null", { stdio: "ignore" });
        }
        execSync(`claude mcp add --transport http eywa "${url}"`, { stdio: "ignore" });
        results.push({ agent: "Claude Code", status: "configured", detail: "via claude mcp add" });
      }
    } catch {
      try {
        execSync(`claude mcp add --transport http eywa "${url}"`, { stdio: "ignore" });
        results.push({ agent: "Claude Code", status: "configured", detail: "via claude mcp add" });
      } catch {
        // Claude Code present but mcp command failed
      }
    }
  }

  // 2. Cursor
  const cursorDir = join(home, ".cursor");
  if (existsSync(cursorDir)) {
    const configPath = join(cursorDir, "mcp.json");
    const r = mergeJsonConfig(configPath, "url", "cursor");
    results.push({ agent: "Cursor", ...r });
  }

  // 3. Windsurf
  const windsurfDir = join(home, ".codeium", "windsurf");
  if (existsSync(windsurfDir)) {
    const configPath = join(windsurfDir, "mcp_config.json");
    const r = mergeJsonConfig(configPath, "serverUrl", "windsurf");
    results.push({ agent: "Windsurf", ...r });
  }

  // 4. Gemini CLI
  if (hasBin("gemini") || existsSync(join(home, ".gemini"))) {
    const configPath = join(home, ".gemini", "settings.json");
    const r = mergeJsonConfig(configPath, "httpUrl", "gemini");
    results.push({ agent: "Gemini CLI", ...r });
  }

  // 5. Codex
  if (hasBin("codex") || existsSync(join(home, ".codex"))) {
    const configPath = join(home, ".codex", "config.json");
    const r = mergeJsonConfig(configPath, "url", "codex");
    results.push({ agent: "Codex", ...r });
  }

  return results;
}

function printAgentResults(results) {
  if (!results.length) {
    console.log(dim("  No agents detected. Add manually:\n"));
    return false;
  }

  console.log(bold("  Agents configured:\n"));
  for (const r of results) {
    if (r.status === "configured") {
      console.log(`  ${green("✓")} ${bold(r.agent)} ${dim(r.detail)}`);
    } else if (r.status === "exists") {
      console.log(`  ${cyan("●")} ${bold(r.agent)} ${dim("already connected")}`);
    }
  }
  console.log();
  return true;
}

function progressBar(done, total, width = 20) {
  if (total === 0) return dim("[" + ".".repeat(width) + "]");
  const filled = Math.round((done / total) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${done}/${total}`;
}

function estimateTokens(text) {
  return Math.floor(text.length / 4);
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

function cliAgent() {
  return `cli/${process.env.USER || "user"}`;
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

  // Auto-detect and configure agents
  const results = await autoConfigureAgents(slug);
  console.log();
  const agentsFound = printAgentResults(results);

  if (!agentsFound) {
    printConfigs(slug, displayName);
    console.log(
      dim("  Replace {your-name} with your name (e.g. alice, bob)."),
    );
    console.log(
      dim("  Each person uses their own name so Eywa can tell agents apart.\n"),
    );
  }

  const dashUrl = `${DASHBOARD_BASE}/${slug}`;
  console.log(`  ${bold("Dashboard:")} ${cyan(dashUrl)}`);
  console.log(`  ${dim("Agent name:")} ${userName()}`);
  console.log();

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

  // Auto-detect and configure agents
  const results = await autoConfigureAgents(room.slug);
  console.log();
  const agentsFound = printAgentResults(results);

  if (!agentsFound) {
    printConfigs(room.slug, room.name);
    console.log(
      dim("  Replace {your-name} with your name (e.g. alice, bob).\n"),
    );
  }

  const dashUrl = `${DASHBOARD_BASE}/${room.slug}`;
  console.log(`  ${bold("Dashboard:")} ${cyan(dashUrl)}`);
  console.log(`  ${dim("Agent name:")} ${userName()}`);
  console.log();
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
    const systems = new Set();
    const actions = new Set();
    for (const r of rows.filter(r => r.agent === row.agent)) {
      const m = r.metadata ?? {};
      if (m.system) systems.add(m.system);
      if (m.action) actions.add(m.action);
    }
    agents.set(row.agent, { status, desc, ts: row.ts, systems: [...systems], actions: [...actions] });
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
    if (info.systems.length) {
      console.log(`    ${dim("systems:")} ${info.systems.map(s => cyan(s)).join(", ")}`);
    }
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
    const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
    const opTag = opParts.length ? ` ${magenta(opParts.join(":"))}` : "";
    const scopeTag = meta.scope ? ` ${dim(`(${meta.scope})`)}` : "";
    console.log(`  ${dim(time)} ${bold(m.agent)} ${cyan(`[${event}]`)}${opTag}${scopeTag}`);
    console.log(`    ${dim((m.content ?? "").slice(0, 200))}`);
    console.log();
  }
}

async function cmdInject(slugArg, target, message) {
  const room = await resolveRoom(slugArg);
  const fromAgent = cliAgent();

  const { error } = await supabase.from("memories").insert({
    room_id: room.id,
    agent: fromAgent,
    session_id: `cli_${Date.now()}`,
    message_type: "injection",
    content: `[INJECT -> ${target}]: ${message}`,
    token_count: estimateTokens(message),
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

// ── Destination ────────────────────────────────────────

async function fetchDestination(roomId) {
  const { data } = await supabase
    .from("memories")
    .select("content,ts,metadata")
    .eq("room_id", roomId)
    .eq("message_type", "knowledge")
    .filter("metadata->>event", "eq", "destination")
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function cmdDestView(slugArg) {
  const room = await resolveRoom(slugArg);
  const dest = await fetchDestination(room.id);

  if (!dest) {
    console.log(dim("\n  No destination set. Use: eywa dest set \"target state\"\n"));
    return;
  }

  const meta = dest.metadata ?? {};
  const milestones = meta.milestones || [];
  const progress = meta.progress || {};
  const done = milestones.filter(m => progress[m]).length;

  console.log(`\n  ${bold("Destination")} ${dim("/" + room.slug)}\n`);
  console.log(`  ${cyan(meta.destination || dest.content)}\n`);

  if (milestones.length) {
    console.log(`  ${progressBar(done, milestones.length)}\n`);
    for (const m of milestones) {
      const check = progress[m] ? green("  [x]") : dim("  [ ]");
      console.log(`${check} ${progress[m] ? m : dim(m)}`);
    }
    console.log();
  }

  if (meta.notes) {
    console.log(`  ${dim("Notes:")} ${meta.notes}\n`);
  }

  console.log(dim(`  Set by ${meta.set_by || "unknown"}, ${timeAgo(dest.ts)}\n`));
}

async function cmdDestSet(target, milestonesStr) {
  if (!target) {
    console.error(`Usage: ${bold('eywa dest set "target state" ["milestone1,milestone2"]')}`);
    process.exit(1);
  }

  const room = await resolveRoom(null);
  const fromAgent = cliAgent();
  const milestones = milestonesStr
    ? milestonesStr.split(",").map(s => s.trim()).filter(Boolean)
    : [];
  const progress = {};
  for (const m of milestones) progress[m] = false;

  const { error } = await supabase.from("memories").insert({
    room_id: room.id,
    agent: fromAgent,
    session_id: `cli_${Date.now()}`,
    message_type: "knowledge",
    content: `DESTINATION: ${target}`,
    token_count: estimateTokens(target),
    metadata: {
      event: "destination",
      destination: target,
      milestones,
      progress,
      notes: null,
      set_by: fromAgent,
    },
  });

  if (error) {
    console.error(red("Failed to set destination:"), error.message);
    process.exit(1);
  }

  console.log(green(`\n  ✓ Destination set: ${target}`));
  if (milestones.length) {
    console.log(dim(`  ${milestones.length} milestones: ${milestones.join(", ")}`));
  }
  console.log();
}

async function cmdDestCheck(milestoneName) {
  if (!milestoneName) {
    console.error(`Usage: ${bold('eywa dest check "milestone name"')}`);
    process.exit(1);
  }

  const room = await resolveRoom(null);
  const dest = await fetchDestination(room.id);

  if (!dest) {
    console.error(red("  No destination set."));
    process.exit(1);
  }

  const meta = dest.metadata ?? {};
  const milestones = meta.milestones || [];
  const progress = { ...(meta.progress || {}) };
  const needle = milestoneName.toLowerCase();

  const match = milestones.find(m => m.toLowerCase().includes(needle));
  if (!match) {
    console.error(red(`  No milestone matching "${milestoneName}".`));
    console.error(dim(`  Available: ${milestones.join(", ")}`));
    process.exit(1);
  }

  if (progress[match]) {
    console.log(yellow(`  Already done: ${match}`));
    return;
  }

  progress[match] = true;
  const fromAgent = cliAgent();

  const { error } = await supabase.from("memories").insert({
    room_id: room.id,
    agent: fromAgent,
    session_id: `cli_${Date.now()}`,
    message_type: "knowledge",
    content: `DESTINATION: ${meta.destination}`,
    token_count: estimateTokens(meta.destination || ""),
    metadata: { ...meta, progress, set_by: fromAgent },
  });

  if (error) {
    console.error(red("Failed to update milestone:"), error.message);
    process.exit(1);
  }

  const done = milestones.filter(m => progress[m]).length;
  console.log(green(`  ✓ Completed: ${match}`));
  console.log(`  ${progressBar(done, milestones.length)}\n`);
}

// ── Course ─────────────────────────────────────────────

async function cmdCourse(slugArg) {
  const room = await resolveRoom(slugArg);

  const [destResult, activityResult, distressResult, progressResult] = await Promise.all([
    fetchDestination(room.id),
    supabase
      .from("memories")
      .select("agent,content,ts,metadata")
      .eq("room_id", room.id)
      .order("ts", { ascending: false })
      .limit(200),
    supabase
      .from("memories")
      .select("agent,content,ts,metadata")
      .eq("room_id", room.id)
      .filter("metadata->>event", "eq", "distress")
      .filter("metadata->>resolved", "eq", "false")
      .order("ts", { ascending: false })
      .limit(5),
    supabase
      .from("memories")
      .select("agent,content,ts,metadata")
      .eq("room_id", room.id)
      .filter("metadata->>event", "eq", "progress")
      .order("ts", { ascending: false })
      .limit(50),
  ]);

  console.log(`\n  ${bold("Course")} ${dim("/" + room.slug)}\n`);

  // Destination
  if (destResult) {
    const meta = destResult.metadata ?? {};
    const milestones = meta.milestones || [];
    const progress = meta.progress || {};
    const done = milestones.filter(m => progress[m]).length;
    console.log(`  ${bold("Destination:")} ${cyan(meta.destination || destResult.content)}`);
    if (milestones.length) {
      console.log(`  ${progressBar(done, milestones.length)}`);
    }
    console.log();
  } else {
    console.log(dim("  No destination set.\n"));
  }

  // Agent progress
  const rows = activityResult.data || [];
  const progressRows = progressResult.data || [];
  const now = Date.now();

  // Build latest progress per agent
  const agentProgress = new Map();
  for (const r of progressRows) {
    if (!agentProgress.has(r.agent)) {
      agentProgress.set(r.agent, r.metadata ?? {});
    }
  }

  // Build agent status
  const agentMap = new Map();
  for (const row of rows) {
    if (agentMap.has(row.agent)) continue;
    const meta = row.metadata ?? {};
    const ageMin = (now - new Date(row.ts).getTime()) / 60000;
    let status = "idle";
    let task = (row.content ?? "").slice(0, 80);

    if (meta.event === "session_start") {
      status = ageMin < 30 ? "active" : "idle";
      task = meta.task || task;
    } else if (meta.event === "session_done" || meta.event === "session_end") {
      status = "finished";
      task = meta.summary || task;
    }

    agentMap.set(row.agent, { status, task, ts: row.ts });
  }

  const active = [];
  const finished = [];
  const idle = [];

  for (const [name, info] of agentMap) {
    const prog = agentProgress.get(name);
    const entry = { name, ...info, progress: prog };
    if (info.status === "active") active.push(entry);
    else if (info.status === "finished") finished.push(entry);
    else idle.push(entry);
  }

  if (active.length) {
    console.log(bold("  Active agents:"));
    for (const a of active) {
      const pct = a.progress?.percent != null ? ` ${a.progress.percent}%` : "";
      const phase = a.progress?.status ? dim(` [${a.progress.status}]`) : "";
      console.log(`  ${green("●")} ${bold(a.name)}${cyan(pct)}${phase}`);
      console.log(`    ${dim(a.task)}`);
    }
    console.log();
  }

  // Distress signals
  const distressRows = distressResult.data || [];
  if (distressRows.length) {
    console.log(red(bold("  Distress signals:")));
    for (const d of distressRows) {
      const meta = d.metadata ?? {};
      console.log(`  ${red("!")} ${bold(d.agent)} ${dim(timeAgo(d.ts))}`);
      console.log(`    ${dim(meta.task || d.content?.slice(0, 100) || "")}`);
    }
    console.log();
  }

  // Summary line
  console.log(
    dim(`  ${active.length} active, ${finished.length} finished, ${idle.length} idle\n`),
  );
}

// ── Knowledge ──────────────────────────────────────────

async function cmdKnowledge(slugArg, searchTerm) {
  const room = await resolveRoom(slugArg);

  let query = supabase
    .from("memories")
    .select("id,agent,content,ts,metadata")
    .eq("room_id", room.id)
    .eq("message_type", "knowledge")
    .order("ts", { ascending: false })
    .limit(15);

  if (searchTerm) {
    query = query.ilike("content", `%${searchTerm}%`);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error(red("Query failed:"), error.message);
    process.exit(1);
  }

  // Filter out destination entries
  const entries = (rows || []).filter(r => {
    const meta = r.metadata ?? {};
    return meta.event !== "destination";
  });

  if (!entries.length) {
    console.log(dim(`\n  No knowledge found${searchTerm ? ` for "${searchTerm}"` : ""}.\n`));
    return;
  }

  console.log(`\n  ${bold("Knowledge")} ${dim("/" + room.slug)}${searchTerm ? dim(` matching "${searchTerm}"`) : ""}\n`);

  for (const k of entries) {
    const meta = k.metadata ?? {};
    const title = meta.title || null;
    const tags = (meta.tags || []).map(t => blue(`#${t}`)).join(" ");
    const storedBy = meta.stored_by || k.agent;

    console.log(`  ${title ? bold(title) : dim("(untitled)")}`);
    console.log(`  ${dim((k.content ?? "").slice(0, 200))}`);
    if (tags) console.log(`  ${tags}`);
    console.log(`  ${dim(`by ${storedBy}, ${timeAgo(k.ts)}`)}`);
    console.log();
  }
}

async function cmdLearn(content, title, tagsStr) {
  if (!content) {
    console.error(`Usage: ${bold('eywa learn "knowledge content" ["title"] ["tag1,tag2"]')}`);
    process.exit(1);
  }

  const room = await resolveRoom(null);
  const fromAgent = cliAgent();
  const tags = tagsStr
    ? tagsStr.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];

  const fullContent = title ? `[${title}] ${content}` : content;

  const { error } = await supabase.from("memories").insert({
    room_id: room.id,
    agent: fromAgent,
    session_id: `cli_${Date.now()}`,
    message_type: "knowledge",
    content: fullContent,
    token_count: estimateTokens(content),
    metadata: {
      event: "knowledge_stored",
      tags,
      title: title ?? null,
      stored_by: fromAgent,
      source: "cli",
    },
  });

  if (error) {
    console.error(red("Failed to store knowledge:"), error.message);
    process.exit(1);
  }

  console.log(green(`  ✓ Knowledge stored${title ? `: ${title}` : ""}`));
  if (tags.length) console.log(dim(`  Tags: ${tags.join(", ")}`));
  console.log();
}

// ── Claims ──────────────────────────────────────────────

const CLAIM_MAX_AGE = 2 * 60 * 60_000; // 2 hours

async function cmdClaims(slugArg) {
  const room = await resolveRoom(slugArg);
  const twoHoursAgo = new Date(Date.now() - CLAIM_MAX_AGE).toISOString();

  // Fetch recent claims
  const { data: claimRows, error: claimErr } = await supabase
    .from("memories")
    .select("agent,metadata,ts,session_id")
    .eq("room_id", room.id)
    .eq("metadata->>event", "claim")
    .gte("ts", twoHoursAgo)
    .order("ts", { ascending: false })
    .limit(50);

  if (claimErr) {
    console.error(red("Query failed:"), claimErr.message);
    process.exit(1);
  }

  if (!claimRows?.length) {
    console.log(dim("\n  No active work claims.\n"));
    return;
  }

  // Fetch session ends and unclaims to filter out released claims
  const sessionIds = [...new Set(claimRows.map((r) => r.session_id).filter(Boolean))];
  const { data: endRows } = sessionIds.length > 0
    ? await supabase
        .from("memories")
        .select("agent,session_id,metadata")
        .eq("room_id", room.id)
        .in("session_id", sessionIds)
        .in("metadata->>event", ["session_end", "session_done", "unclaim"])
        .order("ts", { ascending: false })
        .limit(100)
    : { data: [] };

  const endedSessions = new Set();
  const unclaimedAgents = new Set();
  for (const row of (endRows ?? [])) {
    const meta = row.metadata ?? {};
    if (meta.event === "unclaim") {
      unclaimedAgents.add(row.agent);
    } else if (row.session_id) {
      endedSessions.add(row.session_id);
    }
  }

  // Dedupe: keep latest claim per agent, skip ended/unclaimed
  const seen = new Set();
  const claims = [];

  for (const row of claimRows) {
    if (seen.has(row.agent)) continue;
    if (row.session_id && endedSessions.has(row.session_id)) continue;
    if (unclaimedAgents.has(row.agent)) continue;
    seen.add(row.agent);

    const meta = row.metadata ?? {};
    claims.push({
      agent: row.agent,
      scope: meta.scope || "unknown",
      files: meta.files || [],
      ts: row.ts,
    });
  }

  if (!claims.length) {
    console.log(dim("\n  No active work claims.\n"));
    return;
  }

  console.log(`\n  ${bold("Active Claims")} ${dim("/" + room.slug)} (${claims.length})\n`);

  for (const c of claims) {
    console.log(`  ${yellow("●")} ${bold(c.agent)}  ${dim(timeAgo(c.ts))}`);
    console.log(`    ${c.scope}`);
    if (c.files.length) {
      const filesStr = c.files.slice(0, 5).map(f => cyan(f)).join(", ");
      const more = c.files.length > 5 ? dim(` +${c.files.length - 5} more`) : "";
      console.log(`    ${dim("files:")} ${filesStr}${more}`);
    }
    console.log();
  }
}

// ── Metrics ───────────────────────────────────────────

const ACTION_WEIGHTS = {
  deploy: 5, create: 4, write: 3, test: 3,
  delete: 2, review: 2, debug: 2, configure: 1.5,
  read: 1, monitor: 0.5,
};
const OUTCOME_MULT = {
  success: 1.0, in_progress: 0.5, failure: -1.0, blocked: -2.0,
};
const HIGH_IMPACT_ACTIONS = new Set(["deploy", "create", "write", "test", "delete", "review"]);

function computeCurvature(ops, durationMinutes) {
  if (ops.length === 0 || durationMinutes <= 0) return 0;
  const mins = Math.max(durationMinutes, 1);
  let weightedSum = 0;
  let failBlockCount = 0;
  let highImpact = 0;
  for (const op of ops) {
    const w = ACTION_WEIGHTS[op.action ?? ""] ?? 0;
    const m = OUTCOME_MULT[op.outcome ?? ""] ?? 0.5;
    weightedSum += w * m;
    if (op.outcome === "failure" || op.outcome === "blocked") failBlockCount++;
    if (HIGH_IMPACT_ACTIONS.has(op.action ?? "")) highImpact++;
  }
  const momentum = weightedSum / mins;
  const drag = failBlockCount / mins;
  const signal = highImpact / Math.max(ops.length, 1);
  return Math.round((momentum - drag) * signal * 100) / 100;
}

async function cmdMetrics(slugArg) {
  const room = await resolveRoom(slugArg);
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();

  const { data: rows } = await supabase
    .from("memories")
    .select("agent,content,ts,metadata")
    .eq("room_id", room.id)
    .gte("ts", twoHoursAgo)
    .order("ts", { ascending: false })
    .limit(2000);

  if (!rows?.length) {
    console.log(dim("\n  No recent activity (last 2 hours).\n"));
    return;
  }

  const now = Date.now();
  const ACTIVE_MS = 30 * 60_000;

  // Build per-agent operation data
  const agentOps = new Map();
  for (const row of rows) {
    const meta = row.metadata ?? {};
    const ts = new Date(row.ts).getTime();
    if (!agentOps.has(row.agent)) {
      agentOps.set(row.agent, {
        ops: [], firstTs: ts, lastTs: ts,
        successCount: 0, failCount: 0, blockedCount: 0, totalOps: 0,
        systems: new Set(),
        isActive: meta.event === "session_start" && (now - ts) < ACTIVE_MS,
      });
    }
    const agent = agentOps.get(row.agent);
    if (ts < agent.firstTs) agent.firstTs = ts;
    if (ts > agent.lastTs) agent.lastTs = ts;
    if (meta.system) agent.systems.add(meta.system);
    if (meta.action || meta.outcome) {
      agent.ops.push({ action: meta.action, outcome: meta.outcome });
      agent.totalOps++;
      if (meta.outcome === "success") agent.successCount++;
      if (meta.outcome === "failure") agent.failCount++;
      if (meta.outcome === "blocked") agent.blockedCount++;
    }
  }

  // Compute per-agent curvature
  const agentMetrics = [];
  let totalOps = 0, totalSuccess = 0, totalFail = 0, totalBlocked = 0, activeCount = 0;

  for (const [name, info] of agentOps) {
    const durationMin = (info.lastTs - info.firstTs) / 60000;
    const kappa = computeCurvature(info.ops, durationMin);
    const successRate = info.totalOps > 0 ? Math.round((info.successCount / info.totalOps) * 100) : 0;
    agentMetrics.push({
      name, kappa, ops: info.totalOps, successRate,
      isActive: info.isActive, systems: [...info.systems],
    });
    totalOps += info.totalOps;
    totalSuccess += info.successCount;
    totalFail += info.failCount;
    totalBlocked += info.blockedCount;
    if (info.isActive) activeCount++;
  }

  agentMetrics.sort((a, b) => b.kappa - a.kappa);

  const teamSuccessRate = totalOps > 0 ? Math.round((totalSuccess / totalOps) * 100) : 0;
  const throughput = Math.round(totalOps / 2);
  const withOps = agentMetrics.filter(a => a.ops > 0);
  const teamKappa = withOps.length > 0
    ? Math.round(withOps.reduce((sum, a) => sum + a.kappa, 0) / withOps.length * 100) / 100
    : 0;
  const converging = agentMetrics.filter(a => a.kappa > 0 && a.ops > 0).length;
  const diverging = agentMetrics.filter(a => a.kappa < 0).length;
  const stalled = agentMetrics.filter(a => a.kappa === 0 && a.ops === 0).length;

  const kappaColor = teamKappa > 0 ? green : teamKappa < 0 ? red : yellow;

  console.log(`\n  ${bold("Metrics")} ${dim("/" + room.slug)} ${dim("(last 2h)")}\n`);
  console.log(`  ${bold("Curvature:")}  ${kappaColor(`κ=${teamKappa}`)}  ${teamKappa > 0 ? green("converging") : teamKappa < 0 ? red("diverging") : yellow("stalled")}`);
  console.log(`  ${bold("Throughput:")} ${cyan(`${throughput} ops/hr`)}`);
  console.log(`  ${bold("Success:")}    ${teamSuccessRate >= 80 ? green(`${teamSuccessRate}%`) : teamSuccessRate >= 50 ? yellow(`${teamSuccessRate}%`) : red(`${teamSuccessRate}%`)}  ${dim(`(${totalSuccess} ok, ${totalFail} fail, ${totalBlocked} blocked)`)}`);
  console.log(`  ${bold("Agents:")}     ${green(`${activeCount} active`)}, ${dim(`${agentMetrics.length} total`)}`);
  console.log(`  ${bold("Convergence:")} ${converging} converging, ${diverging} diverging, ${stalled} stalled`);
  console.log();

  // Top convergers
  const topConvergers = agentMetrics.filter(a => a.kappa > 0).slice(0, 5);
  if (topConvergers.length) {
    console.log(bold("  Top convergers:"));
    for (const a of topConvergers) {
      const shortName = a.name.split("/")[1] || a.name;
      const activeBadge = a.isActive ? green(" ●") : "";
      const sysStr = a.systems.length ? dim(` [${a.systems.join(", ")}]`) : "";
      console.log(`  ${green("↑")} ${bold(shortName)}${activeBadge}  κ=${a.kappa}  ${dim(`${a.ops} ops, ${a.successRate}% ok`)}${sysStr}`);
    }
    console.log();
  }

  // Diverging agents
  const divergers = agentMetrics.filter(a => a.kappa < 0).slice(0, 3);
  if (divergers.length) {
    console.log(bold("  Needs attention (negative curvature):"));
    for (const a of divergers) {
      const shortName = a.name.split("/")[1] || a.name;
      console.log(`  ${red("↓")} ${bold(shortName)}  κ=${a.kappa}  ${dim(`${a.ops} ops, ${a.successRate}% ok`)}`);
    }
    console.log();
  }

  // Invisible agents
  const invisible = agentMetrics.filter(a => a.kappa === 0 && a.isActive && a.ops === 0);
  if (invisible.length) {
    const names = invisible.slice(0, 5).map(a => a.name.split("/")[1] || a.name).join(", ");
    const more = invisible.length > 5 ? dim(` +${invisible.length - 5} more`) : "";
    console.log(dim(`  Invisible (active, no tagged ops): ${names}${more}\n`));
  }
}

// ── Seeds ────────────────────────────────────────────

const ACTIVE_MS_SEED = 30 * 60_000; // 30 min
const SILENCE_WARN = 10 * 60_000;
const SILENCE_HIGH = 30 * 60_000;
const SILENCE_CRIT = 60 * 60_000;

function isSeedAgent(agent) {
  return agent.startsWith("autonomous/");
}

function silenceTag(ms) {
  if (ms >= SILENCE_CRIT) return red("SILENT 1h+");
  if (ms >= SILENCE_HIGH) return red(`SILENT ${Math.floor(ms / 60_000)}m`);
  if (ms >= SILENCE_WARN) return yellow(`SILENT ${Math.floor(ms / 60_000)}m`);
  return null;
}

async function cmdSeeds(slugArg) {
  const room = await resolveRoom(slugArg);
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60_000).toISOString();

  const { data: rows } = await supabase
    .from("memories")
    .select("agent,content,ts,metadata,message_type")
    .eq("room_id", room.id)
    .gte("ts", fourHoursAgo)
    .order("ts", { ascending: false })
    .limit(3000);

  if (!rows?.length) {
    console.log(dim("\n  No seed activity (last 4 hours).\n"));
    return;
  }

  const now = Date.now();
  const seeds = new Map();

  for (const row of rows) {
    if (!isSeedAgent(row.agent)) continue;
    const meta = row.metadata ?? {};
    if (meta.event === "agent_connected") continue;

    const ts = new Date(row.ts).getTime();
    let state = seeds.get(row.agent);

    if (!state) {
      let status = "idle";
      let task = "";

      if (meta.event === "session_start") {
        status = (now - ts) < ACTIVE_MS_SEED ? "active" : "idle";
        task = meta.task || "";
      } else if (meta.event === "session_done" || meta.event === "session_end") {
        status = "finished";
        task = meta.summary || "";
      } else if ((now - ts) < ACTIVE_MS_SEED) {
        status = "active";
      }

      state = {
        agent: row.agent,
        status,
        task: task || (row.content ?? "").slice(0, 100),
        opCount: 0,
        successCount: 0,
        failCount: 0,
        blockedCount: 0,
        sessions: 0,
        lastTs: ts,
        firstTs: ts,
        systems: new Set(),
      };
      seeds.set(row.agent, state);
    }

    if (ts < state.firstTs) state.firstTs = ts;
    if (meta.system) state.systems.add(meta.system);
    if (meta.action || meta.outcome) {
      state.opCount++;
      if (meta.outcome === "success") state.successCount++;
      if (meta.outcome === "failure") state.failCount++;
      if (meta.outcome === "blocked") state.blockedCount++;
    }
    if (meta.event === "session_start") state.sessions++;
  }

  if (!seeds.size) {
    console.log(dim("\n  No seed agents found in recent activity.\n"));
    return;
  }

  // Aggregate stats
  let totalSeeds = seeds.size;
  let activeSeeds = 0;
  let stalledSeeds = 0;
  let finishedSeeds = 0;
  let totalOps = 0;
  let totalSuccess = 0;
  let totalSessions = 0;

  const seedList = [];
  for (const [, s] of seeds) {
    if (s.status === "active") {
      const silence = now - s.lastTs;
      if (silence >= SILENCE_WARN) stalledSeeds++;
      else activeSeeds++;
    }
    if (s.status === "finished") finishedSeeds++;
    totalOps += s.opCount;
    totalSuccess += s.successCount;
    totalSessions += s.sessions;
    seedList.push(s);
  }

  const successRate = totalOps > 0 ? Math.round((totalSuccess / totalOps) * 100) : 0;
  const throughput = Math.round(totalOps / 4); // ops per hour (4h window)
  const efficiency = totalSessions > 0 ? Math.round(totalOps / totalSessions) : 0;

  console.log(`\n  ${bold("Seeds")} ${dim("/" + room.slug)} ${dim("(last 4h)")}\n`);

  // Stats bar
  const rateColor = successRate >= 80 ? green : successRate >= 50 ? yellow : red;
  console.log(`  ${bold("Seeds:")}      ${green(`${activeSeeds} active`)}, ${stalledSeeds > 0 ? yellow(`${stalledSeeds} stalled`) : dim(`${stalledSeeds} stalled`)}, ${dim(`${finishedSeeds} finished`)}, ${dim(`${totalSeeds} total`)}`);
  console.log(`  ${bold("Success:")}    ${rateColor(`${successRate}%`)}  ${dim(`(${totalSuccess} ok / ${totalOps} ops)`)}`);
  console.log(`  ${bold("Throughput:")} ${cyan(`${throughput} ops/hr`)}`);
  console.log(`  ${bold("Efficiency:")} ${cyan(`${efficiency} ops/session`)}  ${dim(`(${totalSessions} sessions)`)}`);
  console.log();

  // Per-seed list: active first, then stalled, then finished, then idle
  seedList.sort((a, b) => {
    const order = { active: 0, finished: 2, idle: 3 };
    const aOrder = a.status === "active" && (now - a.lastTs) >= SILENCE_WARN ? 1 : (order[a.status] ?? 3);
    const bOrder = b.status === "active" && (now - b.lastTs) >= SILENCE_WARN ? 1 : (order[b.status] ?? 3);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.lastTs - a.lastTs;
  });

  // Show top seeds (max 15)
  const shown = seedList.slice(0, 15);
  for (const s of shown) {
    const shortName = s.agent.split("/")[1] || s.agent;
    const silence = now - s.lastTs;
    const silTag = s.status === "active" ? silenceTag(silence) : null;

    let badge;
    if (s.status === "active" && !silTag) {
      badge = green("● active");
    } else if (s.status === "active" && silTag) {
      badge = yellow("◉ ") + silTag;
    } else if (s.status === "finished") {
      badge = cyan("✓ done");
    } else {
      badge = dim("○ idle");
    }

    const sr = s.opCount > 0 ? Math.round((s.successCount / s.opCount) * 100) : 0;
    const sysStr = s.systems.size ? dim(` [${[...s.systems].join(", ")}]`) : "";

    console.log(`  ${bold(shortName)}  ${badge}  ${dim(timeAgo(new Date(s.lastTs).toISOString()))}`);
    console.log(`    ${dim(s.task.slice(0, 80))}`);
    console.log(`    ${dim(`${s.opCount} ops, ${sr}% ok, ${s.sessions} sessions`)}${sysStr}`);
    console.log();
  }

  if (seedList.length > 15) {
    console.log(dim(`  ... and ${seedList.length - 15} more seeds\n`));
  }
}

// ── Approve ──────────────────────────────────────────

const RISK_COLORS = { low: green, medium: yellow, high: red, critical: red };

async function cmdApproveList(slugArg, showAll) {
  const room = await resolveRoom(slugArg);

  let query = supabase
    .from("memories")
    .select("id,agent,content,metadata,ts")
    .eq("room_id", room.id)
    .eq("message_type", "approval_request")
    .order("ts", { ascending: false })
    .limit(20);

  if (!showAll) {
    query = query.eq("metadata->>status", "pending");
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error(red("Query failed:"), error.message);
    process.exit(1);
  }

  if (!rows?.length) {
    const msg = showAll ? "No approval requests found." : "No pending approval requests.";
    console.log(dim(`\n  ${msg}\n`));
    return;
  }

  const title = showAll ? "Approvals" : "Pending Approvals";
  console.log(`\n  ${bold(title)} ${dim("/" + room.slug)} (${rows.length})\n`);

  for (const row of rows) {
    const meta = row.metadata ?? {};
    const status = meta.status || "pending";
    const risk = meta.risk_level || "medium";
    const action = meta.action_description || "Unknown action";
    const scope = meta.scope || null;
    const ctx = meta.context || null;
    const riskColor = RISK_COLORS[risk] || yellow;

    let badge;
    if (status === "pending") badge = yellow("? pending");
    else if (status === "approved") badge = green("v approved");
    else if (status === "denied") badge = red("x denied");
    else badge = dim(status);

    console.log(`  ${bold(action.slice(0, 120))}`);
    console.log(`  ${cyan(row.id.slice(0, 8))}  ${badge}  ${riskColor(risk + " risk")}  by ${dim(row.agent)}  ${dim(timeAgo(row.ts))}`);
    if (scope) console.log(`    ${dim("Scope:")} ${scope.slice(0, 100)}`);
    if (ctx) console.log(`    ${dim("Context:")} ${ctx.slice(0, 100)}`);

    if (status === "approved" || status === "denied") {
      const resolvedBy = meta.resolved_by || "unknown";
      const msg = meta.response_message || "";
      console.log(`    ${dim(`${status === "approved" ? "Approved" : "Denied"} by ${resolvedBy}${msg ? ": " + msg.slice(0, 80) : ""}`)}`);
    }
    console.log();
  }
}

async function cmdApproveResolve(idPrefix, decision, message) {
  if (!idPrefix) {
    console.error(`Usage: ${bold(`eywa approve ${decision === "approved" ? "yes" : "no"} <id-prefix> ["message"]`)}`);
    process.exit(1);
  }

  const room = await resolveRoom(null);
  const fromAgent = cliAgent();

  // Find the approval by partial ID
  let query = supabase
    .from("memories")
    .select("id,agent,metadata,content")
    .eq("room_id", room.id)
    .eq("message_type", "approval_request");

  if (idPrefix.length < 36) {
    query = query.ilike("id", `${idPrefix}%`);
  } else {
    query = query.eq("id", idPrefix);
  }

  const { data: rows, error } = await query.limit(5);

  if (error) {
    console.error(red("Query failed:"), error.message);
    process.exit(1);
  }

  if (!rows?.length) {
    console.error(red(`  Approval not found: ${idPrefix}`));
    process.exit(1);
  }

  if (rows.length > 1) {
    console.error(yellow(`  Multiple matches for "${idPrefix}":`));
    for (const r of rows) {
      const m = r.metadata ?? {};
      console.error(`    ${cyan(r.id.slice(0, 8))} ${(m.action_description || "unknown").slice(0, 60)}`);
    }
    console.error(dim("  Provide a more specific ID."));
    process.exit(1);
  }

  const row = rows[0];
  const meta = row.metadata ?? {};

  if (meta.status !== "pending") {
    console.error(yellow(`  Already ${meta.status} by ${meta.resolved_by || "unknown"}.`));
    process.exit(1);
  }

  // Update the approval
  const updatedMeta = {
    ...meta,
    status: decision,
    resolved_by: fromAgent,
    resolved_at: new Date().toISOString(),
    response_message: message ?? "",
  };

  const { error: updateErr } = await supabase
    .from("memories")
    .update({ metadata: updatedMeta })
    .eq("id", row.id);

  if (updateErr) {
    console.error(red("Failed to update approval:"), updateErr.message);
    process.exit(1);
  }

  // Inject notification to the requesting agent
  const action = meta.action_description || "Unknown action";
  const notifContent = decision === "approved"
    ? `APPROVED by ${fromAgent}: ${action}${message ? ". " + message : ". Proceed."}`
    : `DENIED by ${fromAgent}: ${action}${message ? ". Reason: " + message : ". Do NOT proceed."}`;

  await supabase.from("memories").insert({
    room_id: room.id,
    agent: fromAgent,
    session_id: `cli_${Date.now()}`,
    message_type: "injection",
    content: notifContent,
    token_count: estimateTokens(notifContent),
    metadata: {
      event: "context_injection",
      from_agent: fromAgent,
      target_agent: row.agent,
      label: `Approval ${decision}`,
      priority: "high",
    },
  });

  const verb = decision === "approved" ? "Approved" : "Denied";
  const icon = decision === "approved" ? green("v") : red("x");
  console.log(`\n  ${icon} ${bold(verb)}: ${action.slice(0, 120)}`);
  console.log(`  ${dim(`ID: ${row.id.slice(0, 8)}, agent: ${row.agent}`)}`);
  if (message) console.log(`  ${dim("Message:")} ${message}`);
  console.log(dim("  The agent will see this on their next tool call.\n"));
}

// ── CLI Router ─────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function banner() {
  console.log(`
  ${magenta("◆")} ${bold("eywa")} ${dim("- observability for human + AI teams")}
`);
}

function usage() {
  banner();
  console.log(`${bold("  Quick start:")}
    ${cyan("npx eywa-ai init")}                       Create a room and auto-configure all detected agents
    ${cyan("npx eywa-ai join cosmic-fox-a1b2")}       Join an existing room

${bold("  Observe:")}
    status [room]                         Show agent status with systems
    log [room] [limit]                    Recent activity feed
    course [room]                         Destination progress, agents, distress
    claims [room]                         Active work claims (who's working on what)
    metrics [room]                        Team curvature, throughput, success rate
    seeds [room]                          Seed health: active, stalled, success rate
    approve [room]                        List pending approval requests
    approve yes <id> ["msg"]              Approve a request
    approve no <id> ["reason"]            Deny a request

${bold("  Navigate:")}
    dest [room]                           View current destination
    dest set "target" ["m1,m2,m3"]        Set destination with milestones
    dest check "milestone"                Mark a milestone done

${bold("  Interact:")}
    inject <target> <msg>                 Send context to an agent
    learn "content" ["title"] ["tags"]    Store team knowledge
    knowledge [search]                    Browse the knowledge base

${bold("  Setup:")}
    init [name]                           Create a room, auto-configure agents
    join <room-slug>                      Join a room, auto-configure agents
    dashboard [room]                      Open the web dashboard
    help                                  Show this help

${bold("  Examples:")}
    ${dim("$")} npx eywa-ai init                                       ${dim("# create room, configure all agents")}
    ${dim("$")} npx eywa-ai init my-team                               ${dim("# named room")}
    ${dim("$")} npx eywa-ai status                                     ${dim("# check your agents")}
    ${dim("$")} npx eywa-ai dest set "Ship auth" "JWT,RBAC,Migration"  ${dim("# set destination")}
    ${dim("$")} npx eywa-ai dest check JWT                             ${dim("# mark milestone done")}
    ${dim("$")} npx eywa-ai course                                     ${dim("# full overview")}
    ${dim("$")} npx eywa-ai inject all "deploy freeze until 3pm"       ${dim("# push context")}
    ${dim("$")} npx eywa-ai learn "API uses JWT" "Auth" "api,auth"     ${dim("# store knowledge")}
    ${dim("$")} npx eywa-ai knowledge auth                             ${dim("# search knowledge")}

  ${dim("Docs: https://eywa-ai.dev/docs")}
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

      case "dest":
      case "destination": {
        const sub = args[1];
        if (sub === "set") {
          await cmdDestSet(args[2], args[3]);
        } else if (sub === "check") {
          await cmdDestCheck(args.slice(2).join(" "));
        } else {
          // "dest" or "dest <room-slug>" -- view destination
          await cmdDestView(sub);
        }
        break;
      }

      case "course":
        await cmdCourse(args[1]);
        break;

      case "claims":
        await cmdClaims(args[1]);
        break;

      case "metrics":
        await cmdMetrics(args[1]);
        break;

      case "seeds":
        await cmdSeeds(args[1]);
        break;

      case "approve": {
        const sub = args[1];
        if (sub === "yes") {
          await cmdApproveResolve(args[2], "approved", args.slice(3).join(" ") || null);
        } else if (sub === "no") {
          await cmdApproveResolve(args[2], "denied", args.slice(3).join(" ") || null);
        } else {
          // "approve" or "approve <room-slug>" or "approve --all"
          const showAll = args.includes("--all");
          const slugArg = sub && sub !== "--all" ? sub : null;
          await cmdApproveList(slugArg, showAll);
        }
        break;
      }

      case "knowledge":
      case "kb":
        await cmdKnowledge(null, args[1]);
        break;

      case "learn":
        await cmdLearn(args[1], args[2], args[3]);
        break;

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
