#!/usr/bin/env npx tsx
/**
 * Spectacles Event Simulator
 *
 * Sends interaction events to SpectaclesView via Supabase Realtime,
 * simulating all Spectacles interaction modes without physical hardware.
 *
 * Usage:
 *   npx tsx scripts/spectacles-sim.ts                    # interactive mode
 *   npx tsx scripts/spectacles-sim.ts --scenario sweep   # run a scenario
 *   npx tsx scripts/spectacles-sim.ts --fold demo        # target a specific fold
 *   npx tsx scripts/spectacles-sim.ts --list             # list all scenarios
 *
 * Environment:
 *   SUPABASE_URL         (defaults to .env in web/)
 *   SUPABASE_ANON_KEY    (defaults to .env in web/)
 *   FOLD                 (defaults to "demo")
 *   DEVICE_ID            (defaults to "sim")
 */

import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";

// --- Config ---

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../web/.env");
  const vars: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const match = line.match(/^(\w+)=(.*)$/);
      if (match) vars[match[1]] = match[2];
    }
  }
  return vars;
}

const env = loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set env vars or ensure web/.env exists.");
  process.exit(1);
}

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const FOLD = getArg("fold", process.env.FOLD || "demo");
const DEVICE_ID = getArg("device", process.env.DEVICE_ID || "sim");
const SCENARIO = getArg("scenario", "");
const LIST = args.includes("--list");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Event senders ---

type SikEventType =
  | "zoom_in" | "zoom_out" | "pan" | "reset_view"
  | "select" | "toggle_agent" | "toggle_grid" | "toggle_theme" | "toggle_info"
  | "focus_agent" | "focus_node" | "pan_to_region";

type InteractType = "tap" | "hover" | "hover_move" | "hover_exit";

let channel: RealtimeChannel;

async function send(event: string, payload: Record<string, unknown>) {
  await channel.send({ type: "broadcast", event, payload });
}

// SIK interaction events (legacy format, handled by SpectaclesView)
async function sikEvent(type: SikEventType, extra: Record<string, unknown> = {}) {
  await send("interaction", { type, ...extra });
  console.log(`  [sik] ${type}`, extra);
}

// TilePanel interact events (tap/hover with normalized u,v)
async function interact(type: InteractType, u?: number, v?: number, id?: string) {
  await send("interact", { type, u, v, id, timestamp: Date.now() });
  console.log(`  [interact] ${type} u=${u?.toFixed(3)} v=${v?.toFixed(3)}${id ? ` id=${id}` : ""}`);
}

// Voice events
async function voiceInput(text: string) {
  await send("voice_input", { text });
  console.log(`  [voice_input] "${text}"`);
}

async function voiceResponse(text: string) {
  await send("voice_response", { text });
  console.log(`  [voice_response] "${text}"`);
}

async function voiceInject(message: string) {
  await send("voice_inject", { message });
  console.log(`  [voice_inject] "${message}"`);
}

// Sync request (triggers data re-fetch on web)
async function syncRequest() {
  await send("sync_request", {});
  console.log(`  [sync_request]`);
}

// Utility: wait ms
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Scenarios ---

interface Scenario {
  name: string;
  description: string;
  run: () => Promise<void>;
}

const scenarios: Scenario[] = [
  {
    name: "sweep",
    description: "Hover across the entire canvas in a grid pattern, triggering hit detection everywhere",
    async run() {
      console.log("Sweeping canvas in grid pattern...");
      const steps = 20;
      for (let row = 0; row <= steps; row++) {
        for (let col = 0; col <= steps; col++) {
          const u = col / steps;
          const v = row / steps;
          await interact("hover_move", u, v);
          await sleep(50);
        }
      }
      await interact("hover_exit");
      console.log("Sweep complete.");
    },
  },
  {
    name: "tap-grid",
    description: "Tap a 5x5 grid of points across the canvas",
    async run() {
      console.log("Tapping 5x5 grid...");
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          const u = (col + 0.5) / 5;
          const v = (row + 0.5) / 5;
          await interact("hover", u, v);
          await sleep(100);
          await interact("tap", u, v);
          await sleep(300);
        }
      }
      await interact("hover_exit");
      console.log("Tap grid complete.");
    },
  },
  {
    name: "zoom-cycle",
    description: "Zoom in, pan around, zoom out, reset. Tests all view controls.",
    async run() {
      console.log("Zoom cycle...");
      // Zoom in 4 times
      for (let i = 0; i < 4; i++) {
        await sikEvent("zoom_in", { factor: 1.4 });
        await sleep(400);
      }
      // Pan in a circle
      const panSteps = 12;
      for (let i = 0; i < panSteps; i++) {
        const angle = (i / panSteps) * Math.PI * 2;
        const dx = Math.cos(angle) * 0.3;
        const dy = Math.sin(angle) * 0.3;
        await sikEvent("pan", { dx, dy });
        await sleep(200);
      }
      // Zoom out 4 times
      for (let i = 0; i < 4; i++) {
        await sikEvent("zoom_out", { factor: 0.6 });
        await sleep(400);
      }
      // Reset
      await sikEvent("reset_view");
      console.log("Zoom cycle complete.");
    },
  },
  {
    name: "toggles",
    description: "Toggle all UI modes: grid, theme, info panel",
    async run() {
      console.log("Toggling all UI modes...");
      await sikEvent("toggle_grid");
      await sleep(800);
      await sikEvent("toggle_theme");
      await sleep(800);
      await sikEvent("toggle_info");
      await sleep(1500);
      await sikEvent("toggle_info");
      await sleep(800);
      await sikEvent("toggle_theme");
      await sleep(800);
      await sikEvent("toggle_grid");
      console.log("Toggles complete.");
    },
  },
  {
    name: "voice-conversation",
    description: "Simulate a voice conversation with Gemini through the glasses",
    async run() {
      console.log("Simulating voice conversation...");
      await voiceInput("What agents are running right now?");
      await sleep(2000);
      await voiceResponse("I can see 3 active agents in this fold. Sarah is working on the authentication module, Alex is refactoring the database layer, and Mike is writing tests.");
      await sleep(3000);
      await voiceInput("Focus on Sarah's work");
      await sleep(1500);
      await voiceInject("inject_to_agent: sarah - user requesting status update");
      await sleep(1000);
      await voiceResponse("Focusing on Sarah. She has completed 3 of 5 subtasks for the auth module. Her latest commit was 2 minutes ago, updating the JWT validation logic.");
      await sleep(3000);
      await voiceInput("Set the destination to ship authentication by end of day");
      await sleep(1500);
      await voiceInject("set_destination: Ship authentication module by EOD");
      await sleep(1000);
      await voiceResponse("Destination updated. All agents are now converging toward shipping the authentication module by end of day.");
      console.log("Voice conversation complete.");
    },
  },
  {
    name: "agent-select",
    description: "Select agents from the legend by tapping legend positions",
    async run() {
      console.log("Selecting agents via legend...");
      // Legend is typically in the top-left or bottom of the canvas
      // Hit test both positions to find the legend
      const legendPositions = [
        { u: 0.05, v: 0.95 },
        { u: 0.05, v: 0.9 },
        { u: 0.05, v: 0.85 },
        { u: 0.05, v: 0.80 },
        { u: 0.05, v: 0.75 },
      ];
      for (const pos of legendPositions) {
        await interact("hover", pos.u, pos.v);
        await sleep(300);
        await interact("tap", pos.u, pos.v);
        await sleep(600);
      }
      // Also try SIK select at center
      await sikEvent("select", { x: 0.5, y: 0.5 });
      await sleep(500);
      await interact("hover_exit");
      console.log("Agent select complete.");
    },
  },
  {
    name: "stress",
    description: "Rapid-fire events to test performance under load",
    async run() {
      console.log("Stress test: 200 rapid events...");
      const start = Date.now();
      // Rapid hover moves
      for (let i = 0; i < 100; i++) {
        const u = Math.random();
        const v = Math.random();
        await interact("hover_move", u, v);
        // No sleep - max throughput
      }
      // Rapid zooms
      for (let i = 0; i < 50; i++) {
        await sikEvent(i % 2 === 0 ? "zoom_in" : "zoom_out", { factor: i % 2 === 0 ? 1.1 : 0.9 });
      }
      // Rapid taps
      for (let i = 0; i < 50; i++) {
        await interact("tap", Math.random(), Math.random());
      }
      await sikEvent("reset_view");
      const elapsed = Date.now() - start;
      console.log(`Stress test complete. 200 events in ${elapsed}ms (${(200 / elapsed * 1000).toFixed(0)} events/sec)`);
    },
  },
  {
    name: "focus-tour",
    description: "Focus on each agent in sequence, testing label and node readability at close zoom",
    async run() {
      console.log("Focus tour: visiting each agent...");
      // First get a broad view
      await sikEvent("reset_view");
      await sleep(800);

      // Known agent prefixes from eywa-dev fold
      const agents = [
        "i18n-deployer/keen-bear",
        "i18n-deployer/dark-moon",
        "openclaw/pale-tide",
        "openclaw/blue-crow",
        "autonomous/smoky-thorn",
        "autonomous/cold-bear",
        "autonomous/rosy-brook",
        "autonomous/bright-brook",
        "autonomous/blue-wren",
      ];

      for (const agent of agents) {
        console.log(`  Focusing on ${agent}...`);
        await sikEvent("focus_agent", { agent, focusZoom: 2.5 });
        await sleep(1500);
      }

      // Return to overview
      await sikEvent("reset_view");
      await sleep(600);
      console.log("Focus tour complete.");
    },
  },
  {
    name: "legibility",
    description: "Test UI legibility: zoom levels, grid vs graph, label overlap, theme contrast",
    async run() {
      console.log("Legibility assessment...");

      // 1. Overview: can you read agent names in the legend?
      await sikEvent("reset_view");
      await sleep(1000);
      console.log("  [check] Overview: legend readable?");

      // 2. Zoom to 2x: are node labels legible?
      await sikEvent("zoom_in", { factor: 2.0 });
      await sleep(1000);
      console.log("  [check] 2x zoom: node labels legible?");

      // 3. Zoom to 4x: individual node detail readable?
      await sikEvent("zoom_in", { factor: 2.0 });
      await sleep(1000);
      console.log("  [check] 4x zoom: node detail readable?");

      // 4. Grid mode at overview: are cards distinguishable?
      await sikEvent("reset_view");
      await sleep(500);
      await sikEvent("toggle_grid");
      await sleep(1200);
      console.log("  [check] Grid mode: cards distinguishable?");

      // 5. Grid mode zoomed: can you read card content?
      await sikEvent("zoom_in", { factor: 1.8 });
      await sleep(1000);
      console.log("  [check] Grid zoomed: card content readable?");

      // 6. Light theme: contrast check
      await sikEvent("toggle_grid");
      await sleep(300);
      await sikEvent("reset_view");
      await sleep(300);
      await sikEvent("toggle_theme");
      await sleep(1200);
      console.log("  [check] Light theme: sufficient contrast?");

      // 7. Light theme zoomed
      await sikEvent("zoom_in", { factor: 2.0 });
      await sleep(1000);
      console.log("  [check] Light theme zoomed: labels readable?");

      // 8. Back to dark
      await sikEvent("toggle_theme");
      await sleep(500);
      await sikEvent("reset_view");
      await sleep(500);
      console.log("Legibility assessment complete.");
    },
  },
  {
    name: "focus-compare",
    description: "Focus on two agents back-to-back to compare their trajectories",
    async run() {
      console.log("Comparing agents...");
      await sikEvent("reset_view");
      await sleep(600);

      // Focus on first agent
      await sikEvent("focus_agent", { agent: "autonomous/cold-bear", focusZoom: 2.5 });
      await sleep(2000);
      console.log("  Agent 1: autonomous/cold-bear");

      // Focus on second agent
      await sikEvent("focus_agent", { agent: "autonomous/bright-brook", focusZoom: 2.5 });
      await sleep(2000);
      console.log("  Agent 2: autonomous/bright-brook");

      // Zoom out to see both in context
      await sikEvent("zoom_out", { factor: 0.3 });
      await sleep(1500);
      console.log("  Zoomed out: both agents in context");

      await sikEvent("reset_view");
      await sleep(500);
      console.log("Focus compare complete.");
    },
  },
  {
    name: "full",
    description: "Run all scenarios in sequence (comprehensive test)",
    async run() {
      for (const s of scenarios) {
        if (s.name === "full" || s.name === "stress") continue;
        console.log(`\n=== ${s.name}: ${s.description} ===`);
        await s.run();
        await sleep(1000);
      }
    },
  },
];

// --- Interactive mode ---

async function interactive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => new Promise<string>((resolve) => rl.question("\nspecs-sim> ", resolve));

  console.log(`
Spectacles Event Simulator - Interactive Mode
Channel: spectacles:${FOLD}:${DEVICE_ID}

Commands:
  tap <u> <v>           Tap at normalized coords (0-1)
  hover <u> <v>         Hover at coords
  hover_exit            Stop hovering
  zoom_in [factor]      Zoom in (default 1.4)
  zoom_out [factor]     Zoom out (default 0.6)
  pan <dx> <dy>         Pan (normalized -1 to 1)
  reset                 Reset view
  grid                  Toggle grid mode
  theme                 Toggle dark/light
  info                  Toggle info panel
  select <x> <y>        Select at coords (0-1)
  focus <agent>         Pan+zoom map to center on agent
  focusn <nodeId>       Pan+zoom map to center on node
  goto <wx> <wy> [zoom] Pan map to world coords
  voice <text>          Send voice input
  respond <text>        Send voice response
  inject <message>      Send voice inject
  sync                  Request data sync
  run <scenario>        Run a scenario
  list                  List scenarios
  q / quit / exit       Exit
`);

  while (true) {
    const input = (await prompt()).trim();
    if (!input) continue;
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    try {
      switch (cmd) {
        case "tap":
          await interact("tap", parseFloat(parts[1]) || 0.5, parseFloat(parts[2]) || 0.5);
          break;
        case "hover":
          await interact("hover", parseFloat(parts[1]) || 0.5, parseFloat(parts[2]) || 0.5);
          break;
        case "hover_exit":
          await interact("hover_exit");
          break;
        case "zoom_in":
        case "zi":
          await sikEvent("zoom_in", { factor: parseFloat(parts[1]) || 1.4 });
          break;
        case "zoom_out":
        case "zo":
          await sikEvent("zoom_out", { factor: parseFloat(parts[1]) || 0.6 });
          break;
        case "pan":
          await sikEvent("pan", { dx: parseFloat(parts[1]) || 0, dy: parseFloat(parts[2]) || 0 });
          break;
        case "reset":
          await sikEvent("reset_view");
          break;
        case "grid":
          await sikEvent("toggle_grid");
          break;
        case "theme":
          await sikEvent("toggle_theme");
          break;
        case "info":
          await sikEvent("toggle_info");
          break;
        case "select":
          await sikEvent("select", { x: parseFloat(parts[1]) || 0.5, y: parseFloat(parts[2]) || 0.5 });
          break;
        case "focus":
        case "fa":
          await sikEvent("focus_agent", { agent: parts.slice(1).join(" ") || "" });
          break;
        case "focusn":
        case "fn":
          await sikEvent("focus_node", { nodeId: parts[1] || "" });
          break;
        case "goto":
        case "g": {
          const extra: Record<string, unknown> = {
            wx: parseFloat(parts[1]) || 0,
            wy: parseFloat(parts[2]) || 0,
          };
          if (parts[3]) extra.focusZoom = parseFloat(parts[3]);
          await sikEvent("pan_to_region", extra);
          break;
        }
        case "voice":
          await voiceInput(parts.slice(1).join(" ") || "Hello Eywa");
          break;
        case "respond":
          await voiceResponse(parts.slice(1).join(" ") || "I hear you");
          break;
        case "inject":
          await voiceInject(parts.slice(1).join(" ") || "test injection");
          break;
        case "sync":
          await syncRequest();
          break;
        case "run": {
          const s = scenarios.find((s) => s.name === parts[1]);
          if (s) {
            console.log(`Running scenario: ${s.name} - ${s.description}`);
            await s.run();
          } else {
            console.log(`Unknown scenario "${parts[1]}". Use "list" to see available scenarios.`);
          }
          break;
        }
        case "list":
          console.log("\nScenarios:");
          for (const s of scenarios) {
            console.log(`  ${s.name.padEnd(20)} ${s.description}`);
          }
          break;
        case "q":
        case "quit":
        case "exit":
          rl.close();
          process.exit(0);
        default:
          console.log(`Unknown command: ${cmd}. Type a command or "list" for scenarios.`);
      }
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
    }
  }
}

// --- Main ---

async function main() {
  if (LIST) {
    console.log("Available scenarios:");
    for (const s of scenarios) {
      console.log(`  ${s.name.padEnd(20)} ${s.description}`);
    }
    process.exit(0);
  }

  const channelKey = `spectacles:${FOLD}:${DEVICE_ID}`;
  console.log(`Connecting to ${SUPABASE_URL}`);
  console.log(`Channel: ${channelKey}`);

  channel = supabase.channel(channelKey, {
    config: { broadcast: { ack: false, self: false } },
  });

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("Connected and subscribed.");
        resolve();
      } else if (status === "CHANNEL_ERROR") {
        reject(new Error("Failed to subscribe to channel"));
      }
    });
  });

  if (SCENARIO) {
    const s = scenarios.find((s) => s.name === SCENARIO);
    if (!s) {
      console.error(`Unknown scenario: ${SCENARIO}`);
      console.log("Available:", scenarios.map((s) => s.name).join(", "));
      process.exit(1);
    }
    console.log(`\nRunning scenario: ${s.name} - ${s.description}\n`);
    await s.run();
    console.log("\nDone.");
    process.exit(0);
  }

  await interactive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
