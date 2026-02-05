import { useMemo, useState, useCallback } from "react";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import type { Memory, Link } from "../lib/supabase";
import { agentColor } from "../lib/agentColor";
import { ANIMAL_SPRITES } from "./animalSprites";

function agentColorHex(name: string): string {
  return agentColor(name);
}

function getAnimalSprite(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 7) - hash + name.charCodeAt(i)) | 0;
  }
  return ANIMAL_SPRITES[Math.abs(hash) % ANIMAL_SPRITES.length];
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
      if (toIdx !== undefined) {
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
    case "completed": return "#489664";
    case "blocked": return "#c9a227";
    case "failed": return "#c44";
    default: return "#888";
  }
}

// --- Pixel creature rendered as SVG <image> via data URI ---

function creatureSvgMarkup(name: string, color: string): string {
  const sprite = getAnimalSprite(name);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const dark = `rgb(${Math.round(r * 0.25)},${Math.round(g * 0.25)},${Math.round(b * 0.25)})`;
  const mid = color;
  const light = `rgb(${Math.min(255, Math.round(r * 1.3 + 40))},${Math.min(255, Math.round(g * 1.3 + 40))},${Math.min(255, Math.round(b * 1.3 + 40))})`;
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
      <div className="graph-tooltip-agent">{event.agent}</div>
      {event.label && <div className="graph-tooltip-label">{event.label}</div>}
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

// --- Main component ---

interface SessionGraphProps {
  links?: Link[];
}

export function SessionGraph({ links = [] }: SessionGraphProps) {
  const { room } = useRoomContext();
  const { memories, loading } = useRealtimeMemories(room?.id ?? null, 1000);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const graph = useMemo(() => buildGraphData(memories), [memories]);

  // Map links onto the graph: find source memory's row position and target session's track
  const linkEdges = useMemo(() => {
    if (!links.length || !graph.events.length) return [];
    // Build lookup: memory ID -> event row
    const memToRow = new Map<string, number>();
    // Build lookup: session ID -> track index + last row
    const sessionToTrack = new Map<string, { trackIdx: number; lastRow: number }>();

    for (const ev of graph.events) {
      // Map event ID to its row (events are from memories)
      memToRow.set(ev.id, ev.row);
      const key = ev.sessionId;
      const existing = sessionToTrack.get(key);
      if (!existing || ev.row > existing.lastRow) {
        sessionToTrack.set(key, { trackIdx: ev.trackIdx, lastRow: ev.row });
      }
    }

    const edges: { fromX: number; fromY: number; toX: number; toY: number; color: string; type: string }[] = [];
    for (const link of links) {
      const sourceRow = memToRow.get(link.source_memory_id);
      const targetInfo = sessionToTrack.get(link.target_session_id);
      if (sourceRow === undefined || !targetInfo) continue;

      // Find source track
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

  const handleHover = useCallback(
    (e: React.MouseEvent, event: LayoutEvent) => {
      const rect = (e.currentTarget as SVGElement)
        .closest(".session-graph-canvas")!
        .getBoundingClientRect();
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, event });
    },
    []
  );
  const handleLeave = useCallback(() => setTooltip(null), []);

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
        <svg
          width={graph.svgWidth}
          height={graph.svgHeight}
          style={{ display: "block" }}
        >
          {/* Faint guideline behind each track for full height */}
          {graph.tracks.map((track) => {
            const sx = snap(track.x, 1);
            return (
              <line
                key={`guide-${track.idx}`}
                x1={sx} y1={TOP_PAD}
                x2={sx} y2={graph.svgHeight - BOTTOM_PAD}
                stroke={track.color} strokeWidth={1} opacity={0.08}
                shapeRendering="crispEdges"
              />
            );
          })}

          {/* Track lines — continuous colored verticals per active segment */}
          {graph.tracks.map((track) => {
            const sx = snap(track.x, LINE_WIDTH);
            if (track.segments.length === 0) {
              return (
                <line
                  key={`track-ghost-${track.idx}`}
                  x1={sx} y1={TOP_PAD}
                  x2={sx} y2={graph.svgHeight - BOTTOM_PAD}
                  stroke={track.color} strokeWidth={1} opacity={0.15}
                  shapeRendering="crispEdges"
                />
              );
            }
            return track.segments.map((seg, si) => {
              const y1 = rowY(seg.startRow);
              const y2 = seg.endRow !== null
                ? rowY(seg.endRow)
                : graph.svgHeight - BOTTOM_PAD;
              return (
                <line
                  key={`track-${track.idx}-${si}`}
                  x1={sx} y1={y1} x2={sx} y2={y2}
                  stroke={track.color}
                  strokeWidth={LINE_WIDTH}
                  strokeLinecap="butt"
                  opacity={seg.endRow === null ? 0.5 : 0.85}
                  strokeDasharray={seg.endRow === null ? "6 3" : undefined}
                  shapeRendering="crispEdges"
                />
              );
            });
          })}

          {/* Injection edges — S-curves between tracks (keep geometricPrecision for smooth curves) */}
          {graph.edges.map((edge, i) => {
            const x1 = snap(TRACK_LEFT + edge.fromTrack * TRACK_GAP, LINE_WIDTH);
            const x2 = snap(TRACK_LEFT + edge.toTrack * TRACK_GAP, LINE_WIDTH);
            const y = rowY(edge.fromRow);
            const dx = (x2 - x1) * 0.35;
            return (
              <path
                key={`edge-${i}`}
                d={`M ${x1},${y} C ${x1 + dx},${y - 8} ${x2 - dx},${y - 8} ${x2},${y}`}
                stroke={edge.color}
                strokeWidth={2}
                fill="none"
                opacity={0.55}
                shapeRendering="geometricPrecision"
              />
            );
          })}

          {/* Vertical merge lines — connect injection source to target vertically */}
          {graph.edges.map((edge, i) => {
            if (edge.fromRow === edge.toRow) return null;
            const x1 = snap(TRACK_LEFT + edge.fromTrack * TRACK_GAP, LINE_WIDTH);
            const x2 = snap(TRACK_LEFT + edge.toTrack * TRACK_GAP, LINE_WIDTH);
            const y1 = rowY(edge.fromRow);
            const y2 = rowY(edge.toRow);
            return (
              <path
                key={`vedge-${i}`}
                d={`M ${x1},${y1} C ${x1},${y1 + (y2 - y1) * 0.5} ${x2},${y2 - (y2 - y1) * 0.5} ${x2},${y2}`}
                stroke={edge.color}
                strokeWidth={2}
                fill="none"
                opacity={0.45}
                shapeRendering="geometricPrecision"
              />
            );
          })}

          {/* User-created links — dashed curves */}
          {linkEdges.map((le, i) => {
            const dx = (le.toX - le.fromX) * 0.4;
            const dy = (le.toY - le.fromY) * 0.4;
            return (
              <path
                key={`link-${i}`}
                d={`M ${le.fromX},${le.fromY} C ${le.fromX + dx},${le.fromY + dy} ${le.toX - dx},${le.toY - dy} ${le.toX},${le.toY}`}
                stroke={le.color}
                strokeWidth={2.5}
                strokeDasharray="6 3"
                fill="none"
                opacity={0.7}
                shapeRendering="geometricPrecision"
              />
            );
          })}

          {/* Link endpoints — small diamonds */}
          {linkEdges.map((le, i) => (
            <g key={`link-end-${i}`}>
              <circle cx={le.fromX} cy={le.fromY} r={4} fill={le.color} opacity={0.8} />
              <polygon
                points={`${le.toX},${le.toY - 5} ${le.toX + 4},${le.toY} ${le.toX},${le.toY + 5} ${le.toX - 4},${le.toY}`}
                fill={le.color}
                opacity={0.8}
              />
            </g>
          ))}

          {/* Event nodes */}
          {graph.events.map((ev) => {
            const track = graph.tracks[ev.trackIdx];
            if (!track) return null;
            const cx = track.x;
            const cy = rowY(ev.row);
            const color = track.color;
            const creatureUri = creatureDataUri(ev.user, color);
            const iconSize = NODE_R * 2.6;

            return (
              <g
                key={ev.id}
                onMouseEnter={(e) => handleHover(e, ev)}
                onMouseLeave={handleLeave}
                style={{ cursor: "pointer" }}
              >
                {(ev.type === "start" || ev.type === "end" || ev.type === "knowledge") && (
                  <>
                    <circle
                      cx={cx} cy={cy}
                      r={NODE_R + 2}
                      fill={ev.type === "end" ? statusColor(ev.status ?? "completed") : color}
                      shapeRendering="geometricPrecision"
                    />
                    <circle
                      cx={cx} cy={cy}
                      r={NODE_R + 2}
                      fill="none"
                      stroke="var(--color-bg)"
                      strokeWidth={2}
                      shapeRendering="geometricPrecision"
                    />
                    <image
                      href={creatureUri}
                      x={Math.round(cx - iconSize / 2)}
                      y={Math.round(cy - iconSize / 2)}
                      width={Math.round(iconSize)}
                      height={Math.round(iconSize)}
                      style={{ imageRendering: "pixelated" }}
                    />
                  </>
                )}

                {ev.type === "inject" && (
                  <>
                    <circle
                      cx={cx} cy={cy} r={NODE_R}
                      fill="var(--color-bg)"
                      stroke={color}
                      strokeWidth={2}
                      shapeRendering="geometricPrecision"
                    />
                    <circle cx={cx} cy={cy} r={3} fill={color} shapeRendering="geometricPrecision" />
                  </>
                )}

                {ev.type === "work" && (
                  <>
                    <circle cx={cx} cy={cy} r={NODE_R - 1} fill={color} opacity={0.35} shapeRendering="geometricPrecision" />
                    <circle cx={cx} cy={cy} r={3} fill={color} opacity={0.7} shapeRendering="geometricPrecision" />
                  </>
                )}

                <text
                  x={graph.labelX}
                  y={cy + 4}
                  fontSize={12}
                  fill="var(--color-text-primary)"
                  className="graph-event-label"
                >
                  {(() => {
                    const MAX = 50;
                    let raw = "";
                    if (ev.type === "start") raw = ev.label;
                    else if (ev.type === "end") raw = ev.label || ev.status || "done";
                    else raw = ev.label;
                    return raw.length > MAX ? raw.slice(0, MAX) + "\u2026" : raw;
                  })()}
                </text>
              </g>
            );
          })}
        </svg>

        {tooltip && <Tooltip data={tooltip} />}
      </div>
    </div>
  );
}
