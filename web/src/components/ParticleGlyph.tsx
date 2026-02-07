import { useRef, useEffect, useMemo, memo } from "react";
import type { Memory } from "../lib/supabase";
import { extractFeatures, generateStrokes } from "../lib/glyphEncoder";
import type { GlyphStroke } from "../lib/glyphEncoder";

const SIZE = 64;

interface Props {
  memory: Memory;
  agentHSL: { h: number; s: number; l: number };
  live: boolean;
  title: string;
  displaySize?: number;
}

function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: GlyphStroke[],
  time: number,
  live: boolean,
  formation: number,
) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];

    let x1 = s.x1, y1 = s.y1, x2 = s.x2, y2 = s.y2;
    let cx = s.cx, cy = s.cy;

    // Live animation: gentle drift along stroke direction
    if (live) {
      const phase = (i * 0.73) % (Math.PI * 2);
      const drift = Math.sin(time * 1.2 + phase) * 1.5;
      const perpX = -(y2 - y1);
      const perpY = (x2 - x1);
      const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
      const nx = perpX / len;
      const ny = perpY / len;
      x1 += nx * drift; y1 += ny * drift;
      x2 += nx * drift; y2 += ny * drift;
      if (cx !== undefined) cx += nx * drift;
      if (cy !== undefined) cy += ny * drift;
    }

    // Formation: strokes grow from their midpoint
    if (formation < 1) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const f = formation;
      x1 = mx + (x1 - mx) * f;
      y1 = my + (y1 - my) * f;
      x2 = mx + (x2 - mx) * f;
      y2 = my + (y2 - my) * f;
    }

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    if (cx !== undefined && cy !== undefined) {
      ctx.quadraticCurveTo(cx, cy, x2, y2);
    } else {
      ctx.lineTo(x2, y2);
    }
    ctx.lineWidth = s.width;
    ctx.strokeStyle = `rgba(${s.r},${s.g},${s.b},${s.opacity})`;
    ctx.stroke();
  }
}

export const ParticleGlyph = memo(function ParticleGlyph({
  memory,
  agentHSL,
  live,
  title,
  displaySize = 32,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  const strokes = useMemo(() => {
    const features = extractFeatures(memory);
    return generateStrokes(features, agentHSL);
  }, [memory.id, agentHSL.h, agentHSL.s, agentHSL.l]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const startTime = performance.now();

    if (!live) {
      const formationFrames = () => {
        const elapsed = performance.now() - startTime;
        const formation = Math.min(1, elapsed / 350);
        renderStrokes(ctx, strokes, 0, false, formation);
        if (formation < 1) {
          rafRef.current = requestAnimationFrame(formationFrames);
        }
      };
      rafRef.current = requestAnimationFrame(formationFrames);
      return () => cancelAnimationFrame(rafRef.current);
    }

    const tick = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      const formation = Math.min(1, elapsed / 350);
      renderStrokes(ctx, strokes, now / 1000, true, formation);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [strokes, live]);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      title={title}
      style={{ width: displaySize, height: displaySize }}
    />
  );
});
