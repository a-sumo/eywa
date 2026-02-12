// NavigatorMap: standalone Canvas 2D renderer for Guild Navigator spatial data.
// Zero dependencies, ESM, single file. Accepts data from /api/rooms/:id/map.
//
// Usage:
//   import { NavigatorMap } from './navigator-map.js';
//   const map = new NavigatorMap(canvas);
//   map.setTheme('dark');
//   map.setData(mapData);
//   map.draw();

function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

const THEMES = {
  light: {
    bg: '#fafafa',
    bgRgb: [250, 250, 250],
    grid: 'rgba(60, 60, 70, 0.28)',
    ring: [80, 60, 140],
    text: [50, 50, 60],
    goal: [200, 160, 40],
    stateInner: [255, 255, 255],
    gradCircle: '#fafafa',
    agentPalette: [
      [100, 23, 236],
      [20, 140, 180],
      [200, 100, 40],
      [60, 160, 80],
      [180, 50, 120],
    ],
    // intensity multipliers for dark vs light
    trajAlpha: 0.35,
    actionFill: 0.75,
    actionStroke: 0.9,
    glowInner: 0.06,
    stateInnerAlpha: 0.85,
    stateStroke: 0.6,
    goalGrad: [[210,170,40,0.5],[190,150,30,0.25],[170,130,20,0.05]],
    goalGlow: [200,160,40],
  },
  dark: {
    bg: '#080a08',
    bgRgb: [8, 10, 8],
    grid: 'rgba(0, 220, 100, 0.08)',
    ring: [0, 180, 90],
    text: [0, 210, 110],
    goal: [0, 255, 200],
    stateInner: [10, 14, 10],
    gradCircle: '#0c0e0c',
    agentPalette: [
      [0, 230, 120],
      [0, 190, 255],
      [255, 170, 30],
      [255, 80, 180],
      [170, 130, 255],
    ],
    trajAlpha: 0.5,
    actionFill: 0.9,
    actionStroke: 1.0,
    glowInner: 0.12,
    stateInnerAlpha: 0.9,
    stateStroke: 0.8,
    goalGrad: [[0,255,200,0.6],[0,220,170,0.3],[0,180,140,0.06]],
    goalGlow: [0,255,200],
  },
};

export class NavigatorMap {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // layout state
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    this.cx = 0;
    this.cy = 0;
    this.scale = 0;
    this.spacing = 0;

    // zoom / pan
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    // data
    this.data = null;
    this.goalId = null;
    this.agentColors = {};
    this.goalSx = 0;
    this.goalSy = 0;

    // agent dimming (toggled off agents render as ghosts)
    this.dimmedAgents = new Set();
    this._legendHits = [];

    // dev mode: show curvature grid warping, human baseline, etc.
    this.devMode = opts.devMode || false;

    // node appearance overrides
    this.nodeAlphaFn = opts.nodeAlphaFn || (() => 1);

    // theme
    this.themeName = opts.theme || 'light';
    this.t = THEMES[this.themeName] || THEMES.light;
    this.agentPalette = this.t.agentPalette;

    this.nodeSize = { source: 18, action: 10, state: 12, goal: 22 };

    this.resize();
  }

  // --- Public API ---

  setTheme(name) {
    if (!THEMES[name]) return;
    this.themeName = name;
    this.t = THEMES[name];
    this.agentPalette = this.t.agentPalette;
    // rebuild agent color assignments
    if (this.data) this.setData(this.data);
  }

  setData(mapData) {
    this.data = mapData;
    if (mapData && mapData.meta) {
      this.goalId = mapData.meta.goalIds[0] || null;
      this.agentColors = {};
      (mapData.meta.agents || ['agent']).forEach((agent, i) => {
        this.agentColors[agent] = this.agentPalette[i % this.agentPalette.length];
      });
      // Backfill node.agent from trajectory edges if missing
      if (mapData.nodes && mapData.trajectory) {
        const nodeAgent = {};
        for (const edge of mapData.trajectory) {
          if (edge.agent) {
            nodeAgent[edge.from] = edge.agent;
            nodeAgent[edge.to] = edge.agent;
          }
        }
        for (const node of mapData.nodes) {
          if (!node.agent && nodeAgent[node.id]) node.agent = nodeAgent[node.id];
        }
      }
    }
    this.recalcGoalScreen();
  }

  setZoom(z) {
    this.zoom = Math.max(0.25, Math.min(5, z));
    this.recalcGoalScreen();
  }

  setPan(x, y) {
    this.panX = x;
    this.panY = y;
    this.recalcGoalScreen();
  }

  resetView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.recalcGoalScreen();
  }

  hitTest(screenX, screenY) {
    if (!this.data || !this.data.nodes) return null;
    for (let i = this.data.nodes.length - 1; i >= 0; i--) {
      const node = this.data.nodes[i];
      const { sx, sy } = this.toScreen(node);
      const r = this.nodeSize[node.type] + 8;
      if ((screenX - sx) ** 2 + (screenY - sy) ** 2 < r * r) return node;
    }
    return null;
  }

  toggleAgent(agent) {
    if (this.dimmedAgents.has(agent)) this.dimmedAgents.delete(agent);
    else this.dimmedAgents.add(agent);
  }

  hitTestLegend(screenX, screenY) {
    for (const hit of this._legendHits) {
      if (screenX >= hit.x && screenX <= hit.x + hit.w &&
          screenY >= hit.y && screenY <= hit.y + hit.h) {
        return hit.agent;
      }
    }
    return null;
  }

  toScreen(node) {
    return {
      sx: this.cx + this.panX + node.x * this.scale * 0.85 * this.zoom,
      sy: this.cy + this.panY - node.y * this.scale * 0.85 * this.zoom,
    };
  }

  resize() {
    this.W = this.canvas.clientWidth || this.canvas.width;
    this.H = this.canvas.clientHeight || this.canvas.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.W * this.dpr;
    this.canvas.height = this.H * this.dpr;
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.cx = this.W / 2;
    this.cy = this.H / 2;
    this.scale = Math.min(this.W, this.H) * 0.38;
    this.spacing = Math.max(28, Math.min(48, this.W / 22));
    this.recalcGoalScreen();
  }

  destroy() {
    this.data = null;
    this.canvas = null;
    this.ctx = null;
  }

  // --- Main draw ---

  draw(hoveredNode) {
    const { ctx, W, H, dpr, data, t } = this;
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    if (!data || !data.nodes || data.nodes.length === 0) {
      this.drawGrid();
      this.drawEdgeFades();
      this.drawGraduations();
      this.drawLegend();
      return false;
    }

    this.drawGrid();
    this.drawRadialRings();
    this.drawTrajectory();
    this.drawNodes(hoveredNode);
    this.drawEdgeFades();
    this.drawGraduations();
    this.drawAlignmentPanel();
    this.drawComparisonPanel();
    this.drawCurvaturePanel();
    this.drawLegend();
    return true;
  }

  // --- Internal: coordinate helpers ---

  recalcGoalScreen() {
    if (!this.data || !this.data.nodes) return;
    const goalNodes = this.data.nodes.filter(n => n.type === 'goal');
    if (goalNodes.length === 0) {
      this.goalSx = this.cx + this.panX;
      this.goalSy = this.cy + this.panY;
      return;
    }
    let gx = 0, gy = 0;
    for (const g of goalNodes) {
      const s = this.toScreen(g);
      gx += s.sx; gy += s.sy;
    }
    this.goalSx = gx / goalNodes.length;
    this.goalSy = gy / goalNodes.length;
  }

  // --- Internal: draw subroutines ---

  // World-space ↔ screen-space transforms
  _worldToScreenX(wx) { return this.cx + this.panX + wx * this.scale * 0.85 * this.zoom; }
  _worldToScreenY(wy) { return this.cy + this.panY - wy * this.scale * 0.85 * this.zoom; }
  _screenToWorldX(sx) { return (sx - this.cx - this.panX) / (this.scale * 0.85 * this.zoom); }
  _screenToWorldY(sy) { return -(sy - this.cy - this.panY) / (this.scale * 0.85 * this.zoom); }

  // Pick a "nice" grid spacing in world units for the current zoom level.
  // Returns spacing in khemā such that ~8-16 lines are visible.
  _gridSpacing() {
    const pad = 8;
    const worldW = Math.abs(this._screenToWorldX(this.W - pad) - this._screenToWorldX(pad));
    const worldH = Math.abs(this._screenToWorldY(pad) - this._screenToWorldY(this.H - pad));
    const extent = Math.max(worldW, worldH);
    const nice = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0];
    for (const n of nice) {
      if (extent / n <= 18) return n;
    }
    return nice[nice.length - 1];
  }

  drawGrid() {
    const { ctx, W, H, t } = this;
    const pad = 8;
    const k = this.scale * 0.85 * this.zoom;
    const dark = this.themeName === 'dark';

    // Visible world-space bounds
    const wL = Math.min(this._screenToWorldX(pad), this._screenToWorldX(W - pad));
    const wR = Math.max(this._screenToWorldX(pad), this._screenToWorldX(W - pad));
    const wB = Math.min(this._screenToWorldY(pad), this._screenToWorldY(H - pad));
    const wT = Math.max(this._screenToWorldY(pad), this._screenToWorldY(H - pad));

    // Multi-level grid: each spacing level fades based on screen-pixel density.
    // Lines too close together fade out; far apart are fully visible.
    // This creates smooth overlap transitions like map applications.
    const allSpacings = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0];
    const minGap = 24;   // below this pixel gap, level is invisible
    const maxGap = 140;  // above this, level is at full alpha
    const baseAlpha = dark ? 0.07 : 0.22;

    // Curvature warping (dev mode only)
    const sources = this.devMode ? this._curvatureSources() : [];
    let displace = null;
    if (sources.length > 0) {
      const refScreenGap = this._gridSpacing() * k;
      const sigma = refScreenGap * 5;
      const sigma2x2 = 2 * sigma * sigma;
      const maxDisp = refScreenGap * 0.4;
      displace = (px, py) => {
        let dx = 0, dy = 0;
        for (const s of sources) {
          const ddx = s.x - px, ddy = s.y - py;
          const d2 = ddx * ddx + ddy * ddy;
          const dist = Math.sqrt(d2);
          if (dist < 0.5) continue;
          const pull = s.k * refScreenGap * 0.5 * Math.exp(-d2 / sigma2x2);
          dx += pull * ddx / dist; dy += pull * ddy / dist;
        }
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > 0.01) { const b = maxDisp * Math.tanh(mag / maxDisp); dx = dx / mag * b; dy = dy / mag * b; }
        return [dx, dy];
      };
    }

    for (const spacing of allSpacings) {
      const screenGap = spacing * k;
      if (screenGap < minGap) continue;   // too dense, skip
      if (screenGap > 2000) continue;     // way too coarse, skip

      // Smooth fade: 0 at minGap, 1 at maxGap
      const fade = Math.min(1, (screenGap - minGap) / (maxGap - minGap));
      const alpha = fade * baseAlpha;
      const lineW = 0.5 + fade * 0.8;

      const firstX = Math.floor(wL / spacing) * spacing;
      const firstY = Math.floor(wB / spacing) * spacing;

      ctx.lineWidth = lineW;

      if (!displace) {
        // Flat grid
        for (let wx = firstX; wx <= wR + spacing * 0.5; wx += spacing) {
          const sx = this._worldToScreenX(wx);
          if (sx < pad || sx > W - pad) continue;
          const isOrigin = Math.abs(wx) < spacing * 0.01;
          ctx.strokeStyle = isOrigin
            ? rgba(t.text, Math.min(alpha * 1.5, 0.15))
            : dark ? `rgba(0, 220, 100, ${alpha.toFixed(4)})` : `rgba(60, 60, 70, ${alpha.toFixed(4)})`;
          ctx.beginPath(); ctx.moveTo(sx, pad); ctx.lineTo(sx, H - pad); ctx.stroke();
        }
        for (let wy = firstY; wy <= wT + spacing * 0.5; wy += spacing) {
          const sy = this._worldToScreenY(wy);
          if (sy < pad || sy > H - pad) continue;
          const isOrigin = Math.abs(wy) < spacing * 0.01;
          ctx.strokeStyle = isOrigin
            ? rgba(t.text, Math.min(alpha * 1.5, 0.15))
            : dark ? `rgba(0, 220, 100, ${alpha.toFixed(4)})` : `rgba(60, 60, 70, ${alpha.toFixed(4)})`;
          ctx.beginPath(); ctx.moveTo(pad, sy); ctx.lineTo(W - pad, sy); ctx.stroke();
        }
      } else {
        // Warped grid
        const samples = 50;
        const drawWarpedLine = (getPoint) => {
          ctx.beginPath();
          for (let i = 0; i <= samples; i++) {
            const [bx, by] = getPoint(i / samples);
            const [dx, dy] = displace(bx, by);
            if (i === 0) ctx.moveTo(bx + dx, by + dy); else ctx.lineTo(bx + dx, by + dy);
          }
          ctx.stroke();
        };
        ctx.strokeStyle = dark
          ? `rgba(0, 220, 100, ${alpha.toFixed(4)})`
          : `rgba(60, 60, 70, ${alpha.toFixed(4)})`;

        for (let wy = firstY; wy <= wT + spacing * 0.5; wy += spacing) {
          const sy = this._worldToScreenY(wy);
          if (sy < pad - 20 || sy > H - pad + 20) continue;
          const sxL = Math.max(pad, this._worldToScreenX(wL));
          const sxR = Math.min(W - pad, this._worldToScreenX(wR));
          drawWarpedLine(frac => [sxL + (sxR - sxL) * frac, sy]);
        }
        for (let wx = firstX; wx <= wR + spacing * 0.5; wx += spacing) {
          const sx = this._worldToScreenX(wx);
          if (sx < pad - 20 || sx > W - pad + 20) continue;
          const syT = Math.max(pad, this._worldToScreenY(wT));
          const syB = Math.min(H - pad, this._worldToScreenY(wB));
          drawWarpedLine(frac => [sx, syT + (syB - syT) * frac]);
        }
      }
    }
  }

  // Curvature sources in screen space for grid warping.
  // Each source: {x, y, k: normalized curvature [0,1]}
  _curvatureSources() {
    if (!this.data?.trajectory || !this.data?.nodes) return [];
    const nodeMap = {};
    this.data.nodes.forEach(n => { nodeMap[n.id] = n; });

    let maxCurv = 0;
    for (const edge of this.data.trajectory) {
      if (edge.curvature > maxCurv) maxCurv = edge.curvature;
    }
    if (maxCurv <= 0) return [];

    const sources = [];
    for (const edge of this.data.trajectory) {
      if (!edge.curvature || edge.curvature <= 0) continue;
      const from = nodeMap[edge.from];
      const to = nodeMap[edge.to];
      if (!from || !to) continue;
      const sf = this.toScreen(from);
      const st = this.toScreen(to);
      sources.push({
        x: (sf.sx + st.sx) / 2,
        y: (sf.sy + st.sy) / 2,
        k: edge.curvature / maxCurv,
      });
    }
    return sources;
  }

  drawRadialRings() {
    if (!this.goalId) return;
    const { ctx, scale, zoom, goalSx, goalSy, t } = this;
    ctx.lineWidth = 0.8;
    // Scale dash pattern with zoom so dashes don't "scroll" during zoom
    const dashLen = Math.max(2, 3 * zoom);
    const gapLen = Math.max(3, 5 * zoom);
    for (let r = 0.2; r <= 1.0; r += 0.2) {
      ctx.strokeStyle = rgba(t.ring, r < 0.95 ? 0.1 : 0.18);
      ctx.setLineDash([dashLen, gapLen]);
      ctx.lineDashOffset = 0;
      ctx.beginPath();
      ctx.arc(goalSx, goalSy, r * scale * 0.85 * zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = rgba(t.text, 0.35);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let r = 0.2; r <= 1.0; r += 0.2) {
      const label = r >= 0.95 ? '1 kh' : `${(r * 10).toFixed(0)} rd`;
      ctx.fillText(label, goalSx + r * scale * 0.85 * zoom + 5, goalSy - 5);
    }
  }

  _dimFactor(agent) {
    return this.dimmedAgents.has(agent) ? 0.1 : 1;
  }

  drawTrajectory() {
    const { ctx, data, t } = this;
    if (!data.trajectory || data.trajectory.length === 0) return;
    const nodeMap = {};
    data.nodes.forEach(n => { nodeMap[n.id] = n; });

    // Find max curvature for normalization
    let maxCurv = 0;
    for (const edge of data.trajectory) {
      if (edge.curvature > maxCurv) maxCurv = edge.curvature;
    }

    ctx.save();

    // Draw trajectory lines with arrowheads showing direction
    for (const edge of data.trajectory) {
      const from = nodeMap[edge.from];
      const to = nodeMap[edge.to];
      if (!from || !to) continue;

      const dim = this._dimFactor(edge.agent);
      const alpha = Math.min(this.nodeAlphaFn(edge.from), this.nodeAlphaFn(edge.to)) * dim;
      const c = this.agentColors[edge.agent] || this.agentPalette[0];
      const { sx: fx, sy: fy } = this.toScreen(from);
      const { sx: tx, sy: ty } = this.toScreen(to);

      // Curvature-based visual
      const curv = edge.curvature || 0;
      const normCurv = maxCurv > 0 ? curv / maxCurv : 0;

      // Duration-based line width boost
      const edgeDt = edge.dt || 0;
      const dtNorm = edgeDt > 0 ? Math.min(1, edgeDt / 600) : 0;
      const lineW = 1.5 + normCurv * 2 + dtNorm * 1.0;
      ctx.lineWidth = lineW;
      ctx.strokeStyle = rgba(c, (t.trajAlpha + normCurv * 0.25) * alpha);
      ctx.setLineDash([]);

      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();

      // Arrowhead at midpoint showing direction
      const dx = tx - fx, dy = ty - fy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 20) {
        const mx = (fx + tx) / 2, my = (fy + ty) / 2;
        const ux = dx / len, uy = dy / len; // unit direction
        const arrowSize = Math.min(6, len * 0.15);

        ctx.fillStyle = rgba(c, (t.trajAlpha + 0.15 + normCurv * 0.2) * alpha);
        ctx.beginPath();
        ctx.moveTo(mx + ux * arrowSize, my + uy * arrowSize);
        ctx.lineTo(mx - ux * arrowSize * 0.6 + uy * arrowSize * 0.5, my - uy * arrowSize * 0.6 - ux * arrowSize * 0.5);
        ctx.lineTo(mx - ux * arrowSize * 0.6 - uy * arrowSize * 0.5, my - uy * arrowSize * 0.6 + ux * arrowSize * 0.5);
        ctx.closePath();
        ctx.fill();

        // Duration label on long edges
        if (edgeDt > 60 && alpha > 0.3) {
          let dtLabel;
          if (edgeDt >= 3600) dtLabel = (edgeDt / 3600).toFixed(1) + 'h';
          else if (edgeDt >= 60) dtLabel = Math.round(edgeDt / 60) + 'm';
          else dtLabel = Math.round(edgeDt) + 's';
          ctx.font = '500 9px Inter, system-ui, sans-serif';
          ctx.fillStyle = rgba(c, 0.4 * alpha);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(dtLabel, mx + uy * 12, my - ux * 12 - 2);
        }
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawGoalStar(scx, scy, size) {
    const { ctx, t } = this;
    ctx.save();
    ctx.translate(scx, scy);
    const outerV = size, outerH = size * 0.6, pinch = size * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, -outerV);
    ctx.quadraticCurveTo(pinch, -pinch, outerH, 0);
    ctx.quadraticCurveTo(pinch, pinch, 0, outerV);
    ctx.quadraticCurveTo(-pinch, pinch, -outerH, 0);
    ctx.quadraticCurveTo(-pinch, -pinch, 0, -outerV);
    ctx.closePath();
    const g = t.goalGrad;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    grad.addColorStop(0, `rgba(${g[0][0]},${g[0][1]},${g[0][2]},${g[0][3]})`);
    grad.addColorStop(0.35, `rgba(${g[1][0]},${g[1][1]},${g[1][2]},${g[1][3]})`);
    grad.addColorStop(1, `rgba(${g[2][0]},${g[2][1]},${g[2][2]},${g[2][3]})`);
    ctx.fillStyle = grad;
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 2.5);
    glow.addColorStop(0, rgba(t.goalGlow, 0.08));
    glow.addColorStop(1, rgba(t.goalGlow, 0));
    ctx.beginPath();
    ctx.arc(0, 0, size * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.restore();
  }

  drawSourceStar(scx, scy, size, c) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(scx, scy);
    const outerV = size, outerH = size * 0.6, pinch = size * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, -outerV);
    ctx.quadraticCurveTo(pinch, -pinch, outerH, 0);
    ctx.quadraticCurveTo(pinch, pinch, 0, outerV);
    ctx.quadraticCurveTo(-pinch, pinch, -outerH, 0);
    ctx.quadraticCurveTo(-pinch, -pinch, 0, -outerV);
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    grad.addColorStop(0, rgba(c, 0.35));
    grad.addColorStop(0.35, rgba(c, 0.18));
    grad.addColorStop(1, rgba(c, 0.04));
    ctx.fillStyle = grad;
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 2.5);
    glow.addColorStop(0, rgba(c, 0.06));
    glow.addColorStop(1, rgba(c, 0));
    ctx.beginPath();
    ctx.arc(0, 0, size * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.restore();
  }

  nodeColor(node) {
    return this.agentColors[node.agent] || this.agentPalette[0];
  }

  drawNodes(hoveredNode) {
    const { ctx, data, nodeSize, t } = this;
    if (!data.nodes) return;

    for (const node of data.nodes) {
      const { sx, sy } = this.toScreen(node);
      const size = nodeSize[node.type];
      const dim = node.agent ? this._dimFactor(node.agent) : 1;
      const alpha = this.nodeAlphaFn(node.id) * dim;
      if (alpha < 0.01) continue;

      ctx.globalAlpha = alpha;

      if (node.type === 'goal') {
        this.drawGoalStar(sx, sy, size);
      } else if (node.type === 'source') {
        const c = this.nodeColor(node);
        this.drawSourceStar(sx, sy, size, c);
      } else if (node.type === 'action') {
        const c = this.nodeColor(node);
        const dotR = 5;
        ctx.fillStyle = rgba(c, t.actionFill);
        ctx.beginPath(); ctx.arc(sx, sy, dotR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(c, t.actionStroke);
        ctx.lineWidth = 1.5; ctx.stroke();
        const glow = ctx.createRadialGradient(sx, sy, dotR * 0.5, sx, sy, dotR * 4);
        glow.addColorStop(0, rgba(c, t.glowInner));
        glow.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(sx, sy, dotR * 4, 0, Math.PI * 2); ctx.fill();
      } else {
        // state: ring outline in agent color
        const c = this.nodeColor(node);
        const dotR = 5.5;
        ctx.fillStyle = rgba(t.stateInner, t.stateInnerAlpha);
        ctx.beginPath(); ctx.arc(sx, sy, dotR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(c, t.stateStroke);
        ctx.lineWidth = 1.8; ctx.stroke();
      }

      // --- Outcome encoding ---
      if (node.meta?.outcome) {
        const c = this.nodeColor(node);
        const oR = (nodeSize[node.type] || 5) + 3;
        if (node.meta.outcome === 'success') {
          // Green arc at 12 o'clock
          ctx.strokeStyle = 'rgba(40, 200, 80, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, oR, -Math.PI * 0.75, -Math.PI * 0.25);
          ctx.stroke();
        } else if (node.meta.outcome === 'failure') {
          // Red-tinted glow
          const rGlow = ctx.createRadialGradient(sx, sy, 2, sx, sy, oR * 3);
          rGlow.addColorStop(0, 'rgba(220, 50, 40, 0.15)');
          rGlow.addColorStop(1, 'rgba(220, 50, 40, 0)');
          ctx.fillStyle = rGlow;
          ctx.beginPath(); ctx.arc(sx, sy, oR * 3, 0, Math.PI * 2); ctx.fill();
        } else if (node.meta.outcome === 'blocked') {
          // Dashed outline
          ctx.strokeStyle = rgba(c, 0.5);
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.arc(sx, sy, oR, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        } else if (node.meta.outcome === 'in_progress') {
          // Pulsing glow
          const pulse = 0.3 + 0.3 * Math.sin(performance.now() / 400);
          const pGlow = ctx.createRadialGradient(sx, sy, 2, sx, sy, oR * 2.5);
          pGlow.addColorStop(0, rgba(c, pulse * 0.2));
          pGlow.addColorStop(1, rgba(c, 0));
          ctx.fillStyle = pGlow;
          ctx.beginPath(); ctx.arc(sx, sy, oR * 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }

      // --- Session lifecycle markers ---
      if (node.meta?.sessionEvent) {
        const mR = (nodeSize[node.type] || 5) + 5;
        if (node.meta.sessionEvent === 'checkpoint') {
          // Small square marker
          ctx.strokeStyle = rgba(this.nodeColor(node), 0.5);
          ctx.lineWidth = 1.2;
          const sq = 4;
          ctx.strokeRect(sx - sq, sy - sq, sq * 2, sq * 2);
        } else if (node.meta.sessionEvent === 'distress') {
          // Red warning triangle
          ctx.fillStyle = 'rgba(220, 50, 40, 0.65)';
          ctx.beginPath();
          ctx.moveTo(sx, sy - mR);
          ctx.lineTo(sx - mR * 0.6, sy - mR + mR * 0.9);
          ctx.lineTo(sx + mR * 0.6, sy - mR + mR * 0.9);
          ctx.closePath();
          ctx.fill();
        } else if (node.meta.sessionEvent === 'done') {
          const status = node.meta.sessionStatus;
          const ringColor = (!status || status === 'completed' || status === 'success')
            ? 'rgba(40, 200, 80, 0.55)'
            : (status === 'blocked' ? 'rgba(220, 160, 30, 0.55)' : 'rgba(220, 80, 50, 0.55)');
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(sx, sy, mR, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // --- Progress arc ---
      if (node.meta?.progress != null && node.meta.progress > 0) {
        const pR = (nodeSize[node.type] || 5) + 4;
        const frac = Math.min(1, node.meta.progress / 100);
        ctx.strokeStyle = 'rgba(40, 180, 220, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, pR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.stroke();
      }

      if (hoveredNode === node) {
        const hr = nodeSize[node.type] + 4;
        const c = this.nodeColor(node);
        ctx.strokeStyle = node.type === 'goal'
          ? rgba(t.goal, 0.6)
          : rgba(c, 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, hr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // labels for source/goal — use agent name to avoid overlapping generic labels
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const placedLabels = []; // collision detection
    for (const node of data.nodes) {
      if (node.type !== 'source' && node.type !== 'goal') continue;
      const { sx, sy } = this.toScreen(node);
      const dim = node.agent ? this._dimFactor(node.agent) : 1;
      const alpha = this.nodeAlphaFn(node.id) * dim;
      if (alpha < 0.1) continue;

      let label;
      if (node.type === 'goal') {
        const goalIdx = data.meta.goalIds.indexOf(node.id);
        label = data.meta.goalIds.length === 1 ? 'DESTINATION' : `DEST-${goalIdx}`;
      } else {
        label = node.agent ? node.agent.toUpperCase() : 'ORIGIN';
      }

      // Skip if it would overlap a placed label
      const ly = sy - nodeSize[node.type] - 8;
      const tw = ctx.measureText(label).width;
      const overlaps = placedLabels.some(p =>
        Math.abs(p.x - sx) < (p.w + tw) / 2 + 10 && Math.abs(p.y - ly) < 18
      );
      if (overlaps) continue;

      const c = node.type === 'goal' ? t.goal : this.nodeColor(node);
      ctx.fillStyle = rgba(node.type === 'goal' ? t.text : c, 0.65 * alpha);
      ctx.fillText(label, sx, ly);
      placedLabels.push({ x: sx, y: ly, w: tw });
    }

    // state index labels
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const node of data.nodes) {
      if (node.type !== 'state') continue;
      const match = node.id.match(/state-(\d+)$/);
      const idx = match ? match[1] : node.id;
      const { sx, sy } = this.toScreen(node);
      const dim = node.agent ? this._dimFactor(node.agent) : 1;
      const alpha = this.nodeAlphaFn(node.id) * dim;
      const c = this.nodeColor(node);
      ctx.fillStyle = rgba(c, 0.45 * alpha);
      const scope = node.meta?.scope;
      const label = scope ? `s${idx} ${scope}` : `s${idx}`;
      ctx.fillText(label, sx + 10, sy + 2);
    }
  }

  drawEdgeFades() {
    const { ctx, W, H, t } = this;
    const fadeW = 22;
    const fc = `rgba(${t.bgRgb[0]},${t.bgRgb[1]},${t.bgRgb[2]},`;
    const lG = ctx.createLinearGradient(0, 0, fadeW, 0);
    lG.addColorStop(0, fc + '0.8)'); lG.addColorStop(1, fc + '0)');
    ctx.fillStyle = lG; ctx.fillRect(0, 0, fadeW, H);
    const rG = ctx.createLinearGradient(W - fadeW, 0, W, 0);
    rG.addColorStop(0, fc + '0)'); rG.addColorStop(1, fc + '0.8)');
    ctx.fillStyle = rG; ctx.fillRect(W - fadeW, 0, fadeW, H);
    const tG = ctx.createLinearGradient(0, 0, 0, fadeW);
    tG.addColorStop(0, fc + '0.8)'); tG.addColorStop(1, fc + '0)');
    ctx.fillStyle = tG; ctx.fillRect(0, 0, W, fadeW);
    const bG = ctx.createLinearGradient(0, H - fadeW, 0, H);
    bG.addColorStop(0, fc + '0)'); bG.addColorStop(1, fc + '0.8)');
    ctx.fillStyle = bG; ctx.fillRect(0, H - fadeW, W, fadeW);
  }

  drawAlignmentPanel() {
    const { ctx, goalId, data, H, agentColors, t } = this;
    if (!goalId || !data.alignments || data.alignments.length === 0) return;
    const panelX = 20;
    const barW = 140;
    const barH = 16;
    const gap = 6;
    const MAX_BARS = 8;
    const allGoalAlignments = data.alignments.filter(a => a.goalId === goalId && !this.dimmedAgents.has(a.agent));
    if (allGoalAlignments.length === 0) return;
    const goalAlignments = allGoalAlignments.slice(-MAX_BARS);
    const truncated = allGoalAlignments.length > MAX_BARS;
    let y = H - 20 - goalAlignments.length * (barH + gap);

    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = rgba(t.text, 0.45);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const label = truncated ? `ALIGNMENT (last ${MAX_BARS} of ${allGoalAlignments.length})` : 'ALIGNMENT';
    ctx.fillText(label, panelX, y - 8);

    for (const a of goalAlignments) {
      const match = a.actionId.match(/(?:(.+):)?action-(\d+)$/);
      const shortLabel = match
        ? (match[1] ? `${match[1]}:a${match[2]}` : `a${match[2]}`)
        : a.actionId;
      const val = Math.max(0, Math.min(1, a.alignment));
      const c = agentColors[a.agent] || this.agentPalette[0];

      ctx.fillStyle = rgba(t.text, 0.06);
      ctx.fillRect(panelX, y, barW, barH);
      const barAlpha = 0.15 + val * 0.45;
      ctx.fillStyle = rgba(c, barAlpha);
      ctx.fillRect(panelX, y, barW * val, barH);
      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(t.text, 0.5);
      ctx.textBaseline = 'middle';
      ctx.fillText(`${shortLabel}  ${a.alignment.toFixed(2)}`, panelX + barW + 10, y + barH / 2);
      y += barH + gap;
    }
  }

  drawComparisonPanel() {
    const { ctx, data, agentColors, t, W, H } = this;
    if (!data?.meta?.agents || data.meta.agents.length <= 1) return;

    const agents = data.meta.agents;
    const goalIds = data.meta.goalIds || [];
    const barW = 160;
    const barH = 16;
    const gap = 6;
    const panelX = W - 200;
    let y = H - 20 - agents.length * (barH + gap);

    // If curvature panel exists in dev mode, shift up
    if (this.devMode && data.meta?.curvature?.length) {
      const curvRows = data.meta.curvature.length;
      const hasTemporal = data.meta.curvature.some(c => c.meanVelocity != null);
      const totalCurvRows = hasTemporal ? curvRows * 2 : curvRows;
      y -= totalCurvRows * (barH + gap) + 40;
    }

    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = rgba(t.text, 0.45);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('COMPARISON', panelX, y - 8);

    // Compute per-agent metrics
    for (const agent of agents) {
      const dimmed = this.dimmedAgents.has(agent);
      const c = agentColors[agent] || this.agentPalette[0];
      const alpha = dimmed ? 0.15 : 1;

      // Step count: count action nodes for this agent
      const agentNodes = data.nodes.filter(n => n.agent === agent && (n.type === 'action' || n.type === 'state'));
      const stepCount = Math.floor(agentNodes.length / 2) || agentNodes.length;

      // Mean alignment across all goals
      const agentAlignments = (data.alignments || []).filter(a => a.agent === agent);
      const meanA = agentAlignments.length > 0
        ? agentAlignments.reduce((s, a) => s + a.alignment, 0) / agentAlignments.length
        : 0;

      // Mean r (distance from goal) for this agent's final state across goals
      const agentStates = data.nodes.filter(n => n.agent === agent && n.type === 'state');
      const finalState = agentStates[agentStates.length - 1];
      let meanR = 0;
      if (finalState?.polar && goalIds.length > 0) {
        let rSum = 0, rCount = 0;
        for (const gid of goalIds) {
          if (finalState.polar[gid]) { rSum += finalState.polar[gid].r; rCount++; }
        }
        meanR = rCount > 0 ? rSum / rCount : 0;
      }

      // Background bar
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rgba(t.text, 0.04);
      ctx.fillRect(panelX, y, barW, barH);

      // Agent color accent bar (width based on alignment)
      const barVal = Math.max(0, Math.min(1, meanA));
      ctx.fillStyle = rgba(c, 0.12 + barVal * 0.3);
      ctx.fillRect(panelX, y, barW * barVal, barH);

      // Agent status from metadata
      let statusStr = '';
      const agentAllNodes = data.nodes.filter(n => n.agent === agent);
      const latestNode = agentAllNodes[agentAllNodes.length - 1];
      if (latestNode?.meta) {
        if (latestNode.meta.scope) statusStr += ` [${latestNode.meta.scope}]`;
        if (latestNode.meta.sessionEvent === 'done') statusStr += ' done';
        else if (latestNode.meta.sessionEvent === 'distress') statusStr += ' !';
        else if (latestNode.meta.outcome === 'blocked') statusStr += ' blocked';
      }
      // Time since last activity
      if (latestNode?.ts) {
        const ago = (Date.now() - latestNode.ts) / 1000;
        if (ago < 120) statusStr += ` ${Math.round(ago)}s ago`;
        else if (ago < 7200) statusStr += ` ${Math.round(ago / 60)}m ago`;
        else statusStr += ` ${(ago / 3600).toFixed(1)}h ago`;
      }

      // Label
      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(t.text, 0.5);
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${agent}  ${stepCount} steps  \u0101 ${meanA.toFixed(2)}  r\u0304 ${meanR.toFixed(2)}${statusStr}`,
        panelX + 4, y + barH / 2
      );
      ctx.globalAlpha = 1;

      y += barH + gap;
    }
  }

  drawCurvaturePanel() {
    if (!this.devMode) return;
    const { ctx, data, agentColors, t, W } = this;
    if (!data.meta?.curvature || data.meta.curvature.length === 0) return;

    const hasTemporal = data.meta.curvature.some(c => c.meanVelocity != null);
    const rows = data.meta.curvature.length;
    const panelX = W - 170;
    const barW = 120;
    const barH = 16;
    const gap = 6;
    // Extra rows for velocity if temporal data exists
    const totalRows = hasTemporal ? rows * 2 : rows;
    let y = this.H - 20 - totalRows * (barH + gap);

    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = rgba(t.text, 0.45);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('CURVATURE', panelX, y - 8);

    // Normalize: find max meanCurvature and max meanVelocity for bar scaling
    let maxMean = 0;
    let maxVel = 0;
    for (const c of data.meta.curvature) {
      if (c.meanCurvature > maxMean) maxMean = c.meanCurvature;
      if (c.meanVelocity > maxVel) maxVel = c.meanVelocity;
    }
    if (maxMean < 0.01) maxMean = 1;
    if (maxVel < 0.001) maxVel = 1;

    for (const c of data.meta.curvature) {
      const val = Math.min(1, c.meanCurvature / maxMean);
      const ac = agentColors[c.agent] || this.agentPalette[0];

      ctx.fillStyle = rgba(t.text, 0.06);
      ctx.fillRect(panelX, y, barW, barH);
      ctx.fillStyle = rgba(ac, 0.15 + val * 0.45);
      ctx.fillRect(panelX, y, barW * val, barH);
      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(t.text, 0.5);
      ctx.textBaseline = 'middle';
      ctx.fillText(`${c.agent}  ${c.meanCurvature.toFixed(2)} hy`, panelX + barW + 10, y + barH / 2);
      y += barH + gap;

      // Velocity bar (if temporal data exists for this agent)
      if (c.meanVelocity != null) {
        const vVal = Math.min(1, c.meanVelocity / maxVel);
        ctx.fillStyle = rgba(t.text, 0.06);
        ctx.fillRect(panelX, y, barW, barH);
        ctx.fillStyle = rgba(ac, 0.1 + vVal * 0.35);
        ctx.fillRect(panelX, y, barW * vVal, barH);
        ctx.font = '500 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = rgba(t.text, 0.4);
        const dur = c.duration != null ? `${c.duration.toFixed(0)} bt` : '?';
        ctx.fillText(`  ${c.meanVelocity.toFixed(3)} rd  ${dur}`, panelX + barW + 10, y + barH / 2);
        y += barH + gap;
      }
    }

    // Human baseline section
    const baselines = data.meta?.humanBaseline;
    if (baselines?.length) {
      y += 6;
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(t.text, 0.45);
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      ctx.fillText('HUMAN BASELINE', panelX, y);
      y += 4;

      for (const b of baselines) {
        const ac = agentColors[b.agent] || this.agentPalette[0];
        const timeStr = b.predictedHumanMinutes >= 60
          ? (b.predictedHumanMinutes / 60).toFixed(1) + 'h'
          : Math.round(b.predictedHumanMinutes) + 'm';

        ctx.textBaseline = 'middle';
        if (b.speedup != null) {
          // Show speedup bar: green for >1x (faster), red-ish for <1x (slower)
          const logSpeedup = Math.log2(Math.max(0.1, b.speedup));
          const barVal = Math.min(1, Math.max(0, (logSpeedup + 2) / 5)); // -2 to +3 log2 range
          const faster = b.speedup >= 1;
          ctx.fillStyle = rgba(t.text, 0.06);
          ctx.fillRect(panelX, y, barW, barH);
          ctx.fillStyle = faster ? rgba(ac, 0.15 + barVal * 0.45) : rgba([200, 80, 60], 0.15 + (1 - barVal) * 0.3);
          ctx.fillRect(panelX, y, barW * barVal, barH);
          ctx.fillStyle = rgba(t.text, 0.5);
          ctx.fillText(`${b.agent}  ${b.speedup.toFixed(1)}x  (${timeStr} human)`, panelX + barW + 8, y + barH / 2);
        } else {
          // No temporal data: just show predicted time
          ctx.fillStyle = rgba(t.text, 0.4);
          ctx.fillText(`${b.agent}  ~${timeStr} human`, panelX + barW + 8, y + barH / 2);
        }
        y += barH + gap;
      }
    }
  }

  drawLegend() {
    const { ctx, data, t } = this;
    const lx = 20;
    let ly = 24;
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = rgba(t.text, 0.5);
    ctx.fillText('GUILD NAVIGATOR', lx, ly);
    if (this.devMode) {
      const tw = ctx.measureText('GUILD NAVIGATOR').width;
      ctx.fillStyle = this.themeName === 'dark' ? 'rgba(0,255,160,0.35)' : 'rgba(100,23,236,0.4)';
      ctx.font = '700 10px Inter, system-ui, sans-serif';
      ctx.fillText('DEV', lx + tw + 8, ly + 2);
    }
    ly += 28;

    ctx.font = '500 12px Inter, system-ui, sans-serif';

    // goal: colored filled circle
    ctx.fillStyle = rgba(t.goal, 0.8);
    ctx.beginPath(); ctx.arc(lx + 6, ly + 5, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(t.text, 0.5);
    ctx.fillText('destination', lx + 18, ly);
    ly += 20;

    // source: outlined circle
    ctx.fillStyle = rgba(t.text, 0.15);
    ctx.beginPath(); ctx.arc(lx + 6, ly + 5, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(t.text, 0.4);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = rgba(t.text, 0.5);
    ctx.fillText('origin', lx + 18, ly);
    ly += 20;

    // action: filled circle
    const sampleC = this.agentPalette[0];
    ctx.fillStyle = rgba(sampleC, 0.75);
    ctx.beginPath(); ctx.arc(lx + 6, ly + 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(t.text, 0.5);
    ctx.fillText('action', lx + 18, ly);
    ly += 20;

    // state: ring outline
    ctx.fillStyle = rgba(t.stateInner, t.stateInnerAlpha);
    ctx.beginPath(); ctx.arc(lx + 6, ly + 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(sampleC, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = rgba(t.text, 0.5);
    ctx.fillText('state', lx + 18, ly);
    ly += 20;

    // arrow: direction indicator
    ctx.fillStyle = rgba(sampleC, 0.6);
    ctx.beginPath();
    ctx.moveTo(lx + 10, ly + 5);
    ctx.lineTo(lx + 2, ly + 2);
    ctx.lineTo(lx + 2, ly + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(t.text, 0.5);
    ctx.fillText('direction', lx + 18, ly);
    ly += 20;

    const agents = data ? (data.meta.agents || []) : [];
    this._legendHits = [];
    if (agents.length > 1) {
      ly += 10;
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(t.text, 0.45);
      ctx.fillText('AGENTS', lx, ly);
      ly += 18;
      ctx.font = '500 12px Inter, system-ui, sans-serif';
      for (const agent of agents) {
        const c = this.agentColors[agent];
        if (!c) continue;
        const dimmed = this.dimmedAgents.has(agent);
        if (dimmed) {
          // Outlined swatch for dimmed agent
          ctx.strokeStyle = rgba(c, 0.4);
          ctx.lineWidth = 1.5;
          ctx.strokeRect(lx + 1.5, ly + 1.5, 9, 9);
          ctx.fillStyle = rgba(t.text, 0.25);
        } else {
          // Filled swatch for active agent
          ctx.fillStyle = rgba(c, 0.7);
          ctx.fillRect(lx + 1, ly + 1, 10, 10);
          ctx.fillStyle = rgba(t.text, 0.5);
        }
        ctx.fillText(agent, lx + 18, ly);
        // Store hit area for click detection
        this._legendHits.push({ agent, x: lx, y: ly - 2, w: 120, h: 18 });
        ly += 20;
      }
    }

    // zoom indicator
    if (Math.abs(this.zoom - 1) > 0.05) {
      ly += 10;
      ctx.font = '500 12px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(t.text, 0.35);
      ctx.fillText(`${Math.round(this.zoom * 100)}%`, lx, ly);
    }

  }

  // Unit system — named after women who expanded human understanding.
  //
  // distance:  khemā (kh)   — Khemā, foremost in wisdom. The base spatial unit.
  // curvature: hypatia (hy) — Hypatia of Alexandria, conic sections. 1/kh, path bending.
  // velocity:  ride (rd)    — Sally Ride, first American woman in space. kh/s, traversal speed.
  // time:      butler (bt)  — Octavia Butler, deep time in sci-fi. Seconds of agent computation.
  // cost:      hopper (hp)  — Grace Hopper, computational efficiency. Kilotokens of compute.

  _formatDistance(value, spacing) {
    if (Math.abs(value) < 1e-9) return '0';
    if (spacing >= 1)     return `${value.toFixed(0)} kh`;
    if (spacing >= 0.1)   return `${value.toFixed(1)} kh`;
    if (spacing >= 0.01)  return `${value.toFixed(2)} kh`;
    if (spacing >= 0.001) return `${value.toFixed(3)} kh`;
    return `${value.toFixed(4)} kh`;
  }

  _formatDistanceShort(value, spacing) {
    if (Math.abs(value) < 1e-9) return '0';
    if (spacing >= 1)     return value.toFixed(0);
    if (spacing >= 0.1)   return value.toFixed(1);
    if (spacing >= 0.01)  return value.toFixed(2);
    if (spacing >= 0.001) return value.toFixed(3);
    return value.toFixed(4);
  }

  _scaleUnitLabel() {
    const spacing = this._gridSpacing();
    if (spacing >= 1)     return 'khemā (1 kh)';
    if (spacing >= 0.1)   return 'khemā (0.1 kh)';
    if (spacing >= 0.01)  return 'khemā (0.01 kh)';
    if (spacing >= 0.001) return 'khemā (0.001 kh)';
    return 'khemā';
  }

  drawGraduations() {
    const { ctx, W, H, t } = this;
    const pad = 8;
    const spacing = this._gridSpacing();
    const k = this.scale * 0.85 * this.zoom;
    const screenGap = spacing * k;

    const wL = Math.min(this._screenToWorldX(pad), this._screenToWorldX(W - pad));
    const wR = Math.max(this._screenToWorldX(pad), this._screenToWorldX(W - pad));
    const wB = Math.min(this._screenToWorldY(pad), this._screenToWorldY(H - pad));
    const wT = Math.max(this._screenToWorldY(pad), this._screenToWorldY(H - pad));
    const firstX = Math.floor(wL / spacing) * spacing;
    const firstY = Math.floor(wB / spacing) * spacing;

    // Thin out edge labels: target ~120-180px between labels
    const edgeEvery = Math.max(1, Math.round(150 / screenGap));
    const edgeAlpha = 0.45;

    ctx.font = '500 11px Inter, system-ui, sans-serif';

    // Bottom edge: X coords
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let ei = 0;
    for (let wx = firstX; wx <= wR + spacing * 0.5; wx += spacing) {
      ei++;
      if (ei % edgeEvery !== 0) continue;
      const sx = this._worldToScreenX(wx);
      if (sx < 40 || sx > W - 40) continue;
      const label = this._formatDistance(wx, spacing);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = t.gradCircle;
      ctx.fillRect(sx - tw / 2 - 3, H - 17, tw + 6, 13);
      ctx.fillStyle = rgba(t.text, edgeAlpha);
      ctx.fillText(label, sx, H - 15);
    }

    // Top edge: X coords
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ei = 0;
    for (let wx = firstX; wx <= wR + spacing * 0.5; wx += spacing) {
      ei++;
      if (ei % edgeEvery !== 0) continue;
      const sx = this._worldToScreenX(wx);
      if (sx < 40 || sx > W - 40) continue;
      const label = this._formatDistance(wx, spacing);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = t.gradCircle;
      ctx.fillRect(sx - tw / 2 - 3, 4, tw + 6, 13);
      ctx.fillStyle = rgba(t.text, edgeAlpha);
      ctx.fillText(label, sx, 15);
    }

    // Left edge: Y coords
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ei = 0;
    for (let wy = firstY; wy <= wT + spacing * 0.5; wy += spacing) {
      ei++;
      if (ei % edgeEvery !== 0) continue;
      const sy = this._worldToScreenY(wy);
      if (sy < 20 || sy > H - 20) continue;
      const label = this._formatDistance(wy, spacing);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = t.gradCircle;
      ctx.fillRect(2, sy - 7, tw + 6, 14);
      ctx.fillStyle = rgba(t.text, edgeAlpha);
      ctx.fillText(label, tw + 5, sy);
    }

    // Right edge: Y coords
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ei = 0;
    for (let wy = firstY; wy <= wT + spacing * 0.5; wy += spacing) {
      ei++;
      if (ei % edgeEvery !== 0) continue;
      const sy = this._worldToScreenY(wy);
      if (sy < 20 || sy > H - 20) continue;
      const label = this._formatDistance(wy, spacing);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = t.gradCircle;
      ctx.fillRect(W - tw - 8, sy - 7, tw + 6, 14);
      ctx.fillStyle = rgba(t.text, edgeAlpha);
      ctx.fillText(label, W - tw - 5, sy);
    }

    // --- Inline coordinate labels (sparse) ---
    // Target ~500px apart; short format without unit suffix
    const inlineEvery = Math.max(2, Math.round(500 / screenGap));

    ctx.font = '500 9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';

    let xi = 0;
    for (let wx = firstX; wx <= wR + spacing * 0.5; wx += spacing) {
      xi++;
      if (xi % inlineEvery !== 0) continue;
      const sx = this._worldToScreenX(wx);
      if (sx < 80 || sx > W - 80) continue;

      let yi = 0;
      for (let wy = firstY; wy <= wT + spacing * 0.5; wy += spacing) {
        yi++;
        if (yi % inlineEvery !== 0) continue;
        const sy = this._worldToScreenY(wy);
        if (sy < 40 || sy > H - 40) continue;

        // Short format: just numbers, no "kh" suffix
        const xv = this._formatDistanceShort(wx, spacing);
        const yv = this._formatDistanceShort(wy, spacing);
        const coordLabel = `${xv}, ${yv}`;
        const tw = ctx.measureText(coordLabel).width;

        ctx.fillStyle = t.gradCircle;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(sx + 3, sy - 11, tw + 4, 10);
        ctx.globalAlpha = 1;
        ctx.fillStyle = rgba(t.text, 0.18);
        ctx.fillText(coordLabel, sx + 5, sy - 2);
      }
    }

    // --- Scale bar (bottom-right) ---
    const scaleLabel = this._scaleUnitLabel();
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    const barScreenW = Math.min(Math.abs(this._worldToScreenX(spacing) - this._worldToScreenX(0)), W * 0.25);
    const barX = W - 24 - barScreenW;
    const barY = H - 28;
    ctx.strokeStyle = rgba(t.text, 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(barX, barY); ctx.lineTo(barX + barScreenW, barY);
    ctx.moveTo(barX, barY - 3); ctx.lineTo(barX, barY + 3);
    ctx.moveTo(barX + barScreenW, barY - 3); ctx.lineTo(barX + barScreenW, barY + 3);
    ctx.stroke();

    ctx.fillStyle = rgba(t.text, 0.3);
    ctx.fillText(scaleLabel, barX + barScreenW, barY - 5);
  }
}
