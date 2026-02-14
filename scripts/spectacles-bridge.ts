#!/usr/bin/env npx tsx
/**
 * Spectacles HTTP Bridge
 *
 * Bridges Supabase Realtime (WebSocket) to HTTP so Lens Studio preview
 * can receive frames and scene ops without WebSocket support.
 *
 * Subscribes to the same Supabase Realtime channel as SpectaclesView,
 * stores the latest frame + scene state, and serves them via HTTP.
 * Also accepts interaction events via POST and forwards to Realtime.
 *
 * Usage:
 *   npx tsx scripts/spectacles-bridge.ts
 *   npx tsx scripts/spectacles-bridge.ts --fold demo --device editor --port 8765
 */

import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import * as http from "http";
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
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY.");
  process.exit(1);
}

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const FOLD = getArg("fold", "demo");
const DEVICE = getArg("device", "editor");
const PORT = parseInt(getArg("port", "8765"), 10);

// --- State ---

let latestFrame: Buffer | null = null; // raw JPEG bytes
let latestFrameB64: string | null = null; // base64 string
let latestScene: any[] = []; // pending scene ops
let sceneVersion = 0;
let frameCount = 0;
let lastFrameTime = 0;

// Per-tile texture storage for TilePanel polling
let texVersion = 0;
const tileTextures: Map<string, { image: string; version: number }> = new Map();

// Interaction queue: events from LS preview to forward to Supabase
const interactionQueue: any[] = [];

// Web-bound event queue: interactions + commands for SpectaclesView to poll via HTTP
// (Supabase Realtime relay is unreliable with REST fallback, so we use direct HTTP polling)
const webEventQueue: any[] = [];

// --- Supabase ---

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
let channel: RealtimeChannel;

async function connectChannel() {
  const channelKey = `spectacles:${FOLD}:${DEVICE}`;
  console.log(`Subscribing to ${channelKey}`);

  channel = supabase.channel(channelKey, {
    config: { broadcast: { ack: false, self: false } },
  });

  // Capture scene ops
  channel.on("broadcast", { event: "scene" }, (msg) => {
    const payload = msg.payload;
    if (payload?.ops) {
      latestScene = payload.ops;
      sceneVersion++;
    }
  });

  // Capture single-tile textures
  channel.on("broadcast", { event: "tex" }, (msg) => {
    const p = msg.payload;
    if (p?.id && p?.image) {
      texVersion++;
      tileTextures.set(p.id, { image: p.image, version: texVersion });
      latestFrameB64 = p.image;
      latestFrame = Buffer.from(p.image, "base64");
      frameCount++;
      lastFrameTime = Date.now();
    }
  });

  // Capture tex_batch (SpectaclesView sends this)
  channel.on("broadcast", { event: "tex_batch" }, (msg) => {
    const textures = msg.payload?.textures;
    if (!Array.isArray(textures)) return;
    for (const t of textures) {
      if (t.id && t.image) {
        texVersion++;
        tileTextures.set(t.id, { image: t.image, version: texVersion });
        latestFrameB64 = t.image;
        latestFrame = Buffer.from(t.image, "base64");
        frameCount++;
        lastFrameTime = Date.now();
      }
    }
  });

  // Capture legacy frame events
  channel.on("broadcast", { event: "frame" }, (msg) => {
    const p = msg.payload;
    if (p?.image) {
      latestFrameB64 = p.image;
      latestFrame = Buffer.from(p.image, "base64");
      frameCount++;
      lastFrameTime = Date.now();
    }
  });

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("Subscribed to Supabase Realtime.");
        resolve();
      } else if (status === "CHANNEL_ERROR") {
        reject(new Error("Channel subscription failed"));
      }
    });
  });

  // Request sync from web broadcaster
  channel.send({
    type: "broadcast",
    event: "sync_request",
    payload: {},
  });
}

// Forward queued interactions to Supabase
function flushInteractions() {
  while (interactionQueue.length > 0) {
    const event = interactionQueue.shift();
    channel.send({
      type: "broadcast",
      event: event.event || "interact",
      payload: event.payload || event,
    });
  }
}

setInterval(flushInteractions, 50);

// --- HTTP Server ---

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // GET /frame → latest JPEG as binary (for InternetModule.performHttpRequest)
  if (pathname === "/frame" && req.method === "GET") {
    if (!latestFrame) {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": latestFrame.length.toString(),
      "X-Frame-Count": frameCount.toString(),
      "X-Scene-Version": sceneVersion.toString(),
    });
    res.end(latestFrame);
    return;
  }

  // GET /frame64 → latest frame as base64 text (for Base64.decodeTextureAsync)
  if (pathname === "/frame64" && req.method === "GET") {
    if (!latestFrameB64) {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "X-Frame-Count": frameCount.toString(),
      "X-Scene-Version": sceneVersion.toString(),
    });
    res.end(latestFrameB64);
    return;
  }

  // GET /scene → latest scene ops as JSON
  if (pathname === "/scene" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "X-Scene-Version": sceneVersion.toString(),
    });
    res.end(JSON.stringify({ ops: latestScene, version: sceneVersion }));
    return;
  }

  // GET /textures → per-tile textures as JSON (for TilePanel HTTP polling)
  // ?since=N returns only tiles updated since version N
  if (pathname === "/textures" && req.method === "GET") {
    const since = parseInt(url.searchParams.get("since") || "0", 10);
    const tiles: Array<{ id: string; image: string; v: number }> = [];
    for (const [id, entry] of tileTextures) {
      if (entry.version > since) {
        tiles.push({ id, image: entry.image, v: entry.version });
      }
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "X-Tex-Version": texVersion.toString(),
    });
    res.end(JSON.stringify({ tiles, version: texVersion }));
    return;
  }

  // GET /status → connection and frame stats
  if (pathname === "/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      connected: true,
      fold: FOLD,
      device: DEVICE,
      frameCount,
      sceneVersion,
      texVersion,
      tileCount: tileTextures.size,
      lastFrameAge: lastFrameTime ? Date.now() - lastFrameTime : -1,
      hasFrame: !!latestFrame,
    }));
    return;
  }

  // GET /events → drain web-bound event queue (SpectaclesView polls this)
  if (pathname === "/events" && req.method === "GET") {
    const events = webEventQueue.splice(0);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ events }));
    return;
  }

  // POST /interact → queue interaction event for forwarding to web + Supabase
  if (pathname === "/interact" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        interactionQueue.push(data);
        // Also queue for web HTTP polling
        webEventQueue.push({ event: "interact", payload: data.payload || data });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end('{"error":"invalid json"}');
      }
    });
    return;
  }

  // POST /send → send arbitrary broadcast event + queue for web polling
  if (pathname === "/send" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const eventName = data.event || "interaction";
        const payload = data.payload || {};
        // Try Supabase relay (may not work with REST fallback)
        channel.send({ type: "broadcast", event: eventName, payload });
        // Also queue for web HTTP polling (reliable path)
        webEventQueue.push({ event: eventName, payload });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end('{"error":"invalid json"}');
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    error: "not found",
    endpoints: [
      "GET /frame - latest JPEG frame (binary)",
      "GET /frame64 - latest frame as base64 text",
      "GET /scene - latest scene ops (JSON)",
      "GET /textures - per-tile textures (JSON, ?since=N for incremental)",
      "GET /events - drain pending events for web (JSON)",
      "GET /status - connection status",
      "POST /interact - send interaction event",
      "POST /send - send arbitrary broadcast event",
    ],
  }));
}

// --- Main ---

async function main() {
  await connectChannel();

  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`\nSpectacles HTTP Bridge running on http://localhost:${PORT}`);
    console.log(`  Fold: ${FOLD}, Device: ${DEVICE}`);
    console.log(`  Channel: spectacles:${FOLD}:${DEVICE}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /frame    → latest JPEG (binary)`);
    console.log(`  GET  /frame64  → latest frame (base64 text)`);
    console.log(`  GET  /scene    → scene ops (JSON)`);
    console.log(`  GET  /textures → per-tile textures (JSON, ?since=N)`);
    console.log(`  GET  /status   → connection stats`);
    console.log(`  POST /interact → forward interaction to Supabase`);
    console.log(`  POST /send     → forward arbitrary event`);
    console.log(`\nWaiting for frames from web broadcaster...`);
  });

  // Periodic status
  setInterval(() => {
    if (frameCount > 0) {
      const age = Date.now() - lastFrameTime;
      if (age < 2000) {
        process.stdout.write(`\r  Frames: ${frameCount} | Tiles: ${tileTextures.size} | Scene v${sceneVersion} | Tex v${texVersion} | Last: ${age}ms ago    `);
      }
    }
  }, 1000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
