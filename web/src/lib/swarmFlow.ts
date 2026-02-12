/**
 * swarmFlow.ts - Agent vector field visualization.
 *
 * Each agent is an arrow on a grid. Arrow direction shows what the agent
 * is working on. Arrow length shows activity. Color shows alignment with
 * the fold's destination (green = aligned, red = misaligned, dim = idle).
 *
 * A target arrow at top shows the destination. Aggregate metrics
 * (alignment score, activity, productivity) give an at-a-glance read.
 */

// --- Types ---

export interface AgentVector {
  id: string;
  name: string;
  /** Normalized direction of work (-1..1 each axis) */
  dx: number;
  dy: number;
  /** 0..1 how active (ops per minute, normalized) */
  activity: number;
  /** 0..1 how aligned with destination */
  alignment: number;
  /** 0..1 success rate */
  productivity: number;
  status: "active" | "idle";
  opCount: number;
  scope: string;
  color: string;
}

export interface SwarmMetrics {
  totalAgents: number;
  activeAgents: number;
  avgAlignment: number;
  avgProductivity: number;
  totalOps: number;
  regime: "laminar" | "transitional" | "turbulent";
}

// --- Constants ---

const BG = [10, 10, 15];
const GRID_PAD = 60;
const ARROW_MAX = 36;
const HEAD_LEN = 8;

// --- Renderer ---

export class SwarmFlowRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private animId = 0;
  private agents: AgentVector[] = [];
  private destination: { dx: number; dy: number; label: string } | null = null;
  private metrics: SwarmMetrics = {
    totalAgents: 0, activeAgents: 0, avgAlignment: 0,
    avgProductivity: 0, totalOps: 0, regime: "laminar",
  };
  private hovered: string | null = null;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  updateAgents(agents: AgentVector[]) {
    this.agents = agents;
    this.computeMetrics();
  }

  setDestination(dx: number, dy: number, label: string) {
    const mag = Math.sqrt(dx * dx + dy * dy);
    this.destination = mag > 0.01
      ? { dx: dx / mag, dy: dy / mag, label }
      : null;
  }

  getMetrics(): SwarmMetrics {
    return this.metrics;
  }

  private computeMetrics() {
    const active = this.agents.filter(a => a.status === "active");
    const n = this.agents.length;
    const avgAlign = n > 0 ? this.agents.reduce((s, a) => s + a.alignment, 0) / n : 0;
    const avgProd = n > 0 ? this.agents.reduce((s, a) => s + a.productivity, 0) / n : 0;
    const totalOps = this.agents.reduce((s, a) => s + a.opCount, 0);

    // Regime: based on active count and alignment variance
    let regime: SwarmMetrics["regime"] = "laminar";
    if (active.length > 5) {
      const variance = n > 0
        ? this.agents.reduce((s, a) => s + (a.alignment - avgAlign) ** 2, 0) / n
        : 0;
      regime = variance > 0.15 ? "turbulent" : variance > 0.05 ? "transitional" : "laminar";
    }

    this.metrics = {
      totalAgents: n,
      activeAgents: active.length,
      avgAlignment: avgAlign,
      avgProductivity: avgProd,
      totalOps,
      regime,
    };
  }

  hitTest(mx: number, my: number): AgentVector | null {
    const { cols, rows, cellW, cellH } = this.gridLayout();
    for (let i = 0; i < this.agents.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = GRID_PAD + col * cellW + cellW / 2;
      const cy = GRID_PAD + 48 + row * cellH + cellH / 2;
      if (Math.abs(mx - cx) < cellW / 2 && Math.abs(my - cy) < cellH / 2) {
        return this.agents[i];
      }
    }
    return null;
  }

  setHover(id: string | null) {
    this.hovered = id;
  }

  private gridLayout() {
    const n = Math.max(this.agents.length, 1);
    const usableW = this.width - GRID_PAD * 2;
    const usableH = this.height - GRID_PAD * 2 - 48; // 48 for destination header
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * (usableW / usableH))));
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = usableW / cols;
    const cellH = usableH / rows;
    return { cols, rows, cellW, cellH };
  }

  private draw() {
    const { ctx, width, height } = this;
    this.time += 0.016;

    // Background
    ctx.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`;
    ctx.fillRect(0, 0, width, height);

    // --- Destination header ---
    if (this.destination) {
      const destY = 30;
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText("DESTINATION", GRID_PAD, destY - 6);

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "13px 'JetBrains Mono', monospace";
      ctx.fillText(this.destination.label, GRID_PAD + 90, destY - 6);

      // Target arrow
      const arrowX = GRID_PAD + 74;
      this.drawArrow(arrowX, destY - 10, this.destination.dx, this.destination.dy,
        20, "rgba(100,220,140,0.9)", 2.5);
    }

    // --- Metrics summary (top right) ---
    const m = this.metrics;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      `${m.activeAgents}/${m.totalAgents} active · ` +
      `alignment ${(m.avgAlignment * 100).toFixed(0)}% · ` +
      `productivity ${(m.avgProductivity * 100).toFixed(0)}%`,
      width - GRID_PAD, 24
    );

    const regimeColor = m.regime === "laminar" ? "rgba(6,182,212,0.7)"
      : m.regime === "transitional" ? "rgba(124,58,237,0.7)"
      : "rgba(236,72,153,0.7)";
    ctx.fillStyle = regimeColor;
    ctx.fillText(m.regime, width - GRID_PAD, 38);

    // --- Agent grid ---
    if (this.agents.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font = "14px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("No agents active", width / 2, height / 2);
      return;
    }

    const { cols, rows, cellW, cellH } = this.gridLayout();

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = GRID_PAD + col * cellW + cellW / 2;
      const cy = GRID_PAD + 48 + row * cellH + cellH / 2;
      const isHovered = this.hovered === agent.id;

      // Cell background on hover
      if (isHovered) {
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(GRID_PAD + col * cellW, GRID_PAD + 48 + row * cellH, cellW, cellH);
      }

      // Arrow color based on alignment (green=aligned, yellow=partial, red=misaligned)
      const arrowColor = agent.status === "idle"
        ? "rgba(100,100,120,0.3)"
        : this.alignmentColor(agent.alignment, agent.activity);

      // Arrow length based on activity
      const len = agent.status === "idle"
        ? 6
        : 8 + agent.activity * (Math.min(cellW, cellH, ARROW_MAX * 2) / 2 - 10);

      // Subtle pulse for active agents
      const pulse = agent.status === "active"
        ? 1 + Math.sin(this.time * 3 + i) * 0.05
        : 1;

      const lineWidth = agent.status === "idle" ? 1 : 1.5 + agent.activity * 1.5;

      this.drawArrow(cx, cy, agent.dx, agent.dy, len * pulse, arrowColor, lineWidth);

      // Agent name
      const nameAlpha = isHovered ? 0.9 : agent.status === "active" ? 0.5 : 0.2;
      ctx.fillStyle = `rgba(255,255,255,${nameAlpha})`;
      ctx.font = `${isHovered ? 11 : 9}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      const shortName = agent.name.includes("/") ? agent.name.split("/").pop()! : agent.name;
      ctx.fillText(shortName, cx, cy + len / 2 + 14);

      // Scope tag (small, below name)
      if (isHovered && agent.scope) {
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillText(agent.scope, cx, cy + len / 2 + 24);
      }

      // Hover detail: alignment + activity
      if (isHovered) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.fillText(
          `align ${(agent.alignment * 100).toFixed(0)}%  active ${(agent.activity * 100).toFixed(0)}%  prod ${(agent.productivity * 100).toFixed(0)}%`,
          cx, cy - len / 2 - 10
        );
      }
    }

    // Grid lines (very subtle)
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= cols; c++) {
      const x = GRID_PAD + c * cellW;
      ctx.beginPath();
      ctx.moveTo(x, GRID_PAD + 48);
      ctx.lineTo(x, GRID_PAD + 48 + rows * cellH);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      const y = GRID_PAD + 48 + r * cellH;
      ctx.beginPath();
      ctx.moveTo(GRID_PAD, y);
      ctx.lineTo(GRID_PAD + cols * cellW, y);
      ctx.stroke();
    }
  }

  private alignmentColor(alignment: number, activity: number): string {
    // Interpolate green → yellow → red based on alignment
    const a = Math.max(0.3, activity);
    if (alignment > 0.7) return `rgba(80,220,130,${a})`;
    if (alignment > 0.4) return `rgba(220,200,60,${a})`;
    if (alignment > 0.15) return `rgba(240,140,50,${a})`;
    return `rgba(230,70,70,${a})`;
  }

  private drawArrow(cx: number, cy: number, dx: number, dy: number,
    len: number, color: string, lineWidth: number) {
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag < 0.001) {
      // Dot for zero-direction
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      this.ctx.fill();
      return;
    }

    const nx = dx / mag;
    const ny = dy / mag;
    // Arrow goes from (cx - half, cy + half) to (cx + half, cy - half)
    // We flip Y since canvas Y is downward
    const halfLen = len / 2;
    const x1 = cx - nx * halfLen;
    const y1 = cy + ny * halfLen; // +ny because canvas Y flips
    const x2 = cx + nx * halfLen;
    const y2 = cy - ny * halfLen;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = "round";

    // Shaft
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(-(y2 - y1), x2 - x1);
    const headSize = Math.min(HEAD_LEN, len * 0.4);
    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(
      x2 - headSize * Math.cos(angle - 0.45),
      y2 + headSize * Math.sin(angle - 0.45)
    );
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(
      x2 - headSize * Math.cos(angle + 0.45),
      y2 + headSize * Math.sin(angle + 0.45)
    );
    this.ctx.stroke();
  }

  startAnimation() {
    const loop = () => {
      this.draw();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.animId);
  }
}
