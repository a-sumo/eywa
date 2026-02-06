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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const randomHue = (): number => {
      const r = Math.random();
      if (r < 0.65) return 200 + Math.random() * 40;
      if (r < 0.85) return 170 + Math.random() * 30;
      if (r < 0.95) return 260 + Math.random() * 30;
      return 320 + Math.random() * 20;
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
        x, y,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        baseHue: randomHue(),
        size: 2 + Math.random() * 1.5,
      };
    };

    const initParticles = () => {
      const particles: Particle[] = [];
      const count = Math.floor((canvas.width * canvas.height) / 2500);
      for (let i = 0; i < count; i++) {
        particles.push(createParticle(canvas.width, canvas.height));
      }
      return particles;
    };

    const noise = (x: number, y: number, t: number): number => {
      return Math.sin(x * 0.006 + t) * Math.cos(y * 0.005 + t * 0.7) +
             Math.sin((x + y) * 0.004 + t * 1.2) * 0.5 +
             Math.cos(x * 0.01 - y * 0.007 + t * 0.4) * 0.3;
    };

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

    particlesRef.current = initParticles();

    const CELL_SIZE = 40;
    const REPULSION_DIST = 35;
    const REPULSION_STRENGTH = 0.15;
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

      const particles = particlesRef.current;
      const centerX = canvas.width * 0.5;
      const centerY = canvas.height * 0.38;
      const pulseRadius = pulseTimeRef.current * PULSE_SPEED;

      // Clear
      ctx.fillStyle = "rgb(8, 10, 18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Build spatial hash for particle repulsion
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

        const field = vectorField(p.x, p.y, canvas.width, canvas.height, timeRef.current);

        // Repulsion
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

        p.vx = p.vx * 0.92 + field.vx * 0.06 + repelX + pullX;
        p.vy = p.vy * 0.92 + field.vy * 0.06 + repelY + pullY;

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

        const hue = pulseEffect > 0.15
          ? 200 + (210 - 200) * pulseEffect
          : p.baseHue;
        const saturation = pulseEffect > 0.15 ? 75 - pulseEffect * 55 : 70;
        const lightness = 45 + pulseEffect * 45 + proximityBoost * 25;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
        ctx.fill();

        if (
          p.x < -50 || p.x > canvas.width + 50 ||
          p.y < -50 || p.y > canvas.height + 50 ||
          newDistToCenter < 15
        ) {
          particles[i] = createParticle(canvas.width, canvas.height);
        }
      }

      // Eywa core glow
      const coreGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 80);
      coreGlow.addColorStop(0, "rgba(200, 220, 255, 0.15)");
      coreGlow.addColorStop(0.4, "rgba(150, 180, 255, 0.06)");
      coreGlow.addColorStop(1, "rgba(100, 140, 255, 0)");
      ctx.fillStyle = coreGlow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Pulsing inner core
      const corePulse = Math.sin(pulseTimeRef.current * Math.PI / PULSE_INTERVAL * 2) * 0.3 + 0.7;
      const innerGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 30);
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
