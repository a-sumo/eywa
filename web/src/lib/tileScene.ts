/**
 * TileScene - scene graph manager for tiles.
 *
 * Maintains a registry of live Tiles. Reconcile() diffs desired vs current
 * state, emitting create/destroy/move ops. renderDirty() calls render on tiles
 * whose content hash changed. takeOps(n)/takeTextures(n) return pending scene
 * ops and dirty texture payloads without draining more than requested.
 */

import { Tile, type TileDescriptor, type TileLayer, type RenderFn } from "./tile";

export interface GroupDescriptor {
  id: string;
  x: number;
  y: number;
  z?: number;
  visible?: boolean;
  duration?: number;
}

// Scene ops sent to Spectacles (JSON, no texture)
export interface SceneOp {
  op: "create" | "move" | "destroy" | "visibility" | "group" | "group-move" | "group-destroy";
  id: string;
  x?: number;
  y?: number;
  z?: number; // explicit z position (overrides layer-based z on Spectacles)
  w?: number;
  h?: number;
  s?: number;
  layer?: TileLayer;
  group?: string;
  interactive?: boolean;
  draggable?: boolean;
  visible?: boolean;
  duration?: number; // ms, 0 = instant
}

// Texture payload for a single tile
export interface TexPayload {
  id: string;
  image: string; // base64 JPEG
  w: number;     // pixel width (for auto-create on Spectacles if create op was missed)
  h: number;     // pixel height
}

export class TileScene {
  private tiles = new Map<string, Tile>();
  private renderers = new Map<string, RenderFn>();
  private groups = new Map<string, GroupDescriptor>();
  private pendingOps: SceneOp[] = [];
  private pendingTextures: TexPayload[] = [];

  // JPEG quality per tile type
  private qualityMap: Record<string, number> = {
    "panel-bg": 0.3, // solid color, minimal quality needed
    "mem-bg": 0.3,
    "mem-bar": 0.4,
    "text": 0.85,
    "text-block": 0.85,
    "ctx-bg": 0.3,
    "ctx-bar": 0.4,
    "chat-bg": 0.3,
    "header": 0.6,
    "agent-dot": 0.55,
    "mem-card": 0.55,
    "ctx-card": 0.55,
    "prompt-btn": 0.55,
    "chat-bubble": 0.65,
    "page-nav": 0.55,
    "mic-indicator": 0.5,
    "voice-transcript": 0.5,
    "hover-glow": 0.3,
    "mascot": 0.7,
    "agent-map": 0.75,
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
  getTile(id: string): Tile | undefined {
    return this.tiles.get(id);
  }

  /**
   * Get all live tiles.
   */
  getAllTiles(): Tile[] {
    return Array.from(this.tiles.values());
  }

  getGroup(id: string): GroupDescriptor | undefined {
    return this.groups.get(id);
  }

  getTileWorldPosition(id: string): { x: number; y: number; z?: number } | null {
    const tile = this.tiles.get(id);
    if (!tile) return null;
    if (!tile.group) return { x: tile.x, y: tile.y, z: tile.z };
    const group = this.groups.get(tile.group);
    if (!group) return { x: tile.x, y: tile.y, z: tile.z };
    return { x: group.x + tile.x, y: group.y + tile.y, z: tile.z ?? group.z };
  }

  /**
   * Reconcile desired state with current state.
   * Creates new tiles, destroys removed ones, moves/updates existing ones.
   */
  reconcile(desired: TileDescriptor[], groups: GroupDescriptor[] = []) {
    const desiredIds = new Set(desired.map(d => d.id));
    const desiredGroupIds = new Set(groups.map(g => g.id));

    // Destroy groups that are no longer desired
    for (const [id] of this.groups) {
      if (!desiredGroupIds.has(id)) {
        this.pendingOps.push({ op: "group-destroy", id });
        this.groups.delete(id);
      }
    }

    // Create or update groups
    for (const g of groups) {
      const existing = this.groups.get(g.id);
      if (!existing) {
        this.pendingOps.push({
          op: "group",
          id: g.id,
          x: g.x,
          y: g.y,
          z: g.z,
          visible: g.visible,
        });
        this.groups.set(g.id, { ...g });
      } else {
        if (existing.x !== g.x || existing.y !== g.y || existing.z !== g.z || existing.visible !== g.visible) {
          this.pendingOps.push({
            op: "group-move",
            id: g.id,
            x: g.x,
            y: g.y,
            z: g.z,
            visible: g.visible,
            duration: g.duration ?? 0,
          });
          this.groups.set(g.id, { ...g });
        }
      }
    }

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
        tile = new Tile(desc.id, desc.type, desc.w, desc.h);
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
          w: tile.w,
          h: tile.h,
        });

        // If this is a new tile, also queue create op
        if (!tile.created) {
          tile.created = true;
          const createOp: SceneOp = {
            op: "create",
            id: tile.id,
            x: tile.x,
            y: tile.y,
            w: tile.w,
            h: tile.h,
            s: tile.scale,
            layer: tile.layer,
            group: tile.group,
            interactive: tile.interactive,
            draggable: tile.draggable,
          };
          if (tile.z !== undefined) createOp.z = tile.z;
          this.pendingOps.push(createOp);
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
          group: tile.group,
          duration: 0,
        });
        tile.positionDirty = false;
      }
    }
    return count;
  }

  /**
   * Take up to `n` scene ops from the pending queue.
   * Leaves remaining ops for the next call.
   */
  takeOps(n: number): SceneOp[] {
    if (this.pendingOps.length === 0) return [];
    return this.pendingOps.splice(0, n);
  }

  /**
   * Take up to `n` texture payloads from the pending queue.
   * Leaves remaining textures for the next call.
   */
  takeTextures(n: number): TexPayload[] {
    if (this.pendingTextures.length === 0) return [];
    return this.pendingTextures.splice(0, n);
  }

  /**
   * Number of pending scene ops.
   */
  get pendingOpCount(): number {
    return this.pendingOps.length;
  }

  /**
   * Number of pending textures.
   */
  get pendingTexCount(): number {
    return this.pendingTextures.length;
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
   * Force re-send create ops and textures for all existing tiles.
   * Call when a new subscriber connects (they missed the initial burst).
   */
  resync() {
    for (const group of this.groups.values()) {
      this.pendingOps.push({
        op: "group",
        id: group.id,
        x: group.x,
        y: group.y,
        z: group.z,
        visible: group.visible,
      });
    }
    for (const tile of this.tiles.values()) {
      if (!tile.visible) continue;
      // Re-queue create op
      const createOp: SceneOp = {
        op: "create",
        id: tile.id,
        x: tile.x,
        y: tile.y,
        w: tile.w,
        h: tile.h,
        s: tile.scale,
        layer: tile.layer,
        group: tile.group,
        interactive: tile.interactive,
        draggable: tile.draggable,
      };
      if (tile.z !== undefined) createOp.z = tile.z;
      this.pendingOps.push(createOp);

      // Re-queue texture
      const quality = this.qualityMap[tile.type] ?? 0.6;
      this.pendingTextures.push({
        id: tile.id,
        image: tile.getBase64(quality),
        w: tile.w,
        h: tile.h,
      });
    }
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
    for (const group of this.groups.values()) {
      this.pendingOps.push({ op: "group-destroy", id: group.id });
    }
    this.groups.clear();
  }

  /**
   * Total count of live tiles.
   */
  get size(): number {
    return this.tiles.size;
  }
}
