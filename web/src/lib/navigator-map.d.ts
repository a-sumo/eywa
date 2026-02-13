// Type declarations for navigator-map.js (vendored from guild-navigator)

export interface NavigatorMapData {
  meta: {
    itemCount: number;
    goalCount: number;
    goalIds: string[];
    agents: string[];
    curvature?: Array<{
      agent: string;
      meanCurvature: number;
      meanVelocity?: number;
      duration?: number;
    }>;
    humanBaseline?: Array<{
      agent: string;
      predictedHumanMinutes: number;
      speedup?: number;
    }>;
    regions?: Array<{
      id: number;
      label: string;
      nodeCount: number;
      bounds: { minX: number; minY: number; maxX: number; maxY: number };
    }>;
    warpLanes?: Array<{
      fromId: string;
      toId: string;
      strength: number;
      type: string;
      bridge?: string;
    }>;
  };
  nodes: Array<{
    id: string;
    label: string;
    type: "source" | "goal" | "action" | "state";
    x: number;
    y: number;
    agent?: string;
    ts?: number;
    meta?: Record<string, unknown>;
    polar?: Record<string, { r: number; theta: number }>;
    axes?: Record<string, { x: number; y: number; polar?: Record<string, { r: number; theta: number }> }>;
    regionId?: number;
  }>;
  trajectory: Array<{
    from: string;
    to: string;
    agent: string;
    curvature?: number;
    dt?: number;
  }>;
  alignments: Array<{
    actionId: string;
    goalId: string;
    agent: string;
    alignment: number;
    relevance?: number;
    radialDelta?: number;
    angularDelta?: number;
  }>;
}

export interface NavigatorMapNode {
  id: string;
  label: string;
  type: "source" | "goal" | "action" | "state";
  x: number;
  y: number;
  agent?: string;
  polar?: Record<string, { r: number; theta: number }>;
  meta?: Record<string, unknown>;
}

export interface NavigatorMapOpts {
  theme?: "light" | "dark";
  devMode?: boolean;
  nodeAlphaFn?: (nodeId: string) => number;
}

export class NavigatorMap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  dpr: number;
  cx: number;
  cy: number;
  scale: number;
  zoom: number;
  panX: number;
  panY: number;
  data: NavigatorMapData | null;
  goalId: string | null;
  agentColors: Record<string, number[]>;
  goalSx: number;
  goalSy: number;
  dimmedAgents: Set<string>;
  devMode: boolean;
  gridMode: boolean;
  nodeAlphaFn: (nodeId: string) => number;
  themeName: string;
  activeLayer: string;
  availableLayers: string[] | null;
  hoveredWarpLane: unknown | null;

  constructor(canvas: HTMLCanvasElement, opts?: NavigatorMapOpts);

  setTheme(name: "light" | "dark"): void;
  setData(mapData: NavigatorMapData): void;
  setZoom(z: number): void;
  setPan(x: number, y: number): void;
  setGridMode(on: boolean): void;
  resetView(): void;
  resize(): void;
  destroy(): void;

  hitTest(screenX: number, screenY: number): NavigatorMapNode | null;
  hitTestLegend(screenX: number, screenY: number): string | null;
  hitTestLayerPanel(screenX: number, screenY: number): string | null;
  hitTestWarpLane(screenX: number, screenY: number): unknown | null;
  hitTestWarpLanePanel?(screenX: number, screenY: number): unknown | null;
  toggleAgent(agent: string): void;
  switchLayer(layerName: string): Record<string, { x: number; y: number }> | null;
  toScreen(node: { x: number; y: number }): { sx: number; sy: number };
  recalcGoalScreen(): void;

  draw(hoveredNode?: NavigatorMapNode | null): boolean;
}
