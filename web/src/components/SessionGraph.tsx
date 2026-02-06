import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import * as d3 from "d3";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import type { Memory, Link } from "../lib/supabase";
import { agentColor } from "../lib/agentColor";
import { ANIMAL_SPRITES, CUTE_COUNT } from "./animalSprites";

function agentColorHex(name: string): string {
  return agentColor(name);
}

function getAnimalSprite(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 7) - hash + name.charCodeAt(i)) | 0;
  }
  // 75% chance of a cute animal (first CUTE_COUNT), 25% from the rest
  const roll = Math.abs(hash >> 4) % 4;
  if (roll > 0) {
    return ANIMAL_SPRITES[Math.abs(hash) % CUTE_COUNT];
  }
  return ANIMAL_SPRITES[CUTE_COUNT + (Math.abs(hash) % (ANIMAL_SPRITES.length - CUTE_COUNT))];
}

// --- Layout constants ---

const TRACK_GAP = 22;
const TRACK_LEFT = 28;
const ROW_HEIGHT = 30;
const NODE_R = 7;
const LABEL_GAP = 20;
const TOP_PAD = 16;
const BOTTOM_PAD = 24;
const LINE_WIDTH = 2;

// Snap to pixel grid: even-width strokes align on integers,
// odd-width strokes align on .5 for sharp rendering.
function snap(v: number, strokeWidth: number): number {
  return strokeWidth % 2 === 0 ? Math.round(v) : Math.round(v) + 0.5;
}

// Step path: horizontal to target column, one rounded corner, vertical into target.
function stepPath(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `M ${x1},${y1} L ${x2},${y2}`;
  // Same column: bump out to the right so the curve is visible
  let tx = x2;
  if (x1 === x2) tx = x1 + TRACK_GAP * 0.5;
  const r = Math.min(8, Math.abs(tx - x1), Math.abs(y2 - y1) / 2);
  const sx = tx > x1 ? 1 : -1;
  const sy = y2 > y1 ? 1 : -1;
  if (x1 === x2) {
    // Same track: horizontal out, corner, vertical, corner, horizontal back in
    return [
      `M ${x1},${y1}`,
      `L ${tx - r * sx},${y1}`,
      `Q ${tx},${y1} ${tx},${y1 + r * sy}`,
      `L ${tx},${y2 - r * sy}`,
      `Q ${tx},${y2} ${tx - r * sx},${y2}`,
      `L ${x2},${y2}`,
    ].join(" ");
  }
  return `M ${x1},${y1} L ${tx - r * sx},${y1} Q ${tx},${y1} ${tx},${y1 + r * sy} L ${tx},${y2}`;
}

// --- Data types ---

interface GraphEvent {
  id: string;
  type: "start" | "end" | "inject" | "knowledge" | "work";
  agent: string;
  user: string;
  sessionId: string;
  ts: Date;
  label: string;
  status?: string;
  priority?: string;
  targetUser?: string;
}

interface LayoutEvent extends GraphEvent {
  row: number;
  trackIdx: number;
}

interface Track {
  user: string;
  color: string;
  idx: number;
  x: number;
  // row ranges where this track is "active" (has a running session)
  segments: { startRow: number; endRow: number | null }[];
}

interface Edge {
  fromTrack: number;
  toTrack: number;
  fromRow: number;
  toRow: number;
  color: string;
  label: string;
}

interface GraphData {
  tracks: Track[];
  events: LayoutEvent[];
  edges: Edge[];
  totalRows: number;
  labelX: number;
  svgWidth: number;
  svgHeight: number;
}

// --- Event extraction (same logic, reused) ---

function extractEvents(memories: Memory[]): GraphEvent[] {
  const events: GraphEvent[] = [];
  const toolCountBySession = new Map<string, number>();

  for (const m of memories) {
    if (m.message_type === "tool_call") {
      toolCountBySession.set(
        m.session_id,
        (toolCountBySession.get(m.session_id) ?? 0) + 1
      );
    }
  }

  for (const m of memories) {
    const meta = m.metadata ?? {};
    const user = (meta.user as string) ?? m.agent.split("/")[0];
    const event = meta.event as string | undefined;

    if (event === "session_start") {
      events.push({
        id: m.id, type: "start", agent: m.agent, user,
        sessionId: m.session_id, ts: new Date(m.ts),
        label: (meta.task as string) ?? "session",
      });
    } else if (event === "session_end" || event === "session_done") {
      events.push({
        id: m.id, type: "end", agent: m.agent, user,
        sessionId: m.session_id, ts: new Date(m.ts),
        label: (meta.summary as string) ?? "",
        status: (meta.status as string) ?? "completed",
      });
    } else if (event === "context_injection") {
      const target = (meta.target as string) ?? (meta.target_agent as string) ?? "all";
      const targetUser = target === "all" ? "all" : target.split("/")[0];
      events.push({
        id: m.id, type: "inject", agent: m.agent, user,
        sessionId: m.session_id, ts: new Date(m.ts),
        label: (meta.label as string) ?? "inject",
        priority: (meta.priority as string) ?? "normal",
        targetUser,
      });
    } else if (event === "knowledge_stored") {
      events.push({
        id: m.id, type: "knowledge", agent: m.agent, user,
        sessionId: m.session_id, ts: new Date(m.ts),
        label: (meta.title as string) ?? "knowledge",
      });
    }
  }

  // Synthetic work events for busy sessions
  for (const [sessionId, count] of toolCountBySession) {
    if (count < 3) continue;
    const sample = memories.find((m) => m.session_id === sessionId);
    if (!sample) continue;
    const meta = sample.metadata ?? {};
    const user = (meta.user as string) ?? sample.agent.split("/")[0];
    const sessionMems = memories.filter(
      (m) => m.session_id === sessionId && m.message_type === "tool_call"
    );
    const mid = sessionMems[Math.floor(sessionMems.length / 2)];
    if (mid) {
      events.push({
        id: `work-${sessionId}`, type: "work", agent: sample.agent, user,
        sessionId, ts: new Date(mid.ts), label: `${count} tool calls`,
      });
    }
  }

  return events;
}

// --- Build layout ---

function buildGraphData(memories: Memory[]): GraphData {
  const empty: GraphData = {
    tracks: [], events: [], edges: [],
    totalRows: 0, labelX: 0, svgWidth: 0, svgHeight: 0,
  };
  if (memories.length === 0) return empty;

  const rawEvents = extractEvents(memories);
  rawEvents.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  if (rawEvents.length === 0) return empty;

  // Assign tracks by user, ordered by first appearance
  const userOrder: string[] = [];
  const userSet = new Set<string>();
  for (const e of rawEvents) {
    if (!userSet.has(e.user)) { userSet.add(e.user); userOrder.push(e.user); }
    if (e.targetUser && e.targetUser !== "all" && !userSet.has(e.targetUser)) {
      userSet.add(e.targetUser); userOrder.push(e.targetUser);
    }
  }

  const trackByUser = new Map<string, number>();
  const tracks: Track[] = userOrder.map((user, idx) => {
    trackByUser.set(user, idx);
    return {
      user, color: agentColorHex(user), idx,
      x: TRACK_LEFT + idx * TRACK_GAP,
      segments: [],
    };
  });

  // Assign rows
  const layoutEvents: LayoutEvent[] = rawEvents.map((ev, row) => ({
    ...ev,
    row,
    trackIdx: trackByUser.get(ev.user) ?? 0,
  }));

  const totalRows = layoutEvents.length;

  // Build session segments (track active ranges)
  const sessionStarts = new Map<string, { row: number; user: string }>();
  for (const ev of layoutEvents) {
    if (ev.type === "start") {
      sessionStarts.set(ev.sessionId, { row: ev.row, user: ev.user });
    } else if (ev.type === "end") {
      const start = sessionStarts.get(ev.sessionId);
      const tIdx = trackByUser.get(ev.user);
      if (tIdx !== undefined) {
        tracks[tIdx].segments.push({
          startRow: start?.row ?? Math.max(0, ev.row - 1),
          endRow: ev.row,
        });
      }
      sessionStarts.delete(ev.sessionId);
    }
  }
  // Open sessions
  for (const [, info] of sessionStarts) {
    const tIdx = trackByUser.get(info.user);
    if (tIdx !== undefined) {
      tracks[tIdx].segments.push({ startRow: info.row, endRow: null });
    }
  }

  // Build edges for injections
  const edges: Edge[] = [];
  for (const ev of layoutEvents) {
    if (ev.type !== "inject" || !ev.targetUser) continue;
    const fromIdx = trackByUser.get(ev.user);
    if (fromIdx === undefined) continue;
    const color = tracks[fromIdx].color;

    if (ev.targetUser === "all") {
      for (const t of tracks) {
        if (t.idx !== fromIdx) {
          edges.push({
            fromTrack: fromIdx, toTrack: t.idx,
            fromRow: ev.row, toRow: ev.row,
            color, label: ev.label,
          });
        }
      }
    } else {
      const toIdx = trackByUser.get(ev.targetUser);
      if (toIdx !== undefined && toIdx !== fromIdx) {
        edges.push({
          fromTrack: fromIdx, toTrack: toIdx,
          fromRow: ev.row, toRow: ev.row,
          color, label: ev.label,
        });
      }
    }
  }

  const graphRight = TRACK_LEFT + (tracks.length - 1) * TRACK_GAP;
  const labelX = graphRight + LABEL_GAP;
  const LABEL_MAX = 380;
  const svgWidth = labelX + LABEL_MAX + 16;
  const svgHeight = TOP_PAD + totalRows * ROW_HEIGHT + BOTTOM_PAD;

  return { tracks, events: layoutEvents, edges, totalRows, labelX, svgWidth, svgHeight };
}

// --- Helpers ---

function rowY(row: number): number {
  return TOP_PAD + row * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "#f2a5c8";
    case "blocked": return "#e8b0d0";
    case "failed": return "#d4809a";
    default: return "#ddc0d0";
  }
}

// --- Pixel creature rendered as SVG <image> via data URI ---

function creatureSvgMarkup(name: string, color: string): string {
  const sprite = getAnimalSprite(name);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  // All tones stay bright - the base color is the darkest, body is near-white
  const mix = (v: number, t: number) => Math.round(v + (255 - v) * t);
  const dark = color;
  const mid = `rgb(${mix(r, 0.45)},${mix(g, 0.45)},${mix(b, 0.45)})`;
  const light = `rgb(${mix(r, 0.8)},${mix(g, 0.8)},${mix(b, 0.8)})`;
  const fills = ["none", dark, mid, light];

  const ROWS = sprite.grid.length;
  const COLS = sprite.grid[0].length;
  let rects = "";
  for (let ry = 0; ry < ROWS; ry++) {
    for (let cx = 0; cx < COLS; cx++) {
      const cell = sprite.grid[ry][cx];
      if (cell === 0) continue;
      rects += `<rect x="${cx}" y="${ry}" width="1" height="1" fill="${fills[cell]}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLS} ${ROWS}" shape-rendering="crispEdges">${rects}</svg>`;
}

const creatureCache = new Map<string, string>();
function creatureDataUri(name: string, color: string): string {
  const key = `${name}:${color}`;
  let uri = creatureCache.get(key);
  if (!uri) {
    uri = `data:image/svg+xml;base64,${btoa(creatureSvgMarkup(name, color))}`;
    creatureCache.set(key, uri);
  }
  return uri;
}

// --- Tooltip ---

interface TooltipData {
  x: number;
  y: number;
  event: LayoutEvent;
}

function Tooltip({ data }: { data: TooltipData }) {
  const { event } = data;
  return (
    <div className="graph-tooltip" style={{ left: data.x + 14, top: data.y - 10 }}>
      <div className="graph-tooltip-type">{event.type}</div>
      <div className="graph-tooltip-agent">
        {event.type === "inject" && event.targetUser
          ? `${event.user} → ${event.targetUser}`
          : event.agent}
      </div>
      {event.label && event.label !== "inject" && (
        <div className="graph-tooltip-label">{event.label}</div>
      )}
      {event.status && (
        <div className="graph-tooltip-status" style={{ color: statusColor(event.status) }}>
          {event.status}
        </div>
      )}
      <div className="graph-tooltip-time">
        {event.ts.toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
        {event.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}

// --- D3 rendering ---

interface LinkEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  type: string;
}

type SegmentDatum = { track: Track; seg: { startRow: number; endRow: number | null }; si: number };

interface RenderCallbacks {
  onHover: (clientX: number, clientY: number, ev: LayoutEvent) => void;
  onLeave: () => void;
  onTrackHover: (trackIdx: number | null) => void;
}

function renderGraph(
  svgEl: SVGSVGElement,
  graph: GraphData,
  linkEdges: LinkEdge[],
  callbacks: RenderCallbacks,
): d3.ZoomBehavior<SVGSVGElement, unknown> {
  const svg = d3.select(svgEl);

  // Width controlled by CSS (100%). Height from data so container sizes correctly.
  svg.attr("width", null).attr("height", graph.svgHeight);

  // Get or create zoom group
  let zoomGroup = svg.select<SVGGElement>("g.zoom-group");
  if (zoomGroup.empty()) {
    zoomGroup = svg.append("g").attr("class", "zoom-group");
  }

  // Clear previous content inside zoom group
  zoomGroup.selectAll("*").remove();

  // --- Layer 1: Track highlight rects (initially invisible) ---
  const hlGroup = zoomGroup.append("g").attr("class", "track-highlights");
  hlGroup.selectAll("rect.track-hl")
    .data(graph.tracks)
    .join("rect")
    .attr("class", "track-hl")
    .attr("x", d => d.x - TRACK_GAP / 2)
    .attr("y", TOP_PAD)
    .attr("width", TRACK_GAP)
    .attr("height", graph.svgHeight - TOP_PAD - BOTTOM_PAD)
    .attr("fill", d => d.color)
    .attr("opacity", 0);

  // --- Layer 2: Track guides (faint vertical guidelines) ---
  const guideGroup = zoomGroup.append("g").attr("class", "track-guides");
  guideGroup.selectAll("line")
    .data(graph.tracks)
    .join("line")
    .attr("x1", d => snap(d.x, 1))
    .attr("y1", TOP_PAD)
    .attr("x2", d => snap(d.x, 1))
    .attr("y2", graph.svgHeight - BOTTOM_PAD)
    .attr("stroke", d => d.color)
    .attr("stroke-width", 1)
    .attr("opacity", 0.08)
    .attr("shape-rendering", "crispEdges");

  // --- Layer 3: Track segments (active session lines) ---
  const segGroup = zoomGroup.append("g").attr("class", "track-segments");
  const segmentData: SegmentDatum[] = [];
  for (const track of graph.tracks) {
    if (track.segments.length === 0) {
      // Ghost line for inactive tracks
      segmentData.push({
        track,
        seg: { startRow: 0, endRow: graph.totalRows - 1 },
        si: -1, // -1 signals ghost
      });
    } else {
      track.segments.forEach((seg, si) => {
        segmentData.push({ track, seg, si });
      });
    }
  }

  segGroup.selectAll("line")
    .data(segmentData)
    .join("line")
    .attr("class", "track-seg")
    .attr("x1", d => snap(d.track.x, d.si === -1 ? 1 : LINE_WIDTH))
    .attr("y1", d => d.si === -1 ? TOP_PAD : rowY(d.seg.startRow))
    .attr("x2", d => snap(d.track.x, d.si === -1 ? 1 : LINE_WIDTH))
    .attr("y2", d => {
      if (d.si === -1) return graph.svgHeight - BOTTOM_PAD;
      return d.seg.endRow !== null ? rowY(d.seg.endRow) : graph.svgHeight - BOTTOM_PAD;
    })
    .attr("stroke", d => d.track.color)
    .attr("stroke-width", d => d.si === -1 ? 1 : LINE_WIDTH)
    .attr("stroke-linecap", "butt")
    .attr("opacity", d => {
      if (d.si === -1) return 0.15;
      return d.seg.endRow === null ? 0.5 : 0.85;
    })
    .attr("stroke-dasharray", d => {
      if (d.si === -1) return null;
      return d.seg.endRow === null ? "6 3" : null;
    })
    .attr("shape-rendering", "crispEdges");

  // --- Layer 4: Injection edges ---
  const edgeGroup = zoomGroup.append("g").attr("class", "injection-edges");
  edgeGroup.selectAll("path")
    .data(graph.edges)
    .join("path")
    .attr("d", d => {
      const x1 = snap(TRACK_LEFT + d.fromTrack * TRACK_GAP, LINE_WIDTH);
      const x2 = snap(TRACK_LEFT + d.toTrack * TRACK_GAP, LINE_WIDTH);
      const y1 = rowY(d.fromRow);
      const y2 = d.fromRow === d.toRow ? y1 : rowY(d.toRow);
      return stepPath(x1, y1, x2, y2);
    })
    .attr("stroke", d => d.color)
    .attr("stroke-width", 2)
    .attr("fill", "none")
    .attr("opacity", 0.55)
    .attr("shape-rendering", "geometricPrecision");

  // --- Layer 5: Link edges (dashed paths + endpoint markers) ---
  const linkGroup = zoomGroup.append("g").attr("class", "link-edges");
  linkGroup.selectAll("path")
    .data(linkEdges)
    .join("path")
    .attr("d", d => stepPath(d.fromX, d.fromY, d.toX, d.toY))
    .attr("stroke", d => d.color)
    .attr("stroke-width", 2.5)
    .attr("stroke-dasharray", "6 3")
    .attr("fill", "none")
    .attr("opacity", 0.7)
    .attr("shape-rendering", "geometricPrecision");

  // Link endpoint markers
  const linkEnds = zoomGroup.append("g").attr("class", "link-endpoints");
  const endpointGroups = linkEnds.selectAll("g")
    .data(linkEdges)
    .join("g");

  endpointGroups.append("circle")
    .attr("cx", d => d.fromX)
    .attr("cy", d => d.fromY)
    .attr("r", 4)
    .attr("fill", d => d.color)
    .attr("opacity", 0.8);

  endpointGroups.append("polygon")
    .attr("points", d =>
      `${d.toX},${d.toY - 5} ${d.toX + 4},${d.toY} ${d.toX},${d.toY + 5} ${d.toX - 4},${d.toY}`
    )
    .attr("fill", d => d.color)
    .attr("opacity", 0.8);

  // --- Layer 6: Event nodes ---
  const nodeGroup = zoomGroup.append("g").attr("class", "event-nodes");

  const nodeGs = nodeGroup.selectAll("g")
    .data(graph.events)
    .join("g")
    .attr("class", "event-node")
    .style("cursor", "pointer")
    .on("mouseenter", function (event: MouseEvent, ev: LayoutEvent) {
      callbacks.onHover(event.clientX, event.clientY, ev);
    })
    .on("mouseleave", function () {
      callbacks.onLeave();
    });

  // Start / end / knowledge nodes: filled circle + border + creature image
  const bigNodes = nodeGs.filter(d => d.type === "start" || d.type === "end" || d.type === "knowledge");

  bigNodes.append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", NODE_R + 2)
    .attr("fill", d => d.type === "end" ? statusColor(d.status ?? "completed") : graph.tracks[d.trackIdx].color)
    .attr("shape-rendering", "geometricPrecision");

  bigNodes.append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", NODE_R + 2)
    .attr("fill", "none")
    .attr("stroke", "var(--color-fill)")
    .attr("stroke-width", 2)
    .attr("shape-rendering", "geometricPrecision");

  const iconSize = NODE_R * 2.6;
  bigNodes.append("image")
    .attr("href", d => creatureDataUri(d.user, graph.tracks[d.trackIdx].color))
    .attr("x", d => Math.round(graph.tracks[d.trackIdx].x - iconSize / 2))
    .attr("y", d => Math.round(rowY(d.row) - iconSize / 2))
    .attr("width", Math.round(iconSize))
    .attr("height", Math.round(iconSize))
    .style("image-rendering", "pixelated");

  // Inject nodes: outlined circle with inner dot
  const injectNodes = nodeGs.filter(d => d.type === "inject");

  injectNodes.append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", NODE_R)
    .attr("fill", "var(--color-fill)")
    .attr("stroke", d => graph.tracks[d.trackIdx].color)
    .attr("stroke-width", 2)
    .attr("shape-rendering", "geometricPrecision");

  injectNodes.append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", 3)
    .attr("fill", d => graph.tracks[d.trackIdx].color)
    .attr("shape-rendering", "geometricPrecision");

  // Work nodes: faded circle with inner dot
  const workNodes = nodeGs.filter(d => d.type === "work");

  workNodes.append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", NODE_R - 1)
    .attr("fill", d => graph.tracks[d.trackIdx].color)
    .attr("opacity", 0.35)
    .attr("shape-rendering", "geometricPrecision");

  workNodes.append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", 3)
    .attr("fill", d => graph.tracks[d.trackIdx].color)
    .attr("opacity", 0.7)
    .attr("shape-rendering", "geometricPrecision");

  // Event labels
  const MAX_LABEL = 50;
  nodeGs.append("text")
    .attr("x", graph.labelX)
    .attr("y", d => rowY(d.row) + 4)
    .attr("font-size", 12)
    .attr("fill", "var(--color-text-primary)")
    .attr("class", "graph-event-label")
    .text(d => {
      let raw = "";
      if (d.type === "start") raw = d.label;
      else if (d.type === "end") raw = d.label || d.status || "done";
      else raw = d.label;
      return raw.length > MAX_LABEL ? raw.slice(0, MAX_LABEL) + "\u2026" : raw;
    });

  // --- Layer 7: Track hit areas (transparent wide rects for hover detection) ---
  const hitGroup = zoomGroup.append("g").attr("class", "track-hitareas");

  // Track username labels (shown on hover, initially hidden)
  const labelGroup = zoomGroup.append("g").attr("class", "track-user-labels");
  labelGroup.selectAll("text")
    .data(graph.tracks)
    .join("text")
    .attr("class", "track-user-label")
    .attr("x", d => d.x)
    .attr("y", TOP_PAD - 4)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("font-weight", 600)
    .attr("fill", d => d.color)
    .attr("opacity", 0)
    .text(d => d.user);

  hitGroup.selectAll("rect")
    .data(graph.tracks)
    .join("rect")
    .attr("x", d => d.x - TRACK_GAP / 2)
    .attr("y", 0)
    .attr("width", TRACK_GAP)
    .attr("height", graph.svgHeight)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("mouseenter", function (_event: MouseEvent, d: Track) {
      callbacks.onTrackHover(d.idx);
    })
    .on("mouseleave", function () {
      callbacks.onTrackHover(null);
    });

  // --- Zoom behavior ---
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 3])
    .on("zoom", (event) => {
      zoomGroup.attr("transform", event.transform.toString());
    });

  svg.call(zoom);

  // Initial fit: scale to fill container width, cap at 1x
  const container = svgEl.parentElement;
  if (container) {
    const containerW = container.clientWidth;
    const scaleX = containerW / graph.svgWidth;
    const scale = Math.min(scaleX, 1);
    const tx = (containerW - graph.svgWidth * scale) / 2;
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, 0).scale(scale));
  }

  return zoom;
}

// --- Update track highlighting based on hoveredTrack ---

function updateTrackHighlight(svgEl: SVGSVGElement, hoveredTrack: number | null) {
  const svg = d3.select(svgEl);

  // Highlight rects
  svg.selectAll("rect.track-hl")
    .attr("opacity", (_, i) => (hoveredTrack !== null && i === hoveredTrack) ? 0.08 : 0);

  // Username labels
  svg.selectAll("text.track-user-label")
    .attr("opacity", (_, i) => (hoveredTrack !== null && i === hoveredTrack) ? 1 : 0);

  // Dim non-hovered track segments and nodes
  if (hoveredTrack !== null) {
    svg.selectAll("line.track-seg")
      .attr("opacity", function () {
        const existing = d3.select(this);
        const originalOpacity = parseFloat(existing.attr("data-orig-opacity") ?? existing.attr("opacity") ?? "1");
        // Store original opacity on first hover
        if (!existing.attr("data-orig-opacity")) {
          existing.attr("data-orig-opacity", existing.attr("opacity"));
        }
        const datum = d3.select(this).datum() as SegmentDatum | undefined;
        if (datum && datum.track.idx === hoveredTrack) return originalOpacity;
        return originalOpacity * 0.25;
      });

    svg.selectAll("g.event-node")
      .attr("opacity", function () {
        const datum = d3.select(this).datum() as LayoutEvent | undefined;
        if (datum && datum.trackIdx === hoveredTrack) return 1;
        return 0.3;
      });
  } else {
    // Restore original opacities
    svg.selectAll("line.track-seg")
      .attr("opacity", function () {
        const orig = d3.select(this).attr("data-orig-opacity");
        if (orig) {
          d3.select(this).attr("data-orig-opacity", null);
          return orig;
        }
        return d3.select(this).attr("opacity");
      });

    svg.selectAll("g.event-node")
      .attr("opacity", 1);
  }
}

// --- Main component ---

interface SessionGraphProps {
  links?: Link[];
}

export function SessionGraph({ links = [] }: SessionGraphProps) {
  const { room } = useRoomContext();
  const { memories, loading } = useRealtimeMemories(room?.id ?? null, 1000);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const graph = useMemo(() => buildGraphData(memories), [memories]);

  // Map links onto the graph
  const linkEdges = useMemo(() => {
    if (!links.length || !graph.events.length) return [];
    const memToRow = new Map<string, number>();
    const sessionToTrack = new Map<string, { trackIdx: number; lastRow: number }>();

    for (const ev of graph.events) {
      memToRow.set(ev.id, ev.row);
      const key = ev.sessionId;
      const existing = sessionToTrack.get(key);
      if (!existing || ev.row > existing.lastRow) {
        sessionToTrack.set(key, { trackIdx: ev.trackIdx, lastRow: ev.row });
      }
    }

    const edges: LinkEdge[] = [];
    for (const link of links) {
      const sourceRow = memToRow.get(link.source_memory_id);
      const targetInfo = sessionToTrack.get(link.target_session_id);
      if (sourceRow === undefined || !targetInfo) continue;

      const sourceEvent = graph.events.find((e) => e.id === link.source_memory_id);
      if (!sourceEvent) continue;

      const fromTrack = graph.tracks[sourceEvent.trackIdx];
      const toTrack = graph.tracks[targetInfo.trackIdx];
      if (!fromTrack || !toTrack) continue;

      const toRow = link.target_position === "head" ? targetInfo.lastRow : sourceRow;

      edges.push({
        fromX: fromTrack.x,
        fromY: rowY(sourceRow),
        toX: toTrack.x,
        toY: rowY(toRow),
        color: link.link_type === "inject" ? "#E64980" : link.link_type === "fork" ? "#51CF66" : "#8CA9FF",
        type: link.link_type,
      });
    }
    return edges;
  }, [links, graph]);

  // Main D3 render effect
  useEffect(() => {
    if (!svgRef.current || graph.events.length === 0) return;
    zoomRef.current = renderGraph(svgRef.current, graph, linkEdges, {
      onHover: (clientX, clientY, ev) => {
        const container = svgRef.current?.parentElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        setTooltip({ x: clientX - rect.left, y: clientY - rect.top, event: ev });
      },
      onLeave: () => setTooltip(null),
      onTrackHover: setHoveredTrack,
    });
  }, [graph, linkEdges]);

  // Track highlight effect
  useEffect(() => {
    if (!svgRef.current) return;
    updateTrackHighlight(svgRef.current, hoveredTrack);
  }, [hoveredTrack]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition().duration(200)
      .call(zoomRef.current.scaleBy, 1.3);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition().duration(200)
      .call(zoomRef.current.scaleBy, 1 / 1.3);
  }, []);

  const handleZoomFit = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const container = svgRef.current.parentElement;
    if (!container) return;
    const containerW = container.clientWidth;
    const scaleX = containerW / graph.svgWidth;
    const scale = Math.min(scaleX, 1);
    const tx = (containerW - graph.svgWidth * scale) / 2;
    d3.select(svgRef.current)
      .transition().duration(300)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, 0).scale(scale));
  }, [graph.svgWidth]);

  if (loading) {
    return (
      <div className="session-graph">
        <div className="session-graph-header">
          <h2 className="section-title">Session Graph</h2>
        </div>
        <p style={{ color: "var(--color-text-muted)", padding: "1rem" }}>Loading...</p>
      </div>
    );
  }

  if (graph.events.length === 0) {
    return (
      <div className="session-graph">
        <div className="session-graph-header">
          <h2 className="section-title">Session Graph</h2>
        </div>
        <p style={{ color: "var(--color-text-muted)", padding: "1rem" }}>
          No session events yet. Start and stop agent sessions to see the graph.
        </p>
      </div>
    );
  }

  return (
    <div className="session-graph">
      <div className="session-graph-header">
        <h2 className="section-title">Session Graph</h2>
        <div className="graph-legend">
          {graph.tracks.map((t) => (
            <span key={t.user} className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: t.color }} />
              {t.user}
            </span>
          ))}
        </div>
      </div>
      <div className="session-graph-canvas" style={{ position: "relative" }}>
        <svg ref={svgRef}>
          <g className="zoom-group" />
        </svg>

        <div className="graph-zoom-controls">
          <button onClick={handleZoomIn} title="Zoom in">+</button>
          <button onClick={handleZoomOut} title="Zoom out">-</button>
          <button onClick={handleZoomFit} title="Fit to view">Fit</button>
        </div>

        {tooltip && <Tooltip data={tooltip} />}
      </div>
    </div>
  );
}
