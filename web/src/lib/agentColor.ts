function agentHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

// Returns a hex color (#rrggbb) in the pink-magenta spectrum for a given agent name.
// Hex is needed because the pixel-sprite SVG renderer parses the color string directly.
export function agentColor(name: string): string {
  const hash = agentHash(name);
  const hue = (300 + (Math.abs(hash) % 60)) / 360;
  const sat = (60 + (Math.abs(hash >> 8) % 30)) / 100;
  const lit = (55 + (Math.abs(hash >> 16) % 20)) / 100;
  return hslToHex(hue, sat, lit);
}

export function agentColorHSL(name: string): { h: number; s: number; l: number } {
  const hash = agentHash(name);
  return {
    h: 300 + (Math.abs(hash) % 60),
    s: 60 + (Math.abs(hash >> 8) % 30),
    l: 55 + (Math.abs(hash >> 16) % 20),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, c)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
