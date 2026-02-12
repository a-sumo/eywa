import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useFoldContext } from "../context/FoldContext";
import type { Memory, Link } from "../lib/supabase";
import { agentColor } from "../lib/agentColor";
import { getAvatarDataUri } from "./avatars";

function agentColorHex(name: string): string {
  return agentColor(name);
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
const LABEL_MAX = 600;

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

type EventType = "start" | "end" | "inject" | "knowledge" | "work" | "distress" | "checkpoint" | "progress" | "claim" | "destination" | "operation";

interface GraphEvent {
  id: string;
  type: EventType;
  agent: string;
  user: string;
  sessionId: string;
  ts: Date;
  label: string;
  status?: string;
  priority?: string;
  targetUser?: string;
  system?: string;
  action?: string;
  scope?: string;
  outcome?: string;
  percent?: number;
}

// Filter groups for the graph toolbar
const EVENT_TYPE_GROUPS: { label: string; types: EventType[]; color: string; defaultOn: boolean }[] = [
  { label: "Sessions", types: ["start", "end"], color: "#a78bfa", defaultOn: true },
  { label: "Injections", types: ["inject"], color: "#f472b6", defaultOn: true },
  { label: "Knowledge", types: ["knowledge"], color: "#c084fc", defaultOn: true },
  { label: "Distress", types: ["distress"], color: "#ef4444", defaultOn: true },
  { label: "Checkpoints", types: ["checkpoint"], color: "#eab308", defaultOn: true },
  { label: "Destination", types: ["destination"], color: "#8b5cf6", defaultOn: true },
  { label: "Claims", types: ["claim"], color: "#06b6d4", defaultOn: true },
  { label: "Progress", types: ["progress"], color: "#34d399", defaultOn: false },
  { label: "Operations", types: ["operation"], color: "#64748b", defaultOn: false },
  { label: "Work", types: ["work"], color: "#475569", defaultOn: false },
];

const OP_SYSTEM_COLORS: Record<string, string> = {
  git: "#f97316", database: "#06b6d4", api: "#8b5cf6", deploy: "#22c55e",
  infra: "#ec4899", browser: "#3b82f6", filesystem: "#64748b",
  communication: "#f472b6", terminal: "#a3e635", editor: "#38bdf8",
  ci: "#fb923c", cloud: "#818cf8",
};

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
    } else if (event === "distress") {
      events.push({
        id: m.id, type: "distress", agent: m.agent, user,
        sessionId: m.session_id, ts: new Date(m.ts),
        label: (meta.task as string) ?? "distress",
        status: meta.resolved === true ? "resolved" : "unresolved",
      });
    } else if (event === "checkpoint") {
      events.push({
        id: m.id, type: "checkpoint", agent: m.agent, user,
        sessionId: m.session_id, ts: new Date(m.ts),
        label: (meta.task as string) ?? "checkpoint",
      });
    } else if (event === "progress") {
      events.push({
        id: m.id, type: "progress", agent: m.agent, user,
        sessionId: m.session_id, ts: new Date(m.ts),
        label: (meta.task as string) ?? "progress",
        percent: (meta.percent as number) ?? 0,
        status: (meta.status as string) ?? "working",
      });
    } else if (event === "claim" || event === "unclaim") {
      events.push({
        id: m.id, type: "claim", agent: m.agent, user,
        sessionId: m.session_id, ts: new Date(m.ts),
        label: event === "claim" ? ((meta.scope as string) ?? "claim") : "unclaim",
      });
    } else if (event === "destination") {
      events.push({
        id: m.id, type: "destination", agent: m.agent, user,
        sessionId: m.session_id, ts: new Date(m.ts),
        label: (meta.destination as string) ?? "destination update",
      });
    } else if (!event && meta.system && meta.action) {
      // Operation-tagged log entry (no specific event, but has system/action metadata)
      events.push({
        id: m.id, type: "operation", agent: m.agent, user,
        sessionId: m.session_id, ts: new Date(m.ts),
        label: (meta.scope as string) ?? (m.content ?? "").slice(0, 100),
        system: meta.system as string,
        action: meta.action as string,
        scope: meta.scope as string | undefined,
        outcome: meta.outcome as string | undefined,
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

function buildGraphData(memories: Memory[], filterTypes?: Set<string>): GraphData {
  const empty: GraphData = {
    tracks: [], events: [], edges: [],
    totalRows: 0, labelX: 0, svgWidth: 0, svgHeight: 0,
  };
  if (memories.length === 0) return empty;

  let rawEvents = extractEvents(memories);
  if (filterTypes) {
    rawEvents = rawEvents.filter(e => filterTypes.has(e.type));
  }
  rawEvents.sort((a, b) => b.ts.getTime() - a.ts.getTime());
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

// --- Avatar data URI (kurzgesagt-style SVGs with hue rotation) ---

const creatureCache = new Map<string, string>();
function creatureDataUri(name: string, _color: string): string {
  let uri = creatureCache.get(name);
  if (!uri) {
    uri = getAvatarDataUri(name);
    creatureCache.set(name, uri);
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
      {event.percent !== undefined && (
        <div className="graph-tooltip-meta">{event.percent}% complete</div>
      )}
      {(event.system || event.action || event.outcome) && (
        <div className="graph-tooltip-ops">
          {event.system && <span className="graph-tooltip-pill" style={{ color: OP_SYSTEM_COLORS[event.system] || "#64748b" }}>{event.system}</span>}
          {event.action && <span className="graph-tooltip-pill">{event.action}</span>}
          {event.outcome && <span className="graph-tooltip-pill" style={{
            color: event.outcome === "success" ? "#6ee7b7" : event.outcome === "failure" ? "#fca5a5" : event.outcome === "blocked" ? "#fcd34d" : "#93c5fd"
          }}>{event.outcome}</span>}
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

  // SVG fills container via CSS; viewBox not set so D3 zoom controls the viewport
  svg.attr("width", null).attr("height", null);

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

  // Distress nodes: red circle with "!" marker
  const distressNodes = nodeGs.filter(d => d.type === "distress");

  distressNodes.append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", NODE_R + 1)
    .attr("fill", d => d.status === "resolved" ? "#64748b" : "#ef4444")
    .attr("shape-rendering", "geometricPrecision");

  distressNodes.append("text")
    .attr("x", d => graph.tracks[d.trackIdx].x)
    .attr("y", d => rowY(d.row))
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("fill", "white")
    .attr("font-size", 10)
    .attr("font-weight", 700)
    .text("!");

  // Checkpoint nodes: amber diamond
  const checkpointNodes = nodeGs.filter(d => d.type === "checkpoint");

  checkpointNodes.append("rect")
    .attr("x", d => graph.tracks[d.trackIdx].x - 5)
    .attr("y", d => rowY(d.row) - 5)
    .attr("width", 10)
    .attr("height", 10)
    .attr("transform", d => `rotate(45, ${graph.tracks[d.trackIdx].x}, ${rowY(d.row)})`)
    .attr("fill", "#eab308")
    .attr("shape-rendering", "geometricPrecision");

  // Progress nodes: filled circle, opacity scales with percent
  const progressNodes = nodeGs.filter(d => d.type === "progress");

  progressNodes.append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", NODE_R - 2)
    .attr("fill", d => (d.percent ?? 0) >= 100 ? "#34d399" : "#06b6d4")
    .attr("opacity", d => 0.3 + ((d.percent ?? 0) / 100) * 0.7)
    .attr("shape-rendering", "geometricPrecision");

  progressNodes.append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", NODE_R - 2)
    .attr("fill", "none")
    .attr("stroke", d => (d.percent ?? 0) >= 100 ? "#34d399" : "#06b6d4")
    .attr("stroke-width", 1.5)
    .attr("shape-rendering", "geometricPrecision");

  // Claim nodes: small outlined square
  const claimNodes = nodeGs.filter(d => d.type === "claim");

  claimNodes.append("rect")
    .attr("x", d => graph.tracks[d.trackIdx].x - 4)
    .attr("y", d => rowY(d.row) - 4)
    .attr("width", 8)
    .attr("height", 8)
    .attr("fill", "var(--color-fill)")
    .attr("stroke", "#06b6d4")
    .attr("stroke-width", 2)
    .attr("shape-rendering", "crispEdges");

  // Destination nodes: purple diamond, larger
  const destNodes = nodeGs.filter(d => d.type === "destination");

  destNodes.append("rect")
    .attr("x", d => graph.tracks[d.trackIdx].x - 6)
    .attr("y", d => rowY(d.row) - 6)
    .attr("width", 12)
    .attr("height", 12)
    .attr("transform", d => `rotate(45, ${graph.tracks[d.trackIdx].x}, ${rowY(d.row)})`)
    .attr("fill", "#8b5cf6")
    .attr("stroke", "#06b6d4")
    .attr("stroke-width", 1.5)
    .attr("shape-rendering", "geometricPrecision");

  // Operation nodes: tiny dot colored by system, failure ring if failed
  const operationNodes = nodeGs.filter(d => d.type === "operation");

  operationNodes.append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", 3)
    .attr("fill", d => OP_SYSTEM_COLORS[d.system ?? ""] || "#64748b")
    .attr("opacity", d => d.outcome === "failure" ? 1 : d.outcome === "blocked" ? 0.8 : 0.5)
    .attr("shape-rendering", "geometricPrecision");

  operationNodes.filter(d => d.outcome === "failure").append("circle")
    .attr("cx", d => graph.tracks[d.trackIdx].x)
    .attr("cy", d => rowY(d.row))
    .attr("r", 5)
    .attr("fill", "none")
    .attr("stroke", "#ef4444")
    .attr("stroke-width", 1.5)
    .attr("shape-rendering", "geometricPrecision");

  // Event labels - wrap long text into 2 lines
  const LABEL_FONT = 12;
  const CHARS_PER_LINE = Math.floor(LABEL_MAX / (LABEL_FONT * 0.6)); // ~83 chars at 12px

  const labelTexts = nodeGs.append("text")
    .attr("x", graph.labelX)
    .attr("y", d => rowY(d.row))
    .attr("font-size", LABEL_FONT)
    .attr("fill", "var(--text-primary)")
    .attr("class", "graph-event-label");

  labelTexts.each(function(d) {
    const el = d3.select(this);
    let raw = "";
    if (d.type === "start") raw = d.label;
    else if (d.type === "end") raw = d.label || d.status || "done";
    else raw = d.label;

    if (raw.length <= CHARS_PER_LINE) {
      // Single line, vertically centered
      el.append("tspan")
        .attr("x", graph.labelX)
        .attr("dy", "0.35em")
        .text(raw);
    } else {
      // Wrap into 2 lines. Break at last space before limit, or hard-break.
      let breakIdx = raw.lastIndexOf(" ", CHARS_PER_LINE);
      if (breakIdx < CHARS_PER_LINE * 0.4) breakIdx = CHARS_PER_LINE; // no good space, hard break
      const line1 = raw.slice(0, breakIdx).trimEnd();
      let line2 = raw.slice(breakIdx).trimStart();
      if (line2.length > CHARS_PER_LINE) line2 = line2.slice(0, CHARS_PER_LINE - 1) + "\u2026";

      el.append("tspan")
        .attr("x", graph.labelX)
        .attr("dy", "-0.3em")
        .text(line1);
      el.append("tspan")
        .attr("x", graph.labelX)
        .attr("dy", "1.15em")
        .text(line2);
    }
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

  // --- Pan-only behavior (clamped to content bounds) ---
  const container = svgEl.parentElement;
  const containerW = container ? container.clientWidth : graph.svgWidth;
  const containerH = container ? container.clientHeight : graph.svgHeight;

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 1])
    .translateExtent([[0, 0], [graph.svgWidth, graph.svgHeight]])
    .extent([[0, 0], [containerW, containerH]])
    .filter((event) => {
      // Only allow drag for panning. Block wheel and dblclick entirely
      // so we can handle wheel ourselves as scroll.
      if (event.type === "wheel") return false;
      if (event.type === "dblclick") return false;
      return true;
    })
    .on("zoom", (event) => {
      zoomGroup.attr("transform", event.transform.toString());
    });

  svg.call(zoom);
  svg.call(zoom.transform, d3.zoomIdentity);

  // Native wheel listener for vertical scroll (bypasses D3 completely)
  const node = svg.node()!;
  const minY = Math.min(0, containerH - graph.svgHeight);

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    const current = d3.zoomTransform(node);
    const newY = Math.max(minY, Math.min(0, current.y - event.deltaY));
    svg.call(zoom.transform, d3.zoomIdentity.translate(current.x, newY));
  }

  node.addEventListener("wheel", handleWheel, { passive: false });
  node.addEventListener("gesturestart", (e) => e.preventDefault());
  node.addEventListener("gesturechange", (e) => e.preventDefault());

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
  const { t } = useTranslation("fold");
  const { fold } = useFoldContext();
  const { memories, loading } = useRealtimeMemories(fold?.id ?? null, 1000);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<number | null>(null);

  // Filter state: which event type groups are enabled
  const [enabledGroups, setEnabledGroups] = useState<Set<number>>(
    () => new Set(EVENT_TYPE_GROUPS.map((g, i) => g.defaultOn ? i : -1).filter(i => i >= 0))
  );

  const visibleTypes = useMemo(() => {
    const types = new Set<string>();
    for (const idx of enabledGroups) {
      if (idx >= 0 && idx < EVENT_TYPE_GROUPS.length) {
        for (const t of EVENT_TYPE_GROUPS[idx].types) types.add(t);
      }
    }
    return types;
  }, [enabledGroups]);

  const toggleGroup = useCallback((idx: number) => {
    setEnabledGroups(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const graph = useMemo(() => buildGraphData(memories, visibleTypes), [memories, visibleTypes]);

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

  const scrollBy = useCallback((delta: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const current = d3.zoomTransform(svgRef.current);
    const container = svgRef.current.parentElement;
    const containerH = container ? container.clientHeight : 600;
    const minY = Math.min(0, containerH - graph.svgHeight);
    const newY = Math.max(minY, Math.min(0, current.y + delta));
    svg.transition().duration(200)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(current.x, newY));
  }, [graph.svgHeight]);

  const handleScrollTop = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition().duration(300)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  }, []);

  if (loading) {
    return (
      <div className="session-graph">
        <div className="session-graph-header">
          <h2 className="section-title">{t("graph.title")}</h2>
        </div>
        <p style={{ color: "var(--color-text-muted)", padding: "1rem" }}>{t("graph.loading")}</p>
      </div>
    );
  }

  if (graph.events.length === 0) {
    return (
      <div className="session-graph">
        <div className="session-graph-header">
          <h2 className="section-title">{t("graph.title")}</h2>
        </div>
        <p style={{ color: "var(--color-text-muted)", padding: "1rem" }}>
          {t("graph.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="session-graph">
      <div className="session-graph-header">
        <h2 className="section-title">Graph</h2>
        <div className="graph-legend">
          {graph.tracks.map((t) => (
            <span key={t.user} className="graph-legend-item">
              <span className="graph-legend-dot" style={{ background: t.color }} />
              {t.user}
            </span>
          ))}
        </div>
      </div>
      <div className="graph-type-filters">
        {EVENT_TYPE_GROUPS.map((group, idx) => (
          <button
            key={group.label}
            className={`graph-type-filter ${enabledGroups.has(idx) ? "active" : ""}`}
            style={{
              borderColor: group.color,
              background: enabledGroups.has(idx) ? `${group.color}20` : "transparent",
              color: enabledGroups.has(idx) ? group.color : "rgba(255,255,255,0.3)",
            }}
            onClick={() => toggleGroup(idx)}
          >
            {group.label}
          </button>
        ))}
      </div>
      <div className="session-graph-canvas" style={{ position: "relative" }}>
        <svg ref={svgRef}>
          <g className="zoom-group" />
        </svg>

        <div className="graph-zoom-controls">
          <button onClick={handleScrollTop} title="Scroll to top">Top</button>
          <button onClick={() => scrollBy(200)} title="Scroll up">&uarr;</button>
          <button onClick={() => scrollBy(-200)} title="Scroll down">&darr;</button>
        </div>

        {tooltip && <Tooltip data={tooltip} />}
      </div>
    </div>
  );
}
