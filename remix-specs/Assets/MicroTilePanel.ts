/**
 * MicroTilePanel.ts
 *
 * Dynamic quad manager for the micro-tile architecture. Instead of a fixed
 * grid of quads, this creates/destroys/moves SceneObjects on the fly based
 * on "scene" events from the web renderer. Each tile gets its own quad,
 * collider, and Interactable for per-tile tap/hover interaction.
 *
 * Protocol:
 *   scene op "create"     - spawn a new quad at position
 *   scene op "move"       - reposition an existing quad
 *   scene op "destroy"    - remove a quad
 *   scene op "visibility" - show/hide a quad
 *   "tex" event           - apply JPEG texture to a quad by tile ID
 *
 * Sends back:
 *   "interact" event      - { id, type: "tap"|"hover"|"hover_exit" }
 */

import { SnapCloudRequirements } from './SnapCloudRequirements';
import { RealtimeTextureReceiver } from './RealtimeTextureReceiver';
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";

interface QuadEntry {
  id: string;
  obj: SceneObject;
  rmv: RenderMeshVisual;
  material: Material;
  colliderObj: SceneObject;
  interactable: Interactable;
  layer: number;
  w: number; // canvas pixel width (for aspect ratio)
  h: number; // canvas pixel height
  unsubscribes: (() => void)[];
}

// Z offset per layer (cm). Higher layers are closer to the user.
const LAYER_Z: Record<number, number> = {
  0: 0.01,  // base content
  1: 0.5,   // hover overlay
  2: 1.0,   // drag ghost
  3: 2.0,   // modal overlay
};

@component
export class MicroTilePanel extends BaseScriptComponent {
  @input
  @hint("SnapCloudRequirements reference for Supabase config")
  public snapCloudRequirements: SnapCloudRequirements;

  @input
  @hint("Channel name - use your room slug")
  public channelName: string = "demo";

  @input
  @hint("Device ID - leave empty to auto-generate. Set to 'editor' for Lens Studio preview.")
  public deviceId: string = "editor";

  @input
  @hint("Position offset from parent (center of panel)")
  public positionOffset: vec3 = vec3.zero();

  @input
  @hint("Material template for quads. Create an Unlit material in Asset Browser.")
  public material: Material;

  @input
  @hint("Pixels-to-cm scale factor. 1 cm per N pixels of tile width.")
  public pixelsPerCm: number = 16;

  @input
  @hint("Show debug status text")
  public showStatus: boolean = true;

  // Live quads
  private quads: Map<string, QuadEntry> = new Map();
  private quadParent: SceneObject;
  private receiver: RealtimeTextureReceiver;
  private resolvedDeviceId: string = "";
  private unsubscribes: (() => void)[] = [];

  // Quad pool for recycling destroyed quads
  private quadPool: QuadEntry[] = [];
  private poolMaxSize: number = 20;

  // Shared mesh (all quads use the same unit-square mesh)
  private sharedMesh: RenderMesh;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.init());
    this.createEvent("OnDestroyEvent").bind(() => this.cleanup());
  }

  private init() {
    this.resolvedDeviceId = this.deviceId || this.generateDeviceId();

    print("[MicroTilePanel] Initializing, device: " + this.resolvedDeviceId);

    this.quadParent = global.scene.createSceneObject("MicroTileRoot");
    this.quadParent.setParent(this.sceneObject);
    this.quadParent.getTransform().setLocalPosition(this.positionOffset);

    this.sharedMesh = this.buildUnitQuadMesh();
    this.receiver = this.attachReceiver();

    print("[MicroTilePanel] Ready! Channel: spectacles:" + this.channelName + ":" + this.resolvedDeviceId);
  }

  private generateDeviceId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "specs-";
    for (let i = 0; i < 4; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  /**
   * Build a unit square mesh (reused by all quads, scaled per-quad via transform).
   */
  private buildUnitQuadMesh(): RenderMesh {
    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3 },
      { name: "texture0", components: 2 }
    ]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;

    builder.appendVerticesInterleaved([-0.5, -0.5, 0,  0, 0, 1,  0, 0]);
    builder.appendVerticesInterleaved([ 0.5, -0.5, 0,  0, 0, 1,  1, 0]);
    builder.appendVerticesInterleaved([ 0.5,  0.5, 0,  0, 0, 1,  1, 1]);
    builder.appendVerticesInterleaved([-0.5,  0.5, 0,  0, 0, 1,  0, 1]);
    builder.appendIndices([0, 1, 2, 0, 2, 3]);

    const mesh = builder.getMesh();
    builder.updateMesh();
    return mesh;
  }

  /**
   * Handle a scene op (create/move/destroy/visibility).
   */
  private handleSceneOp(op: any) {
    if (!op || !op.op) return;

    switch (op.op) {
      case "create":
        this.createQuad(op);
        break;
      case "move":
        this.moveQuad(op);
        break;
      case "destroy":
        this.destroyQuad(op.id);
        break;
      case "visibility":
        this.setVisibility(op.id, op.visible);
        break;
    }
  }

  /**
   * Handle a scene event payload (single op or batched ops).
   */
  private handleSceneEvent(payload: any) {
    if (!payload) return;

    if (payload.ops && Array.isArray(payload.ops)) {
      // Batched ops
      for (const op of payload.ops) {
        this.handleSceneOp(op);
      }
    } else if (payload.op) {
      // Single op
      this.handleSceneOp(payload);
    }
  }

  /**
   * Create a new quad for a tile.
   */
  private createQuad(op: any) {
    const id = op.id as string;
    if (!id) return;

    // Reuse from pool or create new
    let entry = this.quadPool.pop();

    if (entry) {
      // Reuse pooled quad
      entry.id = id;
      entry.w = op.w || 220;
      entry.h = op.h || 48;
      entry.layer = op.layer || 0;
      entry.obj.enabled = true;
      entry.obj.name = "MT_" + id;
    } else {
      // Create fresh
      entry = this.buildNewQuad(id, op.w || 220, op.h || 48, op.layer || 0);
    }

    // Position
    const x = (op.x || 0) as number;
    const y = (op.y || 0) as number;
    const z = LAYER_Z[entry.layer] || 0.01;
    entry.obj.getTransform().setLocalPosition(new vec3(x, y, z));

    // Scale based on pixel dimensions and pixelsPerCm
    const widthCm = entry.w / this.pixelsPerCm;
    const heightCm = entry.h / this.pixelsPerCm;
    const s = (op.s || 1) as number;
    entry.obj.getTransform().setLocalScale(new vec3(widthCm * s, heightCm * s, 1));

    // Set up interaction if requested
    if (op.interactive) {
      this.setupInteraction(entry);
    }

    this.quads.set(id, entry);

    // Register material with receiver for texture updates
    this.receiver.setMicroTileMaterial(id, entry.material);

    print("[MicroTilePanel] Created quad: " + id + " at (" + x.toFixed(1) + ", " + y.toFixed(1) + ") " + widthCm.toFixed(1) + "x" + heightCm.toFixed(1) + "cm");
  }

  private buildNewQuad(id: string, w: number, h: number, layer: number): QuadEntry {
    const obj = global.scene.createSceneObject("MT_" + id);
    obj.setParent(this.quadParent);

    const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = this.sharedMesh;

    // Clone material for independent texture
    const mat = this.material.clone();
    rmv.mainMaterial = mat;

    // Create a child for the collider (separate scale)
    const colliderObj = global.scene.createSceneObject("MT_col_" + id);
    colliderObj.setParent(obj);
    colliderObj.getTransform().setLocalPosition(vec3.zero());
    colliderObj.getTransform().setLocalScale(new vec3(1, 1, 0.01));

    const collider = colliderObj.createComponent("Physics.ColliderComponent") as ColliderComponent;
    const shape = Shape.createBoxShape();
    shape.size = new vec3(1, 1, 0.01);
    collider.shape = shape;

    return {
      id,
      obj,
      rmv,
      material: mat,
      colliderObj,
      interactable: null as any, // set up later if interactive
      layer,
      w,
      h,
      unsubscribes: [],
    };
  }

  /**
   * Set up SIK Interactable for tap/hover on a quad.
   */
  private setupInteraction(entry: QuadEntry) {
    if (entry.interactable) return; // already set up

    entry.interactable = entry.colliderObj.getComponent(Interactable.getTypeName()) as Interactable;
    if (!entry.interactable) {
      entry.interactable = entry.colliderObj.createComponent(Interactable.getTypeName()) as Interactable;
    }

    const id = entry.id;

    entry.unsubscribes.push(
      entry.interactable.onHoverEnter(() => {
        this.sendInteraction(id, "hover");
      })
    );

    entry.unsubscribes.push(
      entry.interactable.onHoverExit(() => {
        this.sendInteraction(id, "hover_exit");
      })
    );

    entry.unsubscribes.push(
      entry.interactable.onTriggerStart(() => {
        this.sendInteraction(id, "tap");
      })
    );
  }

  /**
   * Move an existing quad.
   */
  private moveQuad(op: any) {
    const id = op.id as string;
    const entry = this.quads.get(id);
    if (!entry) return;

    const x = (op.x !== undefined ? op.x : entry.obj.getTransform().getLocalPosition().x) as number;
    const y = (op.y !== undefined ? op.y : entry.obj.getTransform().getLocalPosition().y) as number;
    const layer = op.layer !== undefined ? op.layer : entry.layer;
    const z = LAYER_Z[layer] || 0.01;

    // Scale update
    if (op.s !== undefined) {
      const widthCm = entry.w / this.pixelsPerCm;
      const heightCm = entry.h / this.pixelsPerCm;
      const s = op.s as number;
      entry.obj.getTransform().setLocalScale(new vec3(widthCm * s, heightCm * s, 1));
    }

    const targetPos = new vec3(x, y, z);

    const duration = (op.duration || 0) as number;
    if (duration > 0) {
      // Animated move via tween (simple linear interpolation via UpdateEvent)
      this.animatePosition(entry.obj, targetPos, duration);
    } else {
      entry.obj.getTransform().setLocalPosition(targetPos);
    }

    entry.layer = layer;
  }

  /**
   * Simple position animation using UpdateEvent.
   */
  private animatePosition(obj: SceneObject, target: vec3, durationMs: number) {
    const start = obj.getTransform().getLocalPosition();
    const startTime = Date.now();

    const updateEvent = this.createEvent("UpdateEvent");
    updateEvent.bind(() => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / durationMs);
      // Ease in-out (smooth step)
      const ease = t * t * (3 - 2 * t);

      const pos = new vec3(
        start.x + (target.x - start.x) * ease,
        start.y + (target.y - start.y) * ease,
        start.z + (target.z - start.z) * ease,
      );
      obj.getTransform().setLocalPosition(pos);

      if (t >= 1) {
        // Done. Remove this update event by unbinding.
        // Lens Studio doesn't have a direct "removeEvent" so we just
        // set a flag checked in the bind.
        updateEvent.enabled = false;
      }
    });
  }

  /**
   * Destroy a quad (return to pool or truly destroy).
   */
  private destroyQuad(id: string) {
    const entry = this.quads.get(id);
    if (!entry) return;

    // Unregister from receiver
    this.receiver.removeMicroTileMaterial(id);

    // Clean up interaction subscriptions
    for (const unsub of entry.unsubscribes) {
      unsub();
    }
    entry.unsubscribes = [];

    // Return to pool or destroy
    if (this.quadPool.length < this.poolMaxSize) {
      entry.obj.enabled = false;
      this.quadPool.push(entry);
    } else {
      entry.obj.destroy();
    }

    this.quads.delete(id);
    print("[MicroTilePanel] Destroyed quad: " + id);
  }

  /**
   * Show or hide a quad.
   */
  private setVisibility(id: string, visible: boolean) {
    const entry = this.quads.get(id);
    if (!entry) return;
    entry.obj.enabled = visible;
  }

  /**
   * Send an interaction event back to the web.
   */
  private sendInteraction(id: string, type: string) {
    if (!this.receiver) return;
    this.receiver.sendEvent("interact", {
      id: id,
      type: type,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle texture events - apply JPEG to the correct quad's material.
   */
  private handleTexEvent(payload: any) {
    if (!payload || !payload.id || !payload.image) return;

    const id = payload.id as string;
    const entry = this.quads.get(id);
    if (!entry) return;

    Base64.decodeTextureAsync(
      payload.image,
      (texture: Texture) => {
        entry.material.mainPass.baseTex = texture;
      },
      () => {
        print("[MicroTilePanel] Failed to decode texture for " + id);
      }
    );
  }

  /**
   * Wire up the receiver for scene and tex events.
   */
  private attachReceiver(): RealtimeTextureReceiver {
    let statusText: Text | null = null;

    if (this.showStatus) {
      const statusObj = global.scene.createSceneObject("MicroStatus");
      statusObj.setParent(this.sceneObject);
      statusObj.getTransform().setLocalPosition(new vec3(0, 16, 0));
      statusText = statusObj.createComponent("Component.Text") as Text;
      statusText.text = "Connecting...";
      statusText.size = 2;
    }

    const receiver = this.quadParent.createComponent(
      RealtimeTextureReceiver.getTypeName()
    ) as RealtimeTextureReceiver;

    (receiver as any).snapCloudRequirements = this.snapCloudRequirements;
    (receiver as any).channelName = this.channelName + ":" + this.resolvedDeviceId;
    (receiver as any).lobbyChannelName = this.channelName;
    (receiver as any).deviceId = this.resolvedDeviceId;
    (receiver as any).gridCols = 0; // not using grid mode
    (receiver as any).gridRows = 0;
    if (statusText) {
      (receiver as any).statusText = statusText;
    }

    // Wire up micro-tile events
    receiver.onScene((payload: any) => {
      this.handleSceneEvent(payload);
    });

    receiver.onTex((payload: any) => {
      this.handleTexEvent(payload);
    });

    // Status update timer
    if (this.showStatus && statusText) {
      const statusEvent = this.createEvent("UpdateEvent");
      let lastUpdate = 0;
      statusEvent.bind(() => {
        const now = Date.now();
        if (now - lastUpdate < 2000) return;
        lastUpdate = now;
        statusText!.text = "Tiles: " + this.quads.size +
          "\nPool: " + this.quadPool.length +
          "\nStatus: " + receiver.getStatus() +
          "\nUpdates: " + receiver.getFrameCount();
      });
    }

    print("[MicroTilePanel] Receiver attached for micro-tile protocol");
    return receiver;
  }

  private cleanup() {
    // Clean up all quads
    for (const [id] of this.quads) {
      this.destroyQuad(id);
    }
    for (const entry of this.quadPool) {
      entry.obj.destroy();
    }
    this.quadPool = [];
    this.unsubscribes.forEach(fn => fn());
    print("[MicroTilePanel] Cleaned up");
  }

  // --- Public API ---

  public getQuadCount(): number {
    return this.quads.size;
  }

  public getReceiver(): RealtimeTextureReceiver {
    return this.receiver;
  }

  public isConnected(): boolean {
    return this.receiver ? this.receiver.isConnected() : false;
  }
}
