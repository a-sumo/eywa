import { useState, useEffect, useMemo, useRef } from "react";
import "./EywaMascot.css";
import {
  type Mood,
  type Px,
  GW, GH,
  MOODS,
  computeFrame,
} from "./mascotCore";

interface EywaMascotProps {
  mood: Mood;
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
}

const CELL = 6;

/* ── Floating Zs ── */

function FloatingZs({ x, y, cs }: { x: number; y: number; cs: number }) {
  const [zs, setZs] = useState<{ id: number; dx: number }[]>([]);
  useEffect(() => {
    let c = 0;
    const iv = setInterval(() => {
      c++;
      setZs((prev) => [...prev, { id: c, dx: Math.random() * 3 }].slice(-3));
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  return (
    <g>
      {zs.map((z, i) => (
        <text
          key={z.id}
          className="eywa-z"
          x={(x + z.dx + i * 2) * cs}
          y={(y - i * 2) * cs}
          fontSize={cs * (0.8 + i * 0.3)}
          fill="#15D1FF"
          opacity={0.7}
          fontFamily="var(--font-mono)"
        >
          z
        </text>
      ))}
    </g>
  );
}

/* ── Main component ── */

export default function EywaMascot({
  mood,
  scale = 1,
  className = "",
  style,
}: EywaMascotProps) {
  const [frame, setFrame] = useState(0);
  const [blinking, setBlinking] = useState(false);
  const timeRef = useRef(0);

  useEffect(() => {
    let raf: number;
    let last = 0;
    const dt = 83; // ~12fps
    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      if (now - last < dt) return;
      last = now;
      timeRef.current += dt / 1000;
      setFrame((f) => f + 1);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const mp = MOODS[mood];
    if (mp.blinkMin === 0) return;
    function schedule() {
      const delay = mp.blinkMin + Math.random() * (mp.blinkMax - mp.blinkMin);
      return setTimeout(() => {
        setBlinking(true);
        setTimeout(() => setBlinking(false), mp.blinkDur);
        timer = schedule();
      }, delay);
    }
    let timer = schedule();
    return () => clearTimeout(timer);
  }, [mood]);

  const pixels = useMemo(
    () => computeFrame(timeRef.current, mood, blinking),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frame, mood, blinking],
  );

  const vw = GW * CELL;
  const vh = GH * CELL;

  return (
    <div
      className={`eywa-mascot ${className}`}
      style={{ width: vw * scale, height: vh * scale, ...style }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${vw} ${vh}`}
        shapeRendering="crispEdges"
      >
        {pixels.map((px: Px, i: number) => (
          <rect
            key={i}
            x={px.x * CELL} y={px.y * CELL}
            width={CELL} height={CELL}
            fill={px.color}
          />
        ))}

        {mood === "sleeping" && (
          <FloatingZs x={GW - 4} y={12} cs={CELL} />
        )}
      </svg>
    </div>
  );
}

export type { Mood, EywaMascotProps };
