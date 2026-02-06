/**
 * MicroTilePanel.ts
 *
 * The "DOM" for Spectacles. Like a browser rendering engine, this manages
 * a tree of quads (the "elements") inside a container panel (the "viewport").
 *
 * Architecture:
 *   Container panel (dark background quad, always present)
 *   └── Tile quads (created/destroyed/moved by "scene" ops from web)
 *       Each has its own material, collider, and Interactable.
 *
 * Web sends scene ops (create/move/destroy/visibility) as JSON, plus
 * "tex" events with JPEG base64 per tile ID. This side receives them,
 * manages the quad tree, and sends interaction events back.
 *
 * Textures that arrive before their quad are buffered and applied on creation.
 */

import { SnapCloudRequirements } from './SnapCloudRequirements';
import { RealtimeTextureReceiver } from './RealtimeTextureReceiver';
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";

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
  0: 0.05,  // base content (slightly in front of background)
  1: 0.5,   // hover overlay
  2: 1.0,   // drag ghost
  3: 2.0,   // modal overlay
};

// Max buffered textures before we start dropping old ones
const MAX_TEXTURE_BUFFER = 50;

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

  @input
  @hint("Spawn colored test quads to verify mesh/material pipeline")
  public showTestQuads: boolean = false;

  // Live quads
  private quads: Map<string, QuadEntry> = new Map();
  private quadParent: SceneObject;
  private receiver: RealtimeTextureReceiver;
  private resolvedDeviceId: string = "";

  // Texture buffer: holds textures that arrived before their quad was created.
  // When a quad is created, we check this buffer and apply immediately.
  private bufferedTextures: Map<string, string> = new Map();

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

    // Fallback if channelName is empty (not set in Inspector)
    if (!this.channelName || this.channelName.trim() === "") {
      this.channelName = "demo";
      print("[MicroTilePanel] WARNING: channelName empty, defaulting to 'demo'");
    }

    print("[MicroTilePanel] Initializing, device: " + this.resolvedDeviceId);
    print("[MicroTilePanel] Channel: " + this.channelName);
    print("[MicroTilePanel] Material template: " + (this.material ? "set" : "MISSING"));
    print("[MicroTilePanel] pixelsPerCm: " + this.pixelsPerCm);

    if (!this.material) {
      print("[MicroTilePanel] ERROR: No material template assigned! Assign an Unlit material in the Inspector.");
      return;
    }

    this.quadParent = global.scene.createSceneObject("MicroTileRoot");
    this.quadParent.setParent(this.sceneObject);
    this.quadParent.layer = this.sceneObject.layer; // inherit render layer (world space, not orthographic)
    this.quadParent.getTransform().setLocalPosition(this.positionOffset);

    this.sharedMesh = this.buildUnitQuadMesh();

    // Log parent transform for debugging
    const worldPos = this.sceneObject.getTransform().getWorldPosition();
    const worldScale = this.sceneObject.getTransform().getWorldScale();
    print("[MicroTilePanel] Parent world pos: (" + worldPos.x.toFixed(1) + ", " + worldPos.y.toFixed(1) + ", " + worldPos.z.toFixed(1) + ")");
    print("[MicroTilePanel] Parent world scale: (" + worldScale.x.toFixed(2) + ", " + worldScale.y.toFixed(2) + ", " + worldScale.z.toFixed(2) + ")");

    // Test quads (toggle via Inspector to verify mesh/material pipeline)
    if (this.showTestQuads) {
      this.spawnTestQuads();
    }

    this.receiver = this.attachReceiver();

    print("[MicroTilePanel] Ready! Channel: spectacles:" + this.channelName + ":" + this.resolvedDeviceId);
  }

  // Minimal 4x4 JPEG base64 strings for test quads (baseTex required, no baseColor on this material)
  private static TEST_TEX_WHITE = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";
  private static TEST_TEX_RED = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z";
  private static TEST_TEX_GREEN = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDWooor80PyA//Z";

  /**
   * Spawn a few colored test quads at known positions.
   * Uses baseTex (this material has no baseColor, just texture -> final color).
   * Remove this once the broadcast pipeline is confirmed working.
   */
  private spawnTestQuads() {
    const quads = [
      { b64: MicroTilePanel.TEST_TEX_WHITE, label: "white", x: -12 },
      { b64: MicroTilePanel.TEST_TEX_RED,   label: "red",   x: 0 },
      { b64: MicroTilePanel.TEST_TEX_GREEN, label: "green", x: 12 },
    ];

    for (const q of quads) {
      const obj = global.scene.createSceneObject("TestQuad_" + q.label);
      obj.setParent(this.quadParent);
      obj.layer = this.sceneObject.layer;

      const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mesh = this.sharedMesh;

      const mat = this.material.clone();
      rmv.mainMaterial = mat;

      // Position: side by side, 12cm apart, centered at origin
      obj.getTransform().setLocalPosition(new vec3(q.x, 0, 0.1));

      // Scale: 10cm x 10cm
      obj.getTransform().setLocalScale(new vec3(10, 10, 1));

      // Decode base64 JPEG and assign to baseTex (the only input this material uses)
      Base64.decodeTextureAsync(
        q.b64,
        (texture: Texture) => {
          mat.mainPass["baseTex"] = texture;
          print("[MicroTilePanel] TEST quad " + q.label + " texture applied!");
        },
        () => {
          print("[MicroTilePanel] TEST quad " + q.label + " texture FAILED to decode!");
        }
      );

      print("[MicroTilePanel] TEST quad: " + q.label + " at x=" + q.x + ", scale=10x10cm (texture pending async decode)");
    }

    print("[MicroTilePanel] 3 test quads spawned. Textures decoding async...");
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
   * Vertices at (-0.5,-0.5) to (0.5,0.5), UVs (0,0) to (1,1).
   */
  private buildUnitQuadMesh(): RenderMesh {
    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3 },
      { name: "texture0", components: 2 }
    ]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;

    // Front face: normal pointing +Z (toward camera when camera looks -Z)
    builder.appendVerticesInterleaved([-0.5, -0.5, 0,  0, 0, 1,  0, 0]);
    builder.appendVerticesInterleaved([ 0.5, -0.5, 0,  0, 0, 1,  1, 0]);
    builder.appendVerticesInterleaved([ 0.5,  0.5, 0,  0, 0, 1,  1, 1]);
    builder.appendVerticesInterleaved([-0.5,  0.5, 0,  0, 0, 1,  0, 1]);
    builder.appendIndices([0, 1, 2, 0, 2, 3]);

    const mesh = builder.getMesh();
    builder.updateMesh();
    return mesh;
  }

  // ---- Scene op dispatch ----

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
      default:
        print("[MicroTilePanel] Unknown op: " + op.op);
    }
  }

  private handleSceneEvent(payload: any) {
    if (!payload) return;

    if (payload.ops && Array.isArray(payload.ops)) {
      print("[MicroTilePanel] Batch: " + payload.ops.length + " ops");
      for (const op of payload.ops) {
        this.handleSceneOp(op);
      }
    } else if (payload.op) {
      this.handleSceneOp(payload);
    }
  }

  // ---- Quad CRUD ----

  private createQuad(op: any) {
    const id = op.id as string;
    if (!id) return;

    // If quad already exists, just update its position
    if (this.quads.has(id)) {
      this.moveQuad(op);
      return;
    }

    // Reuse from pool or create new
    let entry = this.quadPool.pop();

    if (entry) {
      entry.id = id;
      entry.w = op.w || 220;
      entry.h = op.h || 48;
      entry.layer = op.layer !== undefined ? op.layer : 0;
      entry.obj.enabled = true;
      entry.obj.name = "MT_" + id;
    } else {
      entry = this.buildNewQuad(id, op.w || 220, op.h || 48, op.layer !== undefined ? op.layer : 0);
    }

    // Position - use explicit z if provided, else derive from layer
    const x = (op.x !== undefined ? op.x : 0) as number;
    const y = (op.y !== undefined ? op.y : 0) as number;
    const z = op.z !== undefined ? (op.z as number) : (LAYER_Z[entry.layer] !== undefined ? LAYER_Z[entry.layer] : 0.05);
    entry.obj.getTransform().setLocalPosition(new vec3(x, y, z));

    // Scale based on pixel dimensions and pixelsPerCm
    const widthCm = entry.w / this.pixelsPerCm;
    const heightCm = entry.h / this.pixelsPerCm;
    const s = (op.s !== undefined ? op.s : 1) as number;
    entry.obj.getTransform().setLocalScale(new vec3(widthCm * s, heightCm * s, 1));

    // Set up interaction if requested
    if (op.interactive) {
      this.setupInteraction(entry);
    }

    this.quads.set(id, entry);

    print("[MicroTilePanel] + " + id + " at (" + x.toFixed(1) + "," + y.toFixed(1) + "," + z.toFixed(2) + ") " + widthCm.toFixed(1) + "x" + heightCm.toFixed(1) + "cm");

    // Check for buffered texture - apply immediately if one was waiting
    const buffered = this.bufferedTextures.get(id);
    if (buffered) {
      this.bufferedTextures.delete(id);
      this.applyTexture(entry, buffered);
      print("[MicroTilePanel]   -> applied buffered texture for " + id);
    }
  }

  private buildNewQuad(id: string, w: number, h: number, layer: number): QuadEntry {
    const obj = global.scene.createSceneObject("MT_" + id);
    obj.setParent(this.quadParent);
    obj.layer = this.sceneObject.layer;

    const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = this.sharedMesh;

    // Clone material for independent texture per quad
    const mat = this.material.clone();
    rmv.mainMaterial = mat;

    // Create a child for the collider (separate from visual scale)
    const colliderObj = global.scene.createSceneObject("MT_col_" + id);
    colliderObj.setParent(obj);
    colliderObj.layer = this.sceneObject.layer;
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
      interactable: null as any,
      layer,
      w,
      h,
      unsubscribes: [],
    };
  }

  private setupInteraction(entry: QuadEntry) {
    if (entry.interactable) return;

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

  private moveQuad(op: any) {
    const id = op.id as string;
    const entry = this.quads.get(id);
    if (!entry) return;

    const x = (op.x !== undefined ? op.x : entry.obj.getTransform().getLocalPosition().x) as number;
    const y = (op.y !== undefined ? op.y : entry.obj.getTransform().getLocalPosition().y) as number;
    const layer = op.layer !== undefined ? op.layer : entry.layer;
    const z = op.z !== undefined ? (op.z as number) : (LAYER_Z[layer] !== undefined ? LAYER_Z[layer] : 0.05);

    if (op.s !== undefined) {
      const widthCm = entry.w / this.pixelsPerCm;
      const heightCm = entry.h / this.pixelsPerCm;
      const s = op.s as number;
      entry.obj.getTransform().setLocalScale(new vec3(widthCm * s, heightCm * s, 1));
    }

    const targetPos = new vec3(x, y, z);
    const duration = (op.duration || 0) as number;

    if (duration > 0) {
      this.animatePosition(entry.obj, targetPos, duration);
    } else {
      entry.obj.getTransform().setLocalPosition(targetPos);
    }

    entry.layer = layer;
  }

  private animatePosition(obj: SceneObject, target: vec3, durationMs: number) {
    const start = obj.getTransform().getLocalPosition();
    const startTime = Date.now();

    const updateEvent = this.createEvent("UpdateEvent");
    updateEvent.bind(() => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const ease = t * t * (3 - 2 * t); // smoothstep

      const pos = new vec3(
        start.x + (target.x - start.x) * ease,
        start.y + (target.y - start.y) * ease,
        start.z + (target.z - start.z) * ease,
      );
      obj.getTransform().setLocalPosition(pos);

      if (t >= 1) {
        updateEvent.enabled = false;
      }
    });
  }

  private destroyQuad(id: string) {
    const entry = this.quads.get(id);
    if (!entry) return;

    for (const unsub of entry.unsubscribes) {
      unsub();
    }
    entry.unsubscribes = [];

    if (this.quadPool.length < this.poolMaxSize) {
      entry.obj.enabled = false;
      this.quadPool.push(entry);
    } else {
      entry.obj.destroy();
    }

    this.quads.delete(id);
    print("[MicroTilePanel] - " + id + " (live:" + this.quads.size + " pool:" + this.quadPool.length + ")");
  }

  private setVisibility(id: string, visible: boolean) {
    const entry = this.quads.get(id);
    if (!entry) return;
    entry.obj.enabled = visible;
  }

  // ---- Texture handling ----

  /**
   * Handle a texture event. If the quad exists, apply immediately.
   * If the quad doesn't exist yet (race condition), buffer the texture
   * and apply it when the quad is created.
   */
  private handleTexEvent(payload: any) {
    if (!payload || !payload.id || !payload.image) return;

    const id = payload.id as string;
    const entry = this.quads.get(id);

    if (!entry) {
      // Quad not created yet. Buffer the texture for when it arrives.
      if (this.bufferedTextures.size >= MAX_TEXTURE_BUFFER) {
        // Drop oldest entries to prevent memory leak
        const firstKey = this.bufferedTextures.keys().next().value;
        if (firstKey) this.bufferedTextures.delete(firstKey);
      }
      this.bufferedTextures.set(id, payload.image);
      return;
    }

    this.applyTexture(entry, payload.image);
  }

  /**
   * Decode a base64 JPEG and apply to a quad's material.
   */
  private applyTexture(entry: QuadEntry, base64Image: string) {
    Base64.decodeTextureAsync(
      base64Image,
      (texture: Texture) => {
        entry.material.mainPass["baseTex"] = texture;
      },
      () => {
        print("[MicroTilePanel] Failed to decode texture for " + entry.id);
      }
    );
  }

  // ---- Interaction ----

  private sendInteraction(id: string, type: string) {
    if (!this.receiver) return;
    this.receiver.sendEvent("interact", {
      id: id,
      type: type,
      timestamp: Date.now(),
    });
  }

  // ---- Receiver setup ----

  private attachReceiver(): RealtimeTextureReceiver {
    let statusText: Text | null = null;

    if (this.showStatus) {
      const statusObj = global.scene.createSceneObject("MicroStatus");
      statusObj.setParent(this.sceneObject);
      statusObj.getTransform().setLocalPosition(new vec3(0, 20, 0));
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
    (receiver as any).gridCols = 0;
    (receiver as any).gridRows = 0;
    if (statusText) {
      (receiver as any).statusText = statusText;
    }

    // Wire up scene ops and texture events
    receiver.onScene((payload: any) => {
      print("[MicroTilePanel] onScene: " + JSON.stringify(payload).substring(0, 100));
      this.handleSceneEvent(payload);
    });

    receiver.onTex((payload: any) => {
      const id = payload?.id ?? "?";
      const imgLen = payload?.image?.length ?? 0;
      print("[MicroTilePanel] onTex: id=" + id + " imgLen=" + imgLen);
      this.handleTexEvent(payload);
    });

    // Status display
    if (this.showStatus && statusText) {
      const statusEvent = this.createEvent("UpdateEvent");
      let lastUpdate = 0;
      statusEvent.bind(() => {
        const now = Date.now();
        if (now - lastUpdate < 2000) return;
        lastUpdate = now;
        statusText!.text =
          "Tiles: " + this.quads.size +
          " | Pool: " + this.quadPool.length +
          " | Buf: " + this.bufferedTextures.size +
          "\n" + receiver.getStatus() +
          " | Rx: " + receiver.getFrameCount();
      });
    }

    print("[MicroTilePanel] Receiver attached");
    return receiver;
  }

  // ---- Cleanup ----

  private cleanup() {
    for (const [id] of this.quads) {
      this.destroyQuad(id);
    }
    for (const entry of this.quadPool) {
      entry.obj.destroy();
    }
    this.quadPool = [];
    this.bufferedTextures.clear();
    print("[MicroTilePanel] Cleaned up");
  }

  // ---- Public API ----

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
