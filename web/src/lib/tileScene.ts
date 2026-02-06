/**
 * TileScene - scene graph manager for micro-tiles.
 *
 * Maintains a registry of live MicroTiles. Reconcile() diffs desired vs current
 * state, emitting create/destroy/move ops. renderDirty() calls render on tiles
 * whose content hash changed. getBroadcastQueue() returns pending scene ops and
 * dirty texture payloads.
 */

import { MicroTile, type TileDescriptor, type TileLayer, type RenderFn } from "./microTile";

// Scene ops sent to Spectacles (JSON, no texture)
export interface SceneOp {
  op: "create" | "move" | "destroy" | "visibility";
  id: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  s?: number;
  layer?: TileLayer;
  interactive?: boolean;
  draggable?: boolean;
  visible?: boolean;
  duration?: number; // ms, 0 = instant
}

// Texture payload for a single tile
export interface TexPayload {
  id: string;
  image: string; // base64 JPEG
}

// Broadcast queue returned each frame
export interface BroadcastQueue {
  sceneOps: SceneOp[];
  textures: TexPayload[];
}

export class TileScene {
  private tiles = new Map<string, MicroTile>();
  private renderers = new Map<string, RenderFn>();
  private pendingOps: SceneOp[] = [];
  private pendingTextures: TexPayload[] = [];

  // JPEG quality per tile type
  private qualityMap: Record<string, number> = {
    "header": 0.6,
    "agent-dot": 0.55,
    "mem-card": 0.55,
    "ctx-card": 0.55,
    "prompt-btn": 0.55,
    "chat-bubble": 0.65,
    "page-nav": 0.55,
    "mic-indicator": 0.5,
    "voice-transcript": 0.5,
  };

  /**
   * Register a render function for a tile type.
   */
  registerRenderer(type: string, fn: RenderFn) {
    this.renderers.set(type, fn);
  }

  /**
   * Get a tile by ID.
   */
  getTile(id: string): MicroTile | undefined {
    return this.tiles.get(id);
  }

  /**
   * Get all live tiles.
   */
  getAllTiles(): MicroTile[] {
    return Array.from(this.tiles.values());
  }

  /**
   * Reconcile desired state with current state.
   * Creates new tiles, destroys removed ones, moves/updates existing ones.
   */
  reconcile(desired: TileDescriptor[]) {
    const desiredIds = new Set(desired.map(d => d.id));

    // Destroy tiles that are no longer desired
    for (const [id, tile] of this.tiles) {
      if (!desiredIds.has(id)) {
        if (tile.created) {
          this.pendingOps.push({ op: "destroy", id });
        }
        this.tiles.delete(id);
      }
    }

    // Create or update tiles
    for (const desc of desired) {
      let tile = this.tiles.get(desc.id);

      if (!tile) {
        // New tile
        tile = new MicroTile(desc.id, desc.type, desc.w, desc.h);
        const renderer = this.renderers.get(desc.type);
        if (renderer) tile.setRenderFn(renderer);
        tile.setData(desc.data);
        tile.applyDescriptor(desc);
        this.tiles.set(desc.id, tile);

        // Mark for create op (will be emitted after first render)
      } else {
        // Existing tile - update data and position
        tile.setData(desc.data);
        tile.applyDescriptor(desc);
      }
    }
  }

  /**
   * Render all dirty tiles. Call after reconcile() and after updating data/hashes.
   * Returns number of tiles rendered.
   */
  renderDirty(): number {
    let count = 0;
    for (const tile of this.tiles.values()) {
      if (!tile.visible) continue;
      if (tile.render()) {
        count++;
        // Queue texture broadcast
        const quality = this.qualityMap[tile.type] ?? 0.6;
        this.pendingTextures.push({
          id: tile.id,
          image: tile.getBase64(quality),
        });

        // If this is a new tile, also queue create op
        if (!tile.created) {
          tile.created = true;
          this.pendingOps.push({
            op: "create",
            id: tile.id,
            x: tile.x,
            y: tile.y,
            w: tile.w,
            h: tile.h,
            s: tile.scale,
            layer: tile.layer,
            interactive: tile.interactive,
            draggable: tile.draggable,
          });
          tile.positionDirty = false;
        }
      }

      // Emit move ops for tiles that moved but didn't re-render
      if (tile.positionDirty && tile.created) {
        this.pendingOps.push({
          op: "move",
          id: tile.id,
          x: tile.x,
          y: tile.y,
          s: tile.scale,
          layer: tile.layer,
          duration: 0,
        });
        tile.positionDirty = false;
      }
    }
    return count;
  }

  /**
   * Drain the broadcast queue. Returns all pending ops and textures,
   * then clears the queue.
   */
  getBroadcastQueue(): BroadcastQueue {
    const queue: BroadcastQueue = {
      sceneOps: this.pendingOps.splice(0),
      textures: this.pendingTextures.splice(0),
    };
    return queue;
  }

  /**
   * Queue a move op directly (for hover glow, drag ghost, etc.)
   */
  queueMoveOp(id: string, x: number, y: number, duration = 0) {
    const tile = this.tiles.get(id);
    if (tile) {
      tile.x = x;
      tile.y = y;
    }
    this.pendingOps.push({ op: "move", id, x, y, duration });
  }

  /**
   * Queue a visibility change op.
   */
  queueVisibilityOp(id: string, visible: boolean) {
    const tile = this.tiles.get(id);
    if (tile) tile.visible = visible;
    this.pendingOps.push({ op: "visibility", id, visible });
  }

  /**
   * Clear all tiles and pending ops.
   */
  clear() {
    for (const tile of this.tiles.values()) {
      if (tile.created) {
        this.pendingOps.push({ op: "destroy", id: tile.id });
      }
    }
    this.tiles.clear();
  }

  /**
   * Total count of live tiles.
   */
  get size(): number {
    return this.tiles.size;
  }
}
