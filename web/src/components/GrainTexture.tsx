import { useEffect, useRef } from "react";

const AURORA_RGB: [number, number, number][] = [
  [21, 209, 255],  // cyan
  [37, 67, 255],   // blue
  [100, 23, 236],  // purple
  [231, 43, 118],  // pink
  [74, 222, 128],  // green
];

// E-ink safe colors (map to actual 7-color pigments)
export const EINK_RGB: [number, number, number][] = [
  [60, 120, 255],  // blue
  [255, 50, 80],   // red
  [50, 200, 100],  // green
  [255, 160, 50],  // orange
  [255, 255, 255], // white
];

interface GrainProps {
  width: number;
  height: number;
  baseColor?: [number, number, number];
  palette?: [number, number, number][];
  density?: number;
  seed?: number;
  noiseIntensity?: number;
  brightnessRange?: [number, number];
  className?: string;
}

export function GrainTexture({
  width,
  height,
  baseColor = [8, 9, 15],
  palette = AURORA_RGB,
  density = 0.004,
  seed = 42,
  noiseIntensity = 14,
  brightnessRange = [0.15, 0.5],
  className,
}: GrainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fill dark base
    ctx.fillStyle = `rgb(${baseColor[0]},${baseColor[1]},${baseColor[2]})`;
    ctx.fillRect(0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Lehmer PRNG (deterministic)
    let s = seed;
    const rand = () => {
      s = (s * 48271 + 1) % 2147483647;
      return s / 2147483647;
    };

    for (let i = 0; i < data.length; i += 4) {
      // Film grain - subtle brightness noise
      const noise = (rand() - 0.5) * noiseIntensity;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));

      // Colored sprinkle
      if (rand() < density) {
        const color = palette[Math.floor(rand() * palette.length)];
        const brightness = brightnessRange[0] + rand() * (brightnessRange[1] - brightnessRange[0]);
        data[i] = Math.floor(color[0] * brightness);
        data[i + 1] = Math.floor(color[1] * brightness);
        data[i + 2] = Math.floor(color[2] * brightness);
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [width, height, baseColor, palette, density, seed, noiseIntensity]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
