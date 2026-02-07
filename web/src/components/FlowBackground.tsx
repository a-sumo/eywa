import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseHue: number;
  size: number;
}

export function FlowBackground() {
  // Marker mode: centered convergence, ACeP-safe colors, bigger logo, no glow.
  // Activated by setting window.__eywaMarkerMode = true before page load.
  const markerMode = typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__eywaMarkerMode;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoOverlayRef = useRef<HTMLImageElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const pulseTimeRef = useRef<number>(0);
  const logoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoRadiusRef = useRef<number>(0);
  const logoMaskRef = useRef<{ data: Uint8ClampedArray; width: number; height: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CENTER_Y_RATIO = markerMode ? 0.5 : 0.3;
    const CENTER_Y_OFFSET = markerMode ? 0 : -40;

    // Load logo with original colors (no white tint)
    const LOGO_SIZE = markerMode ? 200 : 68;
    const LOGO_RENDER_SCALE = 2;
    const LOGO_EXCLUSION_RADIUS = LOGO_SIZE * 0.7;
    const LOGO_MASK_SCALE = 1.08;
    const LOGO_MASK_ALPHA_THRESHOLD = 20;
    const logoImg = new Image();
    logoImg.src = "/eywa-logo.svg";
    logoImg.onload = () => {
      const aspect = logoImg.width / logoImg.height;
      const w = LOGO_SIZE * LOGO_RENDER_SCALE;
      const h = (LOGO_SIZE / aspect) * LOGO_RENDER_SCALE;
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const offCtx = offscreen.getContext("2d")!;
      offCtx.drawImage(logoImg, 0, 0, w, h);
      logoCanvasRef.current = offscreen;
      logoRadiusRef.current = Math.max(w, h) / (2 * LOGO_RENDER_SCALE) + 2;
      const imageData = offCtx.getImageData(0, 0, w, h);
      logoMaskRef.current = { data: imageData.data, width: w, height: h };

    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Particle colors
    const randomHue = (): number => {
      if (markerMode) {
        // ACeP 7-color palette: hues that quantize to red, green, blue, orange, yellow
        const r = Math.random();
        if (r < 0.30) return 240;                    // Blue
        if (r < 0.55) return 0 + Math.random() * 10; // Red
        if (r < 0.75) return 120 + Math.random() * 20; // Green
        if (r < 0.90) return 25 + Math.random() * 10;  // Orange
        return 55 + Math.random() * 10;                 // Yellow
      }
      // Normal mode - blue biased aurora palette
      const r = Math.random();
      if (r < 0.65) return 200 + Math.random() * 40; // Blues
      if (r < 0.85) return 170 + Math.random() * 30; // Cyans
      if (r < 0.95) return 260 + Math.random() * 30; // Purple
      return 320 + Math.random() * 20; // Pink accent
    };

    const createParticle = (w: number, h: number): Particle => {
      // Spawn from edges
      const edge = Math.floor(Math.random() * 4);
      let x: number, y: number;

      switch (edge) {
        case 0: x = Math.random() * w; y = -20; break;
        case 1: x = w + 20; y = Math.random() * h; break;
        case 2: x = Math.random() * w; y = h + 20; break;
        default: x = -20; y = Math.random() * h; break;
      }

      return {
        x,
        y,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        baseHue: randomHue(),
        size: markerMode ? 3 + Math.random() * 4 : 2 + Math.random() * 1.5,
      };
    };

    // Initialize with many particles (3x density in marker mode for tighter crop)
    const initParticles = () => {
      const particles: Particle[] = [];
      const density = markerMode ? 800 : 2500;
      const count = Math.floor((canvas.width * canvas.height) / density);

      for (let i = 0; i < count; i++) {
        particles.push(createParticle(canvas.width, canvas.height));
      }
      return particles;
    };

    // Curl noise for swirling
    const noise = (x: number, y: number, t: number): number => {
      return Math.sin(x * 0.006 + t) * Math.cos(y * 0.005 + t * 0.7) +
             Math.sin((x + y) * 0.004 + t * 1.2) * 0.5 +
             Math.cos(x * 0.01 - y * 0.007 + t * 0.4) * 0.3;
    };

    // Vector field with swirl and convergence
    const vectorField = (x: number, y: number, w: number, h: number, t: number) => {
      const centerX = w * 0.5;
      const centerY = h * CENTER_Y_RATIO + CENTER_Y_OFFSET;

      const dx = centerX - x;
      const dy = centerY - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      // Swirl increases with distance
      const curlStrength = Math.min(1, dist / 300) * 0.8;
      const curl = noise(x, y, t) * curlStrength;

      // Convergence toward center (stronger in marker mode to pull particles in)
      const convergence = markerMode
        ? Math.min(3.0, 0.6 + dist * 0.006)
        : Math.min(1.8, 0.3 + dist * 0.003);

      const finalAngle = angle + curl;

      return {
        vx: Math.cos(finalAngle) * convergence,
        vy: Math.sin(finalAngle) * convergence,
      };
    };

    particlesRef.current = initParticles();

    // Spatial hash for particle repulsion
    const CELL_SIZE = 40;
    const REPULSION_DIST = 35;
    const REPULSION_STRENGTH = 0.15;

    // Heartbeat timing
    const PULSE_INTERVAL = 2.8;
    const PULSE_SPEED = 450;
    const PULSE_WIDTH = 200;

    const animate = () => {
      if (!ctx || !canvas) return;

      const dt = 0.016;
      timeRef.current += dt;
      pulseTimeRef.current += dt;

      if (pulseTimeRef.current > PULSE_INTERVAL) {
        pulseTimeRef.current = 0;
      }

      // Clear
      ctx.fillStyle = "rgb(8, 10, 18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      const centerX = canvas.width * 0.5;
      const centerY = canvas.height * CENTER_Y_RATIO + CENTER_Y_OFFSET;
      const pulseRadius = pulseTimeRef.current * PULSE_SPEED;

      // Pulse timing
      const pulseT = pulseTimeRef.current / PULSE_INTERVAL;
      const pulseShape = Math.exp(-Math.pow((pulseT - 0.18) / 0.22, 2));
      const corePulse = 0.7 + pulseShape * 0.5;

      // Dynamic glow - animated aurora lights orbiting behind logo (skip in marker mode)
      if (markerMode) { /* no glow - soft gradients don't survive ACeP dithering */ }
      else {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const gt = timeRef.current;
      const lights = [
        { hue: 195, spd: 0.6, rx: 16, ry: 10, sz: 100, ph: 0 },
        { hue: 270, spd: -0.45, rx: 20, ry: 12, sz: 110, ph: 1.2 },
        { hue: 215, spd: 0.35, rx: 12, ry: 8, sz: 85, ph: 2.8 },
        { hue: 330, spd: -0.7, rx: 14, ry: 9, sz: 75, ph: 0.6 },
        { hue: 180, spd: 0.55, rx: 8, ry: 5, sz: 60, ph: 4.1 },
      ];
      for (const l of lights) {
        const a = gt * l.spd + l.ph;
        const lx = centerX + Math.cos(a) * l.rx;
        const ly = centerY + Math.sin(a * 0.7) * l.ry;
        const sz = l.sz * (0.85 + corePulse * 0.2);
        const baseAlpha = 0.15 + corePulse * 0.08;
        const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, sz);
        grad.addColorStop(0, `hsla(${l.hue}, 80%, 70%, ${baseAlpha})`);
        grad.addColorStop(0.3, `hsla(${l.hue}, 70%, 55%, ${baseAlpha * 0.5})`);
        grad.addColorStop(0.6, `hsla(${l.hue}, 60%, 40%, ${baseAlpha * 0.15})`);
        grad.addColorStop(1, `hsla(${l.hue}, 50%, 30%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lx, ly, sz, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      } // end glow

      // Build spatial hash grid
      const grid = new Map<string, number[]>();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const cellX = Math.floor(p.x / CELL_SIZE);
        const cellY = Math.floor(p.y / CELL_SIZE);
        const key = `${cellX},${cellY}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(i);
      }

      // Update particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Flow field force
        const field = vectorField(p.x, p.y, canvas.width, canvas.height, timeRef.current);

        // Repulsion from neighbors for even spacing
        let repelX = 0;
        let repelY = 0;
        const cellX = Math.floor(p.x / CELL_SIZE);
        const cellY = Math.floor(p.y / CELL_SIZE);

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const key = `${cellX + dx},${cellY + dy}`;
            const neighbors = grid.get(key);
            if (!neighbors) continue;

            for (const j of neighbors) {
              if (i === j) continue;
              const other = particles[j];
              const ddx = p.x - other.x;
              const ddy = p.y - other.y;
              const distSq = ddx * ddx + ddy * ddy;

              if (distSq < REPULSION_DIST * REPULSION_DIST && distSq > 0.1) {
                const dist = Math.sqrt(distSq);
                const force = (REPULSION_DIST - dist) / REPULSION_DIST * REPULSION_STRENGTH;
                repelX += (ddx / dist) * force;
                repelY += (ddy / dist) * force;
              }
            }
          }
        }

        // Distance to center (needed for pulse calculation)
        const distToCenter = Math.sqrt((p.x - centerX) ** 2 + (p.y - centerY) ** 2);

        // Logo mask hit test (slightly larger than logo bounds)
        let inLogoMask = false;
        const logoMask = logoMaskRef.current;
        if (logoMask) {
          const dx = (p.x - centerX) / LOGO_MASK_SCALE;
          const dy = (p.y - centerY) / LOGO_MASK_SCALE;
          const u = Math.round(dx * LOGO_RENDER_SCALE + logoMask.width / 2);
          const v = Math.round(dy * LOGO_RENDER_SCALE + logoMask.height / 2);
          if (u >= 0 && v >= 0 && u < logoMask.width && v < logoMask.height) {
            const idx = (v * logoMask.width + u) * 4 + 3;
            inLogoMask = logoMask.data[idx] > LOGO_MASK_ALPHA_THRESHOLD;
          }
        }

        // Pulse wave - particles light up as wave passes
        const distFromPulse = Math.abs(distToCenter - pulseRadius);
        const pulseEffect = distFromPulse < PULSE_WIDTH
          ? Math.pow(1 - distFromPulse / PULSE_WIDTH, 1.5)
          : 0;

        // Wave PULLS particles toward center while affecting them
        let pullX = 0;
        let pullY = 0;
        if (pulseEffect > 0.1 && distToCenter > 30) {
          const pullStrength = pulseEffect * 0.8;
          const dirX = (centerX - p.x) / distToCenter;
          const dirY = (centerY - p.y) / distToCenter;
          pullX = dirX * pullStrength;
          pullY = dirY * pullStrength;
        }

        // Combine forces
        p.vx = p.vx * 0.92 + field.vx * 0.06 + repelX + pullX;
        p.vy = p.vy * 0.92 + field.vy * 0.06 + repelY + pullY;

        // Clamp velocity
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const maxSpeed = 5;
        if (speed > maxSpeed) {
          p.vx = (p.vx / speed) * maxSpeed;
          p.vy = (p.vy / speed) * maxSpeed;
        }

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Recalculate distance after movement
        const newDistToCenter = Math.sqrt((p.x - centerX) ** 2 + (p.y - centerY) ** 2);

        // Velocity alpha
        const velocityAlpha = Math.min(1, speed / 2) * 0.5 + 0.25;

        // Proximity boost for brightness near center
        const proximityBoost = Math.max(0, 1 - newDistToCenter / 200) * 0.3;

        // Fade out when very close to center (larger zone in marker mode for bigger logo)
        const fadeRadius = markerMode ? LOGO_SIZE * 1.2 : 80;
        const proximityFade = newDistToCenter < fadeRadius
          ? newDistToCenter / fadeRadius
          : 1;

        // Final alpha (hard drop at logo mask boundary)
        const alpha = inLogoMask
          ? 0
          : Math.min(1, velocityAlpha + pulseEffect * 0.7 + proximityBoost) * proximityFade;

        // Color shifts towards white/cyan during pulse (skip in marker mode to keep ACeP hues)
        const hue = markerMode
          ? p.baseHue
          : pulseEffect > 0.15
            ? 200 + (210 - 200) * pulseEffect
            : p.baseHue;
        const saturation = markerMode
          ? 100
          : pulseEffect > 0.15
            ? 75 - pulseEffect * 55
            : 70;
        const lightness = markerMode
          ? 50
          : 45 + pulseEffect * 45 + proximityBoost * 25;

        // Draw particle - deform into velocity-aligned capsule at high speed
        const velRatio = speed / maxSpeed;
        const elongation = velRatio * velRatio * p.size * 4;
        const color = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;

        if (elongation < 0.5) {
          // Low velocity - circle
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        } else {
          // High velocity - capsule: thick line with round caps
          // 70% trails behind, 30% extends ahead
          const nx = p.vx / speed;
          const ny = p.vy / speed;
          ctx.beginPath();
          ctx.lineWidth = p.size * 2;
          ctx.lineCap = "round";
          ctx.strokeStyle = color;
          ctx.moveTo(p.x - nx * elongation * 0.7, p.y - ny * elongation * 0.7);
          ctx.lineTo(p.x + nx * elongation * 0.3, p.y + ny * elongation * 0.3);
          ctx.stroke();
        }

        // Respawn if out of bounds or inside logo exclusion zone
        const exclusionRadius = logoRadiusRef.current || LOGO_EXCLUSION_RADIUS;
        if (
          p.x < -50 || p.x > canvas.width + 50 ||
          p.y < -50 || p.y > canvas.height + 50 ||
          newDistToCenter < exclusionRadius ||
          inLogoMask
        ) {
          particles[i] = createParticle(canvas.width, canvas.height);
        }
      }

      // Position the SVG overlay (crisp vector rendering, no canvas rasterization)
      const logoEl = logoOverlayRef.current;
      if (logoEl) {
        const breathScale = 1 + (corePulse - 0.7) * 0.04;
        logoEl.style.left = `${centerX}px`;
        logoEl.style.top = `${centerY}px`;
        logoEl.style.transform = `translate(-50%, -50%) scale(${breathScale})`;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="flow-background"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <img
        ref={logoOverlayRef}
        src="/eywa-logo.svg"
        alt=""
        draggable={false}
        style={{
          position: "fixed",
          width: markerMode ? "200px" : "68px",
          height: "auto",
          zIndex: 1,
          pointerEvents: "none",
          willChange: "transform",
        }}
      />
    </>
  );
}
