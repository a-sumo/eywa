/**
 * Tile - a small, independent renderable unit.
 *
 * Each tile owns its own OffscreenCanvas and tracks dirtiness via content hash.
 * Textures are cached as base64 after first encode, skipping re-encoding when
 * content hasn't changed. Position, size, layer, and interaction flags are
 * stored per-tile for the scene graph.
 */

export type TileLayer = 0 | 1 | 2 | 3; // base, hover, drag, overlay

export interface TileDescriptor {
  id: string;
  type: string;
  group?: string; // optional parent group id
  x: number; // position in cm (Spectacles world units)
  y: number;
  z?: number; // explicit z position (overrides layer-based z). Used for background tiles at z=0.
  w: number; // canvas pixel width (determines aspect ratio)
  h: number; // canvas pixel height
  scale: number;
  layer: TileLayer;
  interactive: boolean;
  draggable: boolean;
  visible: boolean;
  data: Record<string, unknown>; // type-specific data for the renderer
}

export type RenderFn = (
  ctx: OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  data: Record<string, unknown>,
) => void;

export class Tile {
  readonly id: string;
  readonly type: string;
  readonly canvas: OffscreenCanvas;
  readonly ctx: OffscreenCanvasRenderingContext2D;

  // Position and layout (in cm, Spectacles world units)
  group: string | undefined = undefined;
  x = 0;
  y = 0;
  z: number | undefined = undefined; // explicit z (overrides layer-based z on Spectacles)
  w: number;
  h: number;
  scale = 1.0;
  layer: TileLayer = 0;
  interactive = false;
  draggable = false;
  visible = true;

  // Dirty tracking
  dirty = true;
  private contentHash = "";
  private cachedBase64: string | null = null;
  private renderFn: RenderFn | null = null;
  private data: Record<string, unknown> = {};

  // Scene graph state
  created = false; // has "create" op been sent?
  positionDirty = false; // needs "move" op

  constructor(id: string, type: string, w: number, h: number) {
    this.id = id;
    this.type = type;
    this.w = w;
    this.h = h;
    this.canvas = new OffscreenCanvas(w, h);
    this.ctx = this.canvas.getContext("2d")!;
  }

  setRenderFn(fn: RenderFn) {
    this.renderFn = fn;
  }

  setData(data: Record<string, unknown>) {
    this.data = data;
  }

  /**
   * Update the content hash. If changed, marks tile dirty and clears cached base64.
   * Returns true if content changed.
   */
  updateHash(hash: string): boolean {
    if (hash === this.contentHash) return false;
    this.contentHash = hash;
    this.dirty = true;
    this.cachedBase64 = null;
    return true;
  }

  /**
   * Run the render function if tile is dirty. Returns true if rendered.
   */
  render(): boolean {
    if (!this.dirty || !this.renderFn) return false;
    this.renderFn(this.ctx, this.w, this.h, this.data);
    this.dirty = false;
    this.cachedBase64 = null; // invalidate encoded texture
    return true;
  }

  /**
   * Get base64 JPEG encoding. Cached until next render.
   */
  getBase64(quality = 0.6): string {
    if (this.cachedBase64) return this.cachedBase64;

    // Use a shared export canvas to avoid creating new ones
    const exportCanvas = Tile.getExportCanvas(this.w, this.h);
    const exportCtx = exportCanvas.getContext("2d")!;
    exportCtx.drawImage(this.canvas, 0, 0);
    const dataUrl = exportCanvas.toDataURL("image/jpeg", quality);
    this.cachedBase64 = dataUrl.split(",")[1];
    return this.cachedBase64;
  }

  /**
   * Apply a descriptor's layout properties to this tile.
   * Returns true if position changed (needs move op).
   */
  applyDescriptor(desc: TileDescriptor): boolean {
    let moved = false;
    if (this.x !== desc.x || this.y !== desc.y || this.scale !== desc.scale || this.layer !== desc.layer || this.z !== desc.z || this.group !== desc.group) {
      moved = true;
    }
    this.group = desc.group;
    this.x = desc.x;
    this.y = desc.y;
    this.z = desc.z;
    this.scale = desc.scale;
    this.layer = desc.layer;
    this.interactive = desc.interactive;
    this.draggable = desc.draggable;
    this.visible = desc.visible;
    if (moved) this.positionDirty = true;
    return moved;
  }

  // --- Export canvas pool (shared across all tiles by size) ---
  private static exportCanvasPool = new Map<string, HTMLCanvasElement>();

  static getExportCanvas(w: number, h: number): HTMLCanvasElement {
    const key = `${w}x${h}`;
    let canvas = Tile.exportCanvasPool.get(key);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      Tile.exportCanvasPool.set(key, canvas);
    }
    return canvas;
  }
}
