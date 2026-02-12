/**
 * swarmFlow.ts - Swarm physics engine for agent flow visualization.
 *
 * Computes flow fields, pressure, vorticity, and turbulence from
 * real-time agent telemetry. Renders particles flowing through the
 * agent action space, colored by scope region.
 *
 * Based on armandsumo VectorFieldViz.tsx patterns (particle integration,
 * trail rendering, field sampling) adapted for agent swarm dynamics.
 */

// --- Types ---

export interface AgentNode {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  scope: string;
  status: "active" | "idle" | "finished";
  curvature: number;
  opCount: number;
  outcomes: { success: number; failure: number; blocked: number };
  lastSeen: number;
}

export interface ScopeRegion {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  pressure: number;
  vorticity: number;
  flowCoherence: number;
  agents: string[];
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: Array<{ x: number; y: number; alpha: number }>;
  age: number;
  maxAge: number;
  scope: string;
}

export interface SwarmMetrics {
  totalAgents: number;
  activeAgents: number;
  avgCurvature: number;
  avgFlowCoherence: number;
  totalPressure: number;
  maxVorticity: number;
  reynoldsNumber: number;
  regime: "laminar" | "transitional" | "turbulent";
  throughput: number;
  heatDissipation: number;
}

// --- Constants ---

const PARTICLE_COUNT = 200;
const TRAIL_LENGTH = 30;
const AURORA_BG = [10, 10, 15];
const AURORA_PURPLE = [124, 58, 237];
const AURORA_PINK = [236, 72, 153];
const AURORA_CYAN = [6, 182, 212];

// Scope -> position mapping. Scopes are laid out in a circular arrangement.
const SCOPE_POSITIONS: Record<string, { x: number; y: number }> = {
  web: { x: -0.6, y: -0.4 },
  worker: { x: 0.6, y: -0.4 },
  git: { x: 0, y: -0.7 },
  deploy: { x: 0, y: 0.7 },
  filesystem: { x: -0.5, y: 0.3 },
  ci: { x: 0.5, y: 0.3 },
  database: { x: -0.3, y: 0.6 },
  api: { x: 0.3, y: 0.6 },
  other: { x: 0, y: 0 },
};

const SCOPE_COLORS: Record<string, number[]> = {
  web: AURORA_CYAN,
  worker: AURORA_PURPLE,
  git: [255, 165, 0],
  deploy: AURORA_PINK,
  filesystem: [100, 200, 100],
  ci: [200, 200, 100],
  database: [100, 200, 255],
  api: [255, 150, 200],
  other: [150, 150, 150],
};

// --- Swarm Flow Engine ---

export class SwarmFlowEngine {
  agents: Map<string, AgentNode> = new Map();
  regions: Map<string, ScopeRegion> = new Map();
  particles: Particle[] = [];
  metrics: SwarmMetrics = {
    totalAgents: 0,
    activeAgents: 0,
    avgCurvature: 0,
    avgFlowCoherence: 0,
    totalPressure: 0,
    maxVorticity: 0,
    reynoldsNumber: 0,
    regime: "laminar",
    throughput: 0,
    heatDissipation: 0,
  };

  constructor() {
    this.initParticles();
  }

  private initParticles() {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push(this.spawnParticle());
    }
  }

  private spawnParticle(): Particle {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.8;
    return {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      trail: [],
      age: 0,
      maxAge: 100 + Math.random() * 200,
      scope: "",
    };
  }

  // Update agent data from memories
  updateAgents(agentData: AgentNode[]) {
    const now = Date.now();
    this.agents.clear();

    for (const a of agentData) {
      this.agents.set(a.id, a);
    }

    // Build scope regions from agent positions
    this.regions.clear();
    const scopeAgents = new Map<string, AgentNode[]>();

    for (const a of agentData) {
      const scope = a.scope || "other";
      if (!scopeAgents.has(scope)) scopeAgents.set(scope, []);
      scopeAgents.get(scope)!.push(a);
    }

    for (const [scope, agents] of scopeAgents) {
      const pos = SCOPE_POSITIONS[scope] || SCOPE_POSITIONS.other;
      const pressure = agents.reduce((sum, a) => sum + a.opCount, 0);
      const color = SCOPE_COLORS[scope] || SCOPE_COLORS.other;

      // Compute flow coherence (average pairwise alignment)
      let coherence = 1;
      if (agents.length > 1) {
        let totalAlignment = 0;
        let pairs = 0;
        for (let i = 0; i < agents.length; i++) {
          for (let j = i + 1; j < agents.length; j++) {
            const a = agents[i], b = agents[j];
            const magA = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
            const magB = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            if (magA > 0.01 && magB > 0.01) {
              totalAlignment += (a.vx * b.vx + a.vy * b.vy) / (magA * magB);
              pairs++;
            }
          }
        }
        coherence = pairs > 0 ? totalAlignment / pairs : 0;
      }

      // Compute vorticity (simplified: check for cycling patterns)
      const vorticity = agents.reduce((sum, a) => {
        return sum + (a.outcomes.failure + a.outcomes.blocked) / Math.max(a.opCount, 1);
      }, 0) / Math.max(agents.length, 1);

      this.regions.set(scope, {
        id: scope,
        label: scope,
        x: pos.x,
        y: pos.y,
        radius: 0.1 + Math.min(agents.length * 0.05, 0.3),
        pressure,
        vorticity,
        flowCoherence: coherence,
        agents: agents.map(a => a.id),
        color: `rgb(${color[0]},${color[1]},${color[2]})`,
      });
    }

    // Compute aggregate metrics
    const active = agentData.filter(a => a.status === "active");
    const totalCurvature = agentData.reduce((s, a) => s + a.curvature, 0);
    const totalOps = agentData.reduce((s, a) => s + a.opCount, 0);
    const totalFailures = agentData.reduce((s, a) => s + a.outcomes.failure + a.outcomes.blocked, 0);

    const density = active.length / Math.max(this.regions.size, 1);
    const velocity = totalOps / Math.max(agentData.length, 1);
    const viscosity = 0.3; // Placeholder, should come from coordination overhead measurement

    const re = (density * velocity * 1.0) / viscosity;

    this.metrics = {
      totalAgents: agentData.length,
      activeAgents: active.length,
      avgCurvature: agentData.length > 0 ? totalCurvature / agentData.length : 0,
      avgFlowCoherence: [...this.regions.values()].reduce((s, r) => s + r.flowCoherence, 0) / Math.max(this.regions.size, 1),
      totalPressure: [...this.regions.values()].reduce((s, r) => s + r.pressure, 0),
      maxVorticity: Math.max(...[...this.regions.values()].map(r => r.vorticity), 0),
      reynoldsNumber: re,
      regime: re < 3 ? "laminar" : re < 10 ? "transitional" : "turbulent",
      throughput: totalOps,
      heatDissipation: totalOps > 0 ? totalFailures / totalOps : 0,
    };
  }

  // Sample the flow field at a point
  sampleField(x: number, y: number): { fx: number; fy: number; mag: number } {
    let fx = 0, fy = 0;

    // Each agent creates a flow contribution
    for (const agent of this.agents.values()) {
      const dx = x - agent.x;
      const dy = y - agent.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 0.05) continue;

      // Agent's direction creates a local flow field (like a source + direction)
      const influence = agent.curvature > 0 ? 1.0 : 0.3;
      const falloff = influence / (1 + r * r * 4);

      fx += agent.vx * falloff;
      fy += agent.vy * falloff;

      // Pressure gradient: particles flow toward high-pressure regions
      for (const region of this.regions.values()) {
        const rdx = region.x - x;
        const rdy = region.y - y;
        const rr = Math.sqrt(rdx * rdx + rdy * rdy);
        if (rr < 0.05) continue;
        const pressureForce = region.pressure * 0.001 / (1 + rr * rr * 2);
        fx += (rdx / rr) * pressureForce;
        fy += (rdy / rr) * pressureForce;
      }
    }

    // Add gentle ambient rotation to prevent dead zones
    const r = Math.sqrt(x * x + y * y);
    if (r > 0.1) {
      const ambientStrength = 0.005 / (1 + r);
      fx += -y * ambientStrength;
      fy += x * ambientStrength;
    }

    const mag = Math.sqrt(fx * fx + fy * fy);
    return { fx, fy, mag };
  }

  // Step the simulation forward
  step() {
    for (const p of this.particles) {
      const field = this.sampleField(p.x, p.y);

      if (field.mag > 0.0001) {
        const speed = Math.min(field.mag * 0.5, 0.015);
        p.vx = p.vx * 0.92 + (field.fx / field.mag) * speed * 0.08;
        p.vy = p.vy * 0.92 + (field.fy / field.mag) * speed * 0.08;
      } else {
        // Gentle random walk in dead zones
        p.vx += (Math.random() - 0.5) * 0.001;
        p.vy += (Math.random() - 0.5) * 0.001;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.age++;

      // Determine which scope region this particle is in
      let closestScope = "other";
      let closestDist = Infinity;
      for (const region of this.regions.values()) {
        const d = Math.sqrt((p.x - region.x) ** 2 + (p.y - region.y) ** 2);
        if (d < closestDist) {
          closestDist = d;
          closestScope = region.id;
        }
      }
      p.scope = closestScope;

      // Trail
      const alpha = Math.max(0, 1 - p.age / p.maxAge);
      p.trail.push({ x: p.x, y: p.y, alpha });
      if (p.trail.length > TRAIL_LENGTH) p.trail.shift();

      // Respawn if out of bounds or too old
      const dist = Math.sqrt(p.x * p.x + p.y * p.y);
      if (dist > 1.2 || p.age > p.maxAge) {
        Object.assign(p, this.spawnParticle());
      }
    }
  }
}

// --- Canvas Renderer ---

export class SwarmFlowRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: SwarmFlowEngine;
  private animId: number = 0;
  private width: number = 0;
  private height: number = 0;
  private hovered: AgentNode | null = null;
  private hoveredRegion: ScopeRegion | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.engine = new SwarmFlowEngine();
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  updateAgents(agentData: AgentNode[]) {
    this.engine.updateAgents(agentData);
  }

  getMetrics(): SwarmMetrics {
    return this.engine.metrics;
  }

  getRegions(): ScopeRegion[] {
    return [...this.engine.regions.values()];
  }

  // Convert normalized coords (-1..1) to canvas coords
  private toCanvas(x: number, y: number): [number, number] {
    const cx = (x + 1) * 0.5 * this.width;
    const cy = (1 - (y + 1) * 0.5) * this.height;
    return [cx, cy];
  }

  // Hit test for mouse interaction
  hitTest(mouseX: number, mouseY: number): { agent?: AgentNode; region?: ScopeRegion } {
    // Check agents
    for (const agent of this.engine.agents.values()) {
      const [ax, ay] = this.toCanvas(agent.x, agent.y);
      const d = Math.sqrt((mouseX - ax) ** 2 + (mouseY - ay) ** 2);
      if (d < 20) return { agent };
    }
    // Check regions
    for (const region of this.engine.regions.values()) {
      const [rx, ry] = this.toCanvas(region.x, region.y);
      const r = region.radius * Math.min(this.width, this.height) * 0.5;
      const d = Math.sqrt((mouseX - rx) ** 2 + (mouseY - ry) ** 2);
      if (d < r) return { region };
    }
    return {};
  }

  setHover(agent: AgentNode | null, region: ScopeRegion | null) {
    this.hovered = agent;
    this.hoveredRegion = region;
  }

  draw() {
    const { ctx, width, height } = this;

    // Step simulation
    this.engine.step();

    // Background
    ctx.fillStyle = `rgb(${AURORA_BG[0]},${AURORA_BG[1]},${AURORA_BG[2]})`;
    ctx.fillRect(0, 0, width, height);

    // Scope regions (glowing circles)
    for (const region of this.engine.regions.values()) {
      const [rx, ry] = this.toCanvas(region.x, region.y);
      const r = region.radius * Math.min(width, height) * 0.5;
      const color = SCOPE_COLORS[region.id] || SCOPE_COLORS.other;

      // Glow
      const glow = ctx.createRadialGradient(rx, ry, 0, rx, ry, r * 2);
      glow.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${0.08 + region.pressure * 0.001})`);
      glow.addColorStop(0.5, `rgba(${color[0]},${color[1]},${color[2]},${0.03})`);
      glow.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(rx, ry, r * 2, 0, Math.PI * 2);
      ctx.fill();

      // Region border (opacity reflects coherence)
      const coherenceAlpha = 0.1 + region.flowCoherence * 0.3;
      ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${coherenceAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.stroke();

      // Vorticity indicator (spinning dashes for high vorticity)
      if (region.vorticity > 0.1) {
        const t = Date.now() * 0.001;
        ctx.strokeStyle = `rgba(255,100,100,${region.vorticity * 0.5})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const angle = t * 2 + (i * Math.PI * 0.5);
          const x1 = rx + Math.cos(angle) * r * 0.7;
          const y1 = ry + Math.sin(angle) * r * 0.7;
          const x2 = rx + Math.cos(angle) * r * 1.1;
          const y2 = ry + Math.sin(angle) * r * 1.1;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }

      // Label
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},0.6)`;
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(region.label, rx, ry + r + 14);
    }

    // Particle trails
    for (const p of this.engine.particles) {
      if (p.trail.length < 2) continue;

      const color = SCOPE_COLORS[p.scope] || SCOPE_COLORS.other;

      ctx.beginPath();
      const [startX, startY] = this.toCanvas(p.trail[0].x, p.trail[0].y);
      ctx.moveTo(startX, startY);

      for (let i = 1; i < p.trail.length; i++) {
        const [tx, ty] = this.toCanvas(p.trail[i].x, p.trail[i].y);
        ctx.lineTo(tx, ty);
      }

      const trailAlpha = p.trail[p.trail.length - 1].alpha * 0.4;
      ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${trailAlpha})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Particle head
      const [hx, hy] = this.toCanvas(p.x, p.y);
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${trailAlpha + 0.3})`;
      ctx.beginPath();
      ctx.arc(hx, hy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Agent nodes
    for (const agent of this.engine.agents.values()) {
      const [ax, ay] = this.toCanvas(agent.x, agent.y);
      const isActive = agent.status === "active";
      const isHovered = this.hovered?.id === agent.id;
      const baseRadius = isActive ? 6 : 4;
      const radius = isHovered ? baseRadius + 3 : baseRadius;

      // Parse agent color
      const hex = agent.color;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);

      // Glow for active agents
      if (isActive) {
        const glow = ctx.createRadialGradient(ax, ay, 0, ax, ay, radius * 4);
        glow.addColorStop(0, `rgba(${r},${g},${b},0.3)`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(ax, ay, radius * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node
      ctx.fillStyle = `rgba(${r},${g},${b},${isActive ? 0.9 : 0.4})`;
      ctx.beginPath();
      ctx.arc(ax, ay, radius, 0, Math.PI * 2);
      ctx.fill();

      // Direction arrow
      if (isActive && (Math.abs(agent.vx) > 0.01 || Math.abs(agent.vy) > 0.01)) {
        const mag = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
        const nx = agent.vx / mag;
        const ny = agent.vy / mag;
        const arrowLen = 15;
        const [endX, endY] = [ax + nx * arrowLen, ay - ny * arrowLen];

        ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrowhead
        const headLen = 5;
        const headAngle = Math.atan2(-ny, nx);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(headAngle - 0.5),
          endY - headLen * Math.sin(headAngle - 0.5)
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(headAngle + 0.5),
          endY - headLen * Math.sin(headAngle + 0.5)
        );
        ctx.stroke();
      }

      // Agent name (on hover or always for active)
      if (isHovered || isActive) {
        ctx.fillStyle = `rgba(255,255,255,${isHovered ? 0.9 : 0.5})`;
        ctx.font = `${isHovered ? 12 : 9}px 'JetBrains Mono', monospace`;
        ctx.textAlign = "center";
        const shortName = agent.name.split("/").pop() || agent.name;
        ctx.fillText(shortName, ax, ay - radius - 6);
      }
    }

    // Regime indicator (top-left)
    const regime = this.engine.metrics.regime;
    const regimeColor = regime === "laminar"
      ? `rgb(${AURORA_CYAN.join(",")})`
      : regime === "transitional"
        ? `rgb(${AURORA_PURPLE.join(",")})`
        : `rgb(${AURORA_PINK.join(",")})`;

    ctx.fillStyle = regimeColor;
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Re=${this.engine.metrics.reynoldsNumber.toFixed(1)} ${regime}`, 12, 20);

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText(
      `${this.engine.metrics.activeAgents}/${this.engine.metrics.totalAgents} active  ` +
      `coherence=${this.engine.metrics.avgFlowCoherence.toFixed(2)}  ` +
      `heat=${(this.engine.metrics.heatDissipation * 100).toFixed(0)}%`,
      12, 36
    );
  }

  startAnimation() {
    const loop = () => {
      this.draw();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  stopAnimation() {
    cancelAnimationFrame(this.animId);
  }

  destroy() {
    this.stopAnimation();
  }
}
