import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  brightness: number;
  size: number;
}

// Blue-biased palette: mostly blues/cyans, occasional pink/purple accent
function randomHue(): number {
  const r = Math.random();
  if (r < 0.6) {
    // Blues: 200-240
    return 200 + Math.random() * 40;
  } else if (r < 0.8) {
    // Cyans: 170-200
    return 170 + Math.random() * 30;
  } else if (r < 0.92) {
    // Purple accent: 260-290
    return 260 + Math.random() * 30;
  } else {
    // Pink accent: 320-340
    return 320 + Math.random() * 20;
  }
}

export function FlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);

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

    const createParticle = (w: number, h: number): Particle => {
      // Spawn from edges
      const edge = Math.floor(Math.random() * 4);
      let x: number, y: number;

      switch (edge) {
        case 0: x = Math.random() * w; y = 0; break;
        case 1: x = w; y = Math.random() * h; break;
        case 2: x = Math.random() * w; y = h; break;
        default: x = 0; y = Math.random() * h; break;
      }

      return {
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 250 + Math.random() * 350,
        hue: randomHue(),
        brightness: 0.7 + Math.random() * 0.3,
        size: 1.2 + Math.random() * 1.2,
      };
    };

    // Initialize particles
    const initParticles = () => {
      const particles: Particle[] = [];
      const count = Math.floor((canvas.width * canvas.height) / 12000);

      for (let i = 0; i < count; i++) {
        particles.push(createParticle(canvas.width, canvas.height));
      }
      return particles;
    };

    // Flow field - particles converge toward center with curl
    const flowField = (x: number, y: number, w: number, h: number) => {
      const centerX = w * 0.5;
      const centerY = h * 0.38;

      const dx = centerX - x;
      const dy = centerY - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const angle = Math.atan2(dy, dx);
      const curl = Math.sin(x * 0.004 + y * 0.003) * 0.6;

      // Slow down near center, speed up far away
      const speed = Math.min(2.5, 0.3 + dist * 0.0015);

      return {
        vx: Math.cos(angle + curl) * speed,
        vy: Math.sin(angle + curl) * speed,
      };
    };

    particlesRef.current = initParticles();

    const animate = () => {
      if (!ctx || !canvas) return;

      // Fade effect - slightly faster for brighter trails
      ctx.fillStyle = "rgba(8, 10, 18, 0.04)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      const centerX = canvas.width * 0.5;
      const centerY = canvas.height * 0.38;

      // Particle interaction: simple spatial hash for nearby particles
      const cellSize = 60;
      const grid = new Map<string, number[]>();

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const cellX = Math.floor(p.x / cellSize);
        const cellY = Math.floor(p.y / cellSize);
        const key = `${cellX},${cellY}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(i);
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Get flow direction
        const flow = flowField(p.x, p.y, canvas.width, canvas.height);

        // Particle-particle interaction
        let interactVx = 0;
        let interactVy = 0;
        const cellX = Math.floor(p.x / cellSize);
        const cellY = Math.floor(p.y / cellSize);

        // Check neighboring cells
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const key = `${cellX + dx},${cellY + dy}`;
            const neighbors = grid.get(key);
            if (!neighbors) continue;

            for (const j of neighbors) {
              if (i === j) continue;
              const other = particles[j];
              const ddx = other.x - p.x;
              const ddy = other.y - p.y;
              const distSq = ddx * ddx + ddy * ddy;

              if (distSq < 2500 && distSq > 1) {
                const dist = Math.sqrt(distSq);
                // Soft repulsion at close range, weak attraction at medium range
                const force = dist < 25 ? -0.02 / dist : 0.005 / dist;
                interactVx += (ddx / dist) * force;
                interactVy += (ddy / dist) * force;
              }
            }
          }
        }

        // Combine forces
        p.vx = p.vx * 0.92 + flow.vx * 0.06 + interactVx;
        p.vy = p.vy * 0.92 + flow.vy * 0.06 + interactVy;

        // Clamp velocity
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 3) {
          p.vx = (p.vx / speed) * 3;
          p.vy = (p.vy / speed) * 3;
        }

        // Store previous position for line
        const prevX = p.x;
        const prevY = p.y;

        // Update position
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        // Distance from center affects brightness
        const distToCenter = Math.sqrt(
          (p.x - centerX) ** 2 + (p.y - centerY) ** 2
        );
        const centerBoost = Math.max(0, 1 - distToCenter / 400) * 0.3;

        // Calculate alpha
        const lifeAlpha = Math.min(1, p.life / 25) * Math.max(0, 1 - p.life / p.maxLife);
        const alpha = (lifeAlpha * p.brightness + centerBoost) * 0.9;

        // Draw line segment with glow
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `hsla(${p.hue}, 85%, ${55 + centerBoost * 20}%, ${alpha})`;
        ctx.lineWidth = p.size;
        ctx.lineCap = "round";
        ctx.stroke();

        // Add point glow for brighter particles near center
        if (distToCenter < 250 && alpha > 0.4) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${alpha * 0.3})`;
          ctx.fill();
        }

        // Reset if dead or out of bounds
        if (
          p.life > p.maxLife ||
          p.x < -50 || p.x > canvas.width + 50 ||
          p.y < -50 || p.y > canvas.height + 50
        ) {
          particles[i] = createParticle(canvas.width, canvas.height);
        }
      }

      // Radial light source at convergence point
      const glowRadius = 280;

      // Outer soft glow
      const outerGlow = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, glowRadius * 1.5
      );
      outerGlow.addColorStop(0, "rgba(140, 180, 255, 0.08)");
      outerGlow.addColorStop(0.3, "rgba(120, 160, 255, 0.04)");
      outerGlow.addColorStop(0.7, "rgba(100, 140, 255, 0.01)");
      outerGlow.addColorStop(1, "rgba(80, 120, 255, 0)");
      ctx.fillStyle = outerGlow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Inner bright core
      const innerGlow = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, glowRadius * 0.6
      );
      innerGlow.addColorStop(0, "rgba(200, 220, 255, 0.12)");
      innerGlow.addColorStop(0.4, "rgba(160, 190, 255, 0.05)");
      innerGlow.addColorStop(1, "rgba(140, 170, 255, 0)");
      ctx.fillStyle = innerGlow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationRef.current = requestAnimationFrame(animate);
    };

    // Initial clear
    ctx.fillStyle = "rgb(8, 10, 18)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
