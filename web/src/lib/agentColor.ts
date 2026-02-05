export function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Pink spectrum: hue 310-350, varying saturation and lightness
  const hue = 310 + (Math.abs(hash) % 40);
  const sat = 45 + (Math.abs(hash >> 8) % 30);
  const lit = 35 + (Math.abs(hash >> 16) % 25);
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}
