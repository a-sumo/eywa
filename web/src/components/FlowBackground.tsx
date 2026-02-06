import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

const COLORS = [
  "rgba(140, 169, 255, 0.6)",  // blue
  "rgba(242, 165, 200, 0.5)",  // pink
  "rgba(129, 230, 217, 0.5)",  // teal
];

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

    // Initialize particles
    const initParticles = () => {
      const particles: Particle[] = [];
      const count = Math.floor((canvas.width * canvas.height) / 15000);

      for (let i = 0; i < count; i++) {
        particles.push(createParticle(canvas.width, canvas.height));
      }
      return particles;
    };

    const createParticle = (w: number, h: number): Particle => {
      // Spawn from edges, biased toward corners
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
        maxLife: 200 + Math.random() * 300,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    };

    // Flow field function - particles converge toward center
    const flowField = (x: number, y: number, w: number, h: number) => {
      const centerX = w * 0.5;
      const centerY = h * 0.4;

      const dx = centerX - x;
      const dy = centerY - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Normalize and add some curl
      const angle = Math.atan2(dy, dx);
      const curl = Math.sin(x * 0.003 + y * 0.002) * 0.5;

      const speed = Math.min(2, 0.5 + dist * 0.001);

      return {
        vx: Math.cos(angle + curl) * speed,
        vy: Math.sin(angle + curl) * speed,
      };
    };

    particlesRef.current = initParticles();

    const animate = () => {
      if (!ctx || !canvas) return;

      // Fade effect
      ctx.fillStyle = "rgba(10, 10, 15, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Get flow direction
        const flow = flowField(p.x, p.y, canvas.width, canvas.height);
        p.vx = p.vx * 0.95 + flow.vx * 0.05;
        p.vy = p.vy * 0.95 + flow.vy * 0.05;

        // Store previous position for line
        const prevX = p.x;
        const prevY = p.y;

        // Update position
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        // Draw line segment
        const alpha = Math.min(1, p.life / 30) * Math.max(0, 1 - p.life / p.maxLife);
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = p.color.replace(/[\d.]+\)$/, `${alpha * 0.8})`);
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Reset if dead or out of bounds
        if (
          p.life > p.maxLife ||
          p.x < -50 || p.x > canvas.width + 50 ||
          p.y < -50 || p.y > canvas.height + 50
        ) {
          particles[i] = createParticle(canvas.width, canvas.height);
        }
      }

      // Draw subtle glow at convergence point
      const gradient = ctx.createRadialGradient(
        canvas.width * 0.5, canvas.height * 0.4, 0,
        canvas.width * 0.5, canvas.height * 0.4, 200
      );
      gradient.addColorStop(0, "rgba(140, 169, 255, 0.03)");
      gradient.addColorStop(1, "rgba(140, 169, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationRef.current = requestAnimationFrame(animate);
    };

    // Initial clear
    ctx.fillStyle = "rgb(10, 10, 15)";
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
