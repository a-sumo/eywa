import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseHue: number;
  size: number;
  humanZone: number; // Which human zone this particle belongs to (-1 = none)
}

interface HumanNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number; // Influence radius
  hue: number;
  phase: number; // For orbital motion
}

export function FlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const humansRef = useRef<HumanNode[]>([]);
  const animationRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const pulseTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Low-res buffer for SDF blob rendering
    const BLOB_SCALE = 8; // Render blobs at 1/8 resolution
    let blobCanvas: HTMLCanvasElement;
    let blobCtx: CanvasRenderingContext2D;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Recreate blob buffer
      blobCanvas = document.createElement("canvas");
      blobCanvas.width = Math.ceil(canvas.width / BLOB_SCALE);
      blobCanvas.height = Math.ceil(canvas.height / BLOB_SCALE);
      blobCtx = blobCanvas.getContext("2d")!;
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
        humanZone: -1,
      };
    };

    // Initialize particles
    const initParticles = () => {
      const particles: Particle[] = [];
      const count = Math.floor((canvas.width * canvas.height) / 2500);
      for (let i = 0; i < count; i++) {
        particles.push(createParticle(canvas.width, canvas.height));
      }
      return particles;
    };

    // Initialize human control nodes
    const initHumans = (w: number, h: number): HumanNode[] => {
      const centerX = w * 0.5;
      const centerY = h * 0.38;
      const orbitRadius = Math.min(w, h) * 0.25;

      return [
        {
          x: centerX - orbitRadius * 0.8,
          y: centerY + orbitRadius * 0.3,
          vx: 0, vy: 0,
          radius: 120,
          hue: 200, // Blue
          phase: 0,
        },
        {
          x: centerX + orbitRadius * 0.9,
          y: centerY + orbitRadius * 0.1,
          vx: 0, vy: 0,
          radius: 100,
          hue: 280, // Purple
          phase: Math.PI * 0.7,
        },
        {
          x: centerX + orbitRadius * 0.2,
          y: centerY + orbitRadius * 0.8,
          vx: 0, vy: 0,
          radius: 90,
          hue: 180, // Cyan
          phase: Math.PI * 1.4,
        },
      ];
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
      const centerY = h * 0.38;

      const dx = centerX - x;
      const dy = centerY - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      const curlStrength = Math.min(1, dist / 300) * 0.8;
      const curl = noise(x, y, t) * curlStrength;
      const convergence = Math.min(1.8, 0.3 + dist * 0.003);
      const finalAngle = angle + curl;

      return {
        vx: Math.cos(finalAngle) * convergence,
        vy: Math.sin(finalAngle) * convergence,
      };
    };

    // Smooth minimum for SDF union (polynomial smooth min)
    const smin = (a: number, b: number, k: number): number => {
      const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
      return b * (1 - h) + a * h - k * h * (1 - h);
    };

    // Compute SDF for the blob field at a point
    const computeBlobSDF = (
      px: number,
      py: number,
      particles: Particle[],
      humans: HumanNode[],
      centerX: number,
      centerY: number,
    ): { dist: number; hue: number } => {
      // Start with distance to Eywa core
      const coreRadius = 60;
      let minDist = Math.sqrt((px - centerX) ** 2 + (py - centerY) ** 2) - coreRadius;
      let dominantHue = 210; // Core hue

      const smoothK = 80; // Smoothness of blob unions

      // For each human zone, compute a blob
      for (let h = 0; h < humans.length; h++) {
        const human = humans[h];

        // Collect particles in this human's zone
        let blobDist = Infinity;

        // Metaball approach: sum contributions from particles
        let metaSum = 0;
        const metaThreshold = 0.015;
        const metaRadius = 50;

        for (const p of particles) {
          if (p.humanZone !== h) continue;

          const dx = px - p.x;
          const dy = py - p.y;
          const distSq = dx * dx + dy * dy;

          // Metaball contribution: 1/r^2 falloff
          if (distSq < metaRadius * metaRadius * 16) {
            metaSum += (metaRadius * metaRadius) / (distSq + 100);
          }
        }

        // Convert metaball sum to distance
        if (metaSum > metaThreshold) {
          // Inside blob
          blobDist = -metaSum * 10;
        } else if (metaSum > 0.001) {
          // Near edge
          blobDist = (metaThreshold - metaSum) * 200;
        }

        // Also include the human node itself as a blob center
        const humanDist = Math.sqrt((px - human.x) ** 2 + (py - human.y) ** 2) - 30;
        blobDist = Math.min(blobDist, humanDist);

        // Smooth union with existing field
        if (blobDist < 500) {
          const oldDist = minDist;
          minDist = smin(minDist, blobDist, smoothK);

          // Blend hue based on which is closer
          if (blobDist < oldDist) {
            const blend = 1 - Math.min(1, Math.max(0, (blobDist + 20) / 40));
            dominantHue = dominantHue * (1 - blend) + human.hue * blend;
          }
        }
      }

      return { dist: minDist, hue: dominantHue };
    };

    particlesRef.current = initParticles();
    humansRef.current = initHumans(canvas.width, canvas.height);

    const CELL_SIZE = 40;
    const REPULSION_DIST = 35;
    const REPULSION_STRENGTH = 0.15;
    const PULSE_INTERVAL = 2.8;
    const PULSE_SPEED = 450;
    const PULSE_WIDTH = 200;

    const animate = () => {
      if (!ctx || !canvas || !blobCtx) return;

      const dt = 0.016;
      timeRef.current += dt;
      pulseTimeRef.current += dt;

      if (pulseTimeRef.current > PULSE_INTERVAL) {
        pulseTimeRef.current = 0;
      }

      const particles = particlesRef.current;
      const humans = humansRef.current;
      const centerX = canvas.width * 0.5;
      const centerY = canvas.height * 0.38;
      const pulseRadius = pulseTimeRef.current * PULSE_SPEED;

      // Update human nodes - gentle orbital drift
      for (let h = 0; h < humans.length; h++) {
        const human = humans[h];
        human.phase += dt * 0.15;

        // Orbit around center with some wobble
        const orbitRadius = Math.min(canvas.width, canvas.height) * 0.22;
        const baseAngle = (h / humans.length) * Math.PI * 2 + human.phase;
        const wobble = Math.sin(timeRef.current * 0.5 + h) * 30;

        const targetX = centerX + Math.cos(baseAngle) * (orbitRadius + wobble);
        const targetY = centerY + Math.sin(baseAngle) * (orbitRadius * 0.6 + wobble * 0.5) + orbitRadius * 0.4;

        // Smooth follow
        human.x += (targetX - human.x) * 0.02;
        human.y += (targetY - human.y) * 0.02;
      }

      // Assign particles to human zones based on proximity
      for (const p of particles) {
        let closestHuman = -1;
        let closestDist = Infinity;

        for (let h = 0; h < humans.length; h++) {
          const human = humans[h];
          const dx = p.x - human.x;
          const dy = p.y - human.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < human.radius && dist < closestDist) {
            closestDist = dist;
            closestHuman = h;
          }
        }

        // Smooth transition - don't immediately switch zones
        if (closestHuman !== -1 && p.humanZone === -1) {
          p.humanZone = closestHuman;
        } else if (closestHuman === -1 && p.humanZone !== -1) {
          // Leave zone when far enough
          const human = humans[p.humanZone];
          const dx = p.x - human.x;
          const dy = p.y - human.y;
          if (Math.sqrt(dx * dx + dy * dy) > human.radius * 1.3) {
            p.humanZone = -1;
          }
        }
      }

      // Clear main canvas
      ctx.fillStyle = "rgb(8, 10, 18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render blob field to low-res buffer
      const blobW = blobCanvas.width;
      const blobH = blobCanvas.height;
      const imageData = blobCtx.createImageData(blobW, blobH);
      const data = imageData.data;

      for (let by = 0; by < blobH; by++) {
        for (let bx = 0; bx < blobW; bx++) {
          const px = bx * BLOB_SCALE + BLOB_SCALE / 2;
          const py = by * BLOB_SCALE + BLOB_SCALE / 2;

          const { dist, hue } = computeBlobSDF(px, py, particles, humans, centerX, centerY);

          const idx = (by * blobW + bx) * 4;

          // Edge glow effect
          if (dist < 30 && dist > -50) {
            // Near boundary - create glow
            const edgeFactor = 1 - Math.abs(dist) / 30;
            const alpha = edgeFactor * 0.25;

            // HSL to RGB (simplified)
            const h = hue / 60;
            const s = 0.6;
            const l = 0.5 + edgeFactor * 0.2;

            const c = (1 - Math.abs(2 * l - 1)) * s;
            const x = c * (1 - Math.abs(h % 2 - 1));
            const m = l - c / 2;

            let r = 0, g = 0, b = 0;
            if (h < 1) { r = c; g = x; }
            else if (h < 2) { r = x; g = c; }
            else if (h < 3) { g = c; b = x; }
            else if (h < 4) { g = x; b = c; }
            else if (h < 5) { r = x; b = c; }
            else { r = c; b = x; }

            data[idx] = (r + m) * 255;
            data[idx + 1] = (g + m) * 255;
            data[idx + 2] = (b + m) * 255;
            data[idx + 3] = alpha * 255;
          } else if (dist < -10) {
            // Inside blob - subtle fill
            const fillAlpha = Math.min(0.08, Math.abs(dist) / 500);
            data[idx] = 100;
            data[idx + 1] = 150;
            data[idx + 2] = 255;
            data[idx + 3] = fillAlpha * 255;
          }
        }
      }

      blobCtx.putImageData(imageData, 0, 0);

      // Draw blobs to main canvas with blur
      ctx.save();
      ctx.filter = "blur(4px)";
      ctx.drawImage(blobCanvas, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Draw again without blur for crisp edges
      ctx.globalAlpha = 0.6;
      ctx.drawImage(blobCanvas, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;

      // Build spatial hash grid for particle repulsion
      const grid = new Map<string, number[]>();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const cellX = Math.floor(p.x / CELL_SIZE);
        const cellY = Math.floor(p.y / CELL_SIZE);
        const key = `${cellX},${cellY}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(i);
      }

      // Update and draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Flow field force
        const field = vectorField(p.x, p.y, canvas.width, canvas.height, timeRef.current);

        // Human zone attraction
        let humanPullX = 0;
        let humanPullY = 0;
        if (p.humanZone !== -1) {
          const human = humans[p.humanZone];
          const dx = human.x - p.x;
          const dy = human.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 20) {
            // Gentle pull toward human node
            const pullStrength = 0.3;
            humanPullX = (dx / dist) * pullStrength;
            humanPullY = (dy / dist) * pullStrength;
          }
        }

        // Repulsion from neighbors
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

        const distToCenter = Math.sqrt((p.x - centerX) ** 2 + (p.y - centerY) ** 2);
        const distFromPulse = Math.abs(distToCenter - pulseRadius);
        const pulseEffect = distFromPulse < PULSE_WIDTH
          ? Math.pow(1 - distFromPulse / PULSE_WIDTH, 1.5)
          : 0;

        // Pulse pull toward center
        let pullX = 0;
        let pullY = 0;
        if (pulseEffect > 0.1 && distToCenter > 30) {
          const pullStrength = pulseEffect * 0.8;
          pullX = ((centerX - p.x) / distToCenter) * pullStrength;
          pullY = ((centerY - p.y) / distToCenter) * pullStrength;
        }

        // Combine forces - human zone pull competes with center pull
        const humanFactor = p.humanZone !== -1 ? 0.7 : 1;
        p.vx = p.vx * 0.92 + field.vx * 0.06 * humanFactor + repelX + pullX * humanFactor + humanPullX;
        p.vy = p.vy * 0.92 + field.vy * 0.06 * humanFactor + repelY + pullY * humanFactor + humanPullY;

        // Clamp velocity
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const maxSpeed = 5;
        if (speed > maxSpeed) {
          p.vx = (p.vx / speed) * maxSpeed;
          p.vy = (p.vy / speed) * maxSpeed;
        }

        p.x += p.vx;
        p.y += p.vy;

        const newDistToCenter = Math.sqrt((p.x - centerX) ** 2 + (p.y - centerY) ** 2);
        const velocityAlpha = Math.min(1, speed / 2) * 0.5 + 0.25;
        const proximityBoost = Math.max(0, 1 - newDistToCenter / 200) * 0.3;
        const proximityFade = newDistToCenter < 80 ? newDistToCenter / 80 : 1;
        const alpha = Math.min(1, velocityAlpha + pulseEffect * 0.7 + proximityBoost) * proximityFade;

        // Color - use human zone hue if assigned
        let hue = p.baseHue;
        if (p.humanZone !== -1) {
          hue = humans[p.humanZone].hue + (p.baseHue - 200) * 0.2;
        }
        if (pulseEffect > 0.15) {
          hue = 200 + (210 - 200) * pulseEffect;
        }

        const saturation = pulseEffect > 0.15 ? 75 - pulseEffect * 55 : 70;
        const lightness = 45 + pulseEffect * 45 + proximityBoost * 25;

        // Draw particle with subtle glow if in human zone
        if (p.humanZone !== -1) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha * 0.15})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
        ctx.fill();

        // Respawn if out of bounds or at center
        if (
          p.x < -50 || p.x > canvas.width + 50 ||
          p.y < -50 || p.y > canvas.height + 50 ||
          newDistToCenter < 15
        ) {
          particles[i] = createParticle(canvas.width, canvas.height);
        }
      }

      // Draw human node indicators (subtle)
      for (const human of humans) {
        // Outer influence ring
        ctx.beginPath();
        ctx.arc(human.x, human.y, human.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${human.hue}, 60%, 60%, 0.08)`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner glow
        const humanGlow = ctx.createRadialGradient(
          human.x, human.y, 0,
          human.x, human.y, 40
        );
        humanGlow.addColorStop(0, `hsla(${human.hue}, 70%, 70%, 0.15)`);
        humanGlow.addColorStop(0.5, `hsla(${human.hue}, 60%, 60%, 0.05)`);
        humanGlow.addColorStop(1, `hsla(${human.hue}, 50%, 50%, 0)`);
        ctx.fillStyle = humanGlow;
        ctx.fill();
      }

      // Eywa core glow
      const coreGlow = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, 80
      );
      coreGlow.addColorStop(0, "rgba(200, 220, 255, 0.15)");
      coreGlow.addColorStop(0.4, "rgba(150, 180, 255, 0.06)");
      coreGlow.addColorStop(1, "rgba(100, 140, 255, 0)");
      ctx.fillStyle = coreGlow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Pulsing inner core
      const corePulse = Math.sin(pulseTimeRef.current * Math.PI / PULSE_INTERVAL * 2) * 0.3 + 0.7;
      const innerGlow = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, 30
      );
      innerGlow.addColorStop(0, `rgba(255, 255, 255, ${0.35 * corePulse})`);
      innerGlow.addColorStop(0.4, `rgba(220, 235, 255, ${0.15 * corePulse})`);
      innerGlow.addColorStop(1, "rgba(150, 190, 255, 0)");
      ctx.fillStyle = innerGlow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

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
