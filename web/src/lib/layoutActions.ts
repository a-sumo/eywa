export type LayoutAction =
  | { type: "focus-group"; groupId: string; zPullCm?: number }
  | { type: "fan-out"; groupIds: string[]; axis?: "y" | "x"; offsetCm?: number }
  | { type: "shift-zone"; zoneId: string; dx?: number; dy?: number; dz?: number }
  | { type: "reset-layout" };

export type GroupLayout = {
  id: string;
  x: number;
  y: number;
  z?: number;
  visible?: boolean;
  zone?: string;
};

export function applyLayoutActions(groups: GroupLayout[], actions: LayoutAction[]): GroupLayout[] {
  if (!actions.length) return groups;
  let next = groups.map(g => ({ ...g }));

  for (const action of actions) {
    switch (action.type) {
      case "focus-group": {
        const pull = action.zPullCm ?? 1.5;
        next = next.map(g => g.id === action.groupId ? { ...g, z: (g.z ?? 0) + pull } : g);
        break;
      }
      case "fan-out": {
        const axis = action.axis ?? "y";
        const offset = action.offsetCm ?? 1.0;
        const ids = action.groupIds;
        next = next.map((g, i) => {
          if (!ids.includes(g.id)) return g;
          const idx = ids.indexOf(g.id);
          const delta = (idx - (ids.length - 1) / 2) * offset;
          return axis === "y"
            ? { ...g, y: g.y + delta }
            : { ...g, x: g.x + delta };
        });
        break;
      }
      case "shift-zone": {
        next = next.map(g => {
          if (g.zone !== action.zoneId) return g;
          return {
            ...g,
            x: g.x + (action.dx ?? 0),
            y: g.y + (action.dy ?? 0),
            z: (g.z ?? 0) + (action.dz ?? 0),
          };
        });
        break;
      }
      case "reset-layout": {
        return groups.map(g => ({ ...g }));
      }
    }
  }

  return next;
}
