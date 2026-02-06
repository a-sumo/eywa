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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const pulseTimeRef = useRef<number>(0);
  const logoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoRadiusRef = useRef<number>(0);
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowOffsetRef = useRef<number>(0);
  const logoMaskRef = useRef<{ data: Uint8ClampedArray; width: number; height: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CENTER_Y_RATIO = 0.3;
    const CENTER_Y_OFFSET = -40;

    // Load logo with original colors (no white tint)
    const LOGO_SIZE = 96;
    const LOGO_RENDER_SCALE = 2;
    const LOGO_EXCLUSION_RADIUS = LOGO_SIZE * 0.7;
    const LOGO_GLOW_BLUR = 56;
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

      // Build a blurred glow canvas based on the logo shape (SDF-like glow)
      const tintCanvas = document.createElement("canvas");
      tintCanvas.width = w;
      tintCanvas.height = h;
      const tintCtx = tintCanvas.getContext("2d")!;
      tintCtx.drawImage(offscreen, 0, 0);
      tintCtx.globalCompositeOperation = "source-in";
      tintCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
      tintCtx.fillRect(0, 0, w, h);
      tintCtx.globalCompositeOperation = "source-over";

      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = w + LOGO_GLOW_BLUR * 3;
      glowCanvas.height = h + LOGO_GLOW_BLUR * 3;
      const glowCtx = glowCanvas.getContext("2d")!;
      const glowInset = Math.floor(LOGO_GLOW_BLUR * 1.5);
      glowCtx.filter = `blur(${LOGO_GLOW_BLUR}px)`;
      glowCtx.drawImage(tintCanvas, glowInset, glowInset);
      glowCtx.filter = "none";
      glowCanvasRef.current = glowCanvas;
      glowOffsetRef.current = glowInset;
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Particle colors - blue biased
    const randomHue = (): number => {
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
        size: 2 + Math.random() * 1.5,
      };
    };

    // Initialize with many particles
    const initParticles = () => {
      const particles: Particle[] = [];
      const count = Math.floor((canvas.width * canvas.height) / 2500);

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

      // Gentle convergence
      const convergence = Math.min(1.8, 0.3 + dist * 0.003);

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

      // Logo-shaped glow behind particles (strong + broad, but not covering particles)
      const t = pulseTimeRef.current / PULSE_INTERVAL;
      const peak = 0.18;
      const width = 0.22;
      const pulseShape = Math.exp(-Math.pow((t - peak) / width, 2));
      const corePulse = 0.7 + pulseShape * 0.5;
      const glowCanvas = glowCanvasRef.current;
      if (glowCanvas) {
        const gw = glowCanvas.width;
        const gh = glowCanvas.height;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.95 + corePulse * 0.25;
        ctx.translate(centerX, centerY);
        ctx.scale(1 / LOGO_RENDER_SCALE, 1 / LOGO_RENDER_SCALE);
        ctx.drawImage(glowCanvas, -gw / 2, -gh / 2);
        ctx.restore();
      }

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

        // Fade out when very close to center
        const proximityFade = newDistToCenter < 80
          ? newDistToCenter / 80
          : 1;

        // Final alpha (hard drop at logo mask boundary)
        const alpha = inLogoMask
          ? 0
          : Math.min(1, velocityAlpha + pulseEffect * 0.7 + proximityBoost) * proximityFade;

        // Color shifts towards white/cyan during pulse
        const hue = pulseEffect > 0.15
          ? 200 + (210 - 200) * pulseEffect
          : p.baseHue;
        const saturation = pulseEffect > 0.15
          ? 75 - pulseEffect * 55
          : 70;
        const lightness = 45 + pulseEffect * 45 + proximityBoost * 25;

        // Draw particle - deform into velocity-aligned capsule at high speed
        const t = speed / maxSpeed;
        const elongation = t * t * p.size * 4;
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

      // Pulsing logo at center (crisp edges)
      const logoCanvas = logoCanvasRef.current;
      if (logoCanvas) {
        const lw = logoCanvas.width;
        const lh = logoCanvas.height;
        ctx.save();

        // Subtle breathing scale
        const breathScale = 1 + (corePulse - 0.7) * 0.12;
        ctx.translate(centerX, centerY);
        ctx.scale(breathScale / LOGO_RENDER_SCALE, breathScale / LOGO_RENDER_SCALE);

        // Logo-shaped glow pass (strong cyan, sharp core + broad extent)
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.shadowColor = "rgba(120, 240, 255, 1)";
        ctx.shadowBlur = 95;
        ctx.globalAlpha = 1;
        ctx.drawImage(logoCanvas, -lw / 2, -lh / 2);
        ctx.shadowBlur = 34;
        ctx.shadowColor = "rgba(160, 255, 255, 1)";
        ctx.globalAlpha = 1;
        ctx.drawImage(logoCanvas, -lw / 2, -lh / 2);
        ctx.restore();

        // Main logo layer - crisp on top, no shadow glow
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.globalAlpha = 0.9;
        ctx.drawImage(logoCanvas, -lw / 2, -lh / 2);

        ctx.restore();
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
  );
}
