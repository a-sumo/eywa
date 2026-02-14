/**
 * TilePanel.ts
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
  groupId: string | null;
  interactive: boolean;
  unsubscribes: (() => void)[];
  currentTexture: Texture | null; // track for cleanup to prevent GPU memory leak
  texDecoding: boolean; // guard against concurrent decodes
}

// Z offset per layer (cm). Higher layers are closer to the user.
// Content cards sit at group z (0.5-0.8) + tile z (0.0-0.3), so max ~1.1cm.
// Overlay layers must be above that.
const LAYER_Z: Record<number, number> = {
  0: 0.05,  // base content (fallback, groups handle stacking for most tiles)
  1: 1.5,   // hover overlay (in front of all card content)
  2: 2.5,   // drag ghost
  3: 3.5,   // modal overlay
};

// Max buffered textures before we start dropping old ones
const MAX_TEXTURE_BUFFER = 50;

@component
export class TilePanel extends BaseScriptComponent {
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
  @hint("Optional camera SceneObject override (for pose broadcasts)")
  public cameraObject: SceneObject;

  @input
  @hint("Show debug status text")
  public showStatus: boolean = true;

  @input
  @hint("Spawn colored test quads to verify mesh/material pipeline")
  public showTestQuads: boolean = false;

  @input
  @hint("If true, panel anchors to image marker. If false (default), panel floats 65cm in front of camera.")
  public useMarkerTracking: boolean = false;

  @input
  @hint("HTTP bridge URL for editor preview (e.g. http://localhost:8765). When set, polls bridge instead of WebSocket.")
  @allowUndefined
  public httpBridgeUrl: string = "";

  // Live quads
  private quads: Map<string, QuadEntry> = new Map();
  private groups: Map<string, SceneObject> = new Map();
  private quadParent: SceneObject;
  private receiver: RealtimeTextureReceiver;
  private resolvedDeviceId: string = "";
  private cursorObj: SceneObject;
  private cursorVisible: boolean = false;
  private panelColliderObj: SceneObject;
  private panelInteractable: Interactable;
  private panelUnsubscribes: (() => void)[] = [];
  private cameraObj: SceneObject;
  private lastCameraSend = 0;
  private lastHitId: string | null = null;

  // Drag state for trigger-hold gestures (pinch-and-drag on device, click-drag in editor)
  private dragStartPos: { x: number; y: number } | null = null;
  private dragLastPos: { x: number; y: number } | null = null;
  private dragTileId: string | null = null;

  // Texture buffer: holds textures that arrived before their quad was created.
  // When a quad is created, we check this buffer and apply immediately.
  private bufferedTextures: Map<string, string> = new Map();

  // Quad pool for recycling destroyed quads
  private quadPool: QuadEntry[] = [];
  private poolMaxSize: number = 20;

  // Shared mesh (all quads use the same unit-square mesh)
  private sharedMesh: RenderMesh;

  // HTTP bridge polling state
  private internetModule: InternetModule;
  private httpPolling: boolean = false;
  private httpLastSceneVersion: number = 0;
  private httpLastTexVersion: number = 0;
  private httpPollCount: number = 0;
  private httpPollBusy: boolean = false;
  private httpFailCount: number = 0;
  private httpBackoffUntil: number = 0;
  private realtimeTexReceived: boolean = false; // true once Realtime delivers a texture

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.init());
    this.createEvent("OnDestroyEvent").bind(() => this.cleanup());
  }

  private init() {
    this.resolvedDeviceId = this.deviceId || this.generateDeviceId();

    // Fallback if channelName is empty (not set in Inspector)
    if (!this.channelName || this.channelName.trim() === "") {
      this.channelName = "demo";
      print("[TilePanel] WARNING: channelName empty, defaulting to 'demo'");
    }

    print("[TilePanel] Initializing, device: " + this.resolvedDeviceId);
    print("[TilePanel] Channel: " + this.channelName);
    print("[TilePanel] Material template: " + (this.material ? "set" : "MISSING"));
    print("[TilePanel] pixelsPerCm: " + this.pixelsPerCm);

    if (!this.material) {
      print("[TilePanel] ERROR: No material template assigned! Assign an Unlit material in the Inspector.");
      return;
    }

    this.quadParent = global.scene.createSceneObject("TileRoot");
    this.quadParent.setParent(this.sceneObject);
    this.quadParent.layer = this.sceneObject.layer; // inherit render layer (world space, not orthographic)
    this.quadParent.getTransform().setLocalPosition(this.positionOffset);

    this.sharedMesh = this.buildUnitQuadMesh();

    this.buildCursor();
    this.buildPanelInteractor();
    this.cameraObj = this.findCameraObject();

    // Marker-optional mode: detach from marker hierarchy so the panel floats freely.
    // When useMarkerTracking is false, we reparent to a root-level object so the
    // MarkerTrackingComponent on our old parent can't reposition us.
    if (!this.useMarkerTracking) {
      const oldParent = this.sceneObject.getParent();
      if (oldParent) {
        const panelRoot = global.scene.createSceneObject("PanelRoot");
        panelRoot.layer = this.sceneObject.layer;
        this.sceneObject.setParent(panelRoot);
        print("[TilePanel] Marker-optional: detached from '" + oldParent.name + "', floating freely");
      }
    }

    // Log parent transform for debugging
    const worldPos = this.sceneObject.getTransform().getWorldPosition();
    const worldScale = this.sceneObject.getTransform().getWorldScale();
    print("[TilePanel] Parent world pos: (" + worldPos.x.toFixed(1) + ", " + worldPos.y.toFixed(1) + ", " + worldPos.z.toFixed(1) + ")");
    print("[TilePanel] Parent world scale: (" + worldScale.x.toFixed(2) + ", " + worldScale.y.toFixed(2) + ", " + worldScale.z.toFixed(2) + ")");

    // Default placement: position panel 65cm in front of camera, 3cm below eye level.
    {
      const camT = this.cameraObj.getTransform();
      const camPos = camT.getWorldPosition();
      const camRot = camT.getWorldRotation();
      const fwd = camRot.multiplyVec3(new vec3(0, 0, -1));
      const defaultPos = new vec3(
        camPos.x + fwd.x * 65,
        camPos.y + fwd.y * 65 - 3,
        camPos.z + fwd.z * 65
      );
      this.sceneObject.getTransform().setWorldPosition(defaultPos);
      this.sceneObject.getTransform().setWorldRotation(camRot);
      print("[TilePanel] Default placement: 65cm forward, 3cm below eye level at (" +
        defaultPos.x.toFixed(1) + ", " + defaultPos.y.toFixed(1) + ", " + defaultPos.z.toFixed(1) + ")");
    }

    // Test quads (toggle via Inspector to verify mesh/material pipeline)
    if (this.showTestQuads) {
      this.spawnTestQuads();
    }

    this.receiver = this.attachReceiver();

    // HTTP bridge fallback: when httpBridgeUrl is set, poll instead of relying on WebSocket
    if (this.httpBridgeUrl && this.httpBridgeUrl.trim() !== "") {
      this.startHttpBridge();
    }

    print("[TilePanel] Ready! Channel: spectacles:" + this.channelName + ":" + this.resolvedDeviceId);
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
      { b64: TilePanel.TEST_TEX_WHITE, label: "white", x: -12 },
      { b64: TilePanel.TEST_TEX_RED,   label: "red",   x: 0 },
      { b64: TilePanel.TEST_TEX_GREEN, label: "green", x: 12 },
    ];

    for (const q of quads) {
      const obj = global.scene.createSceneObject("TestQuad_" + q.label);
      obj.setParent(this.quadParent);
      obj.layer = this.sceneObject.layer;

      const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mesh = this.sharedMesh;

      const mat = this.material.clone();
      // No blend mode override — stable version didn't set these and worked on device
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
          print("[TilePanel] TEST quad " + q.label + " texture applied!");
        },
        () => {
          print("[TilePanel] TEST quad " + q.label + " texture FAILED to decode!");
        }
      );

      print("[TilePanel] TEST quad: " + q.label + " at x=" + q.x + ", scale=10x10cm (texture pending async decode)");
    }

    print("[TilePanel] 3 test quads spawned. Textures decoding async...");
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

  private buildCursor() {
    this.cursorObj = global.scene.createSceneObject("Cursor");
    this.cursorObj.setParent(this.quadParent);

    const cursorSize = 0.6; // 0.6cm - small dot
    const transform = this.cursorObj.getTransform();
    transform.setLocalScale(new vec3(cursorSize, cursorSize, 1));
    transform.setLocalPosition(new vec3(0, 0, 3.5)); // in front of tiles

    const rmv = this.cursorObj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = this.sharedMesh;

    if (this.material) {
      const mat = this.material.clone();
      // No blend mode override — stable version didn't set these and worked on device
      // Green dot matching the aurora theme (not white)
      mat.mainPass["baseColor"] = new vec4(0.0, 0.91, 0.47, 0.85);
      rmv.mainMaterial = mat;
      // Use a tiny white texture as base (tinted by baseColor)
      Base64.decodeTextureAsync(
        TilePanel.TEST_TEX_WHITE,
        (texture: Texture) => { mat.mainPass["baseTex"] = texture; },
        () => {}
      );
    }

    this.cursorObj.enabled = false;
    this.cursorVisible = false;
  }

  private buildPanelInteractor() {
    this.panelColliderObj = global.scene.createSceneObject("PanelCollider");
    this.panelColliderObj.setParent(this.quadParent);
    this.panelColliderObj.getTransform().setLocalPosition(vec3.zero());
    this.panelColliderObj.getTransform().setLocalScale(new vec3(1, 1, 1));
    this.panelColliderObj.layer = this.sceneObject.layer;

    const rmv = this.panelColliderObj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = this.sharedMesh;
    rmv.enabled = false;

    const collider = this.panelColliderObj.createComponent("Physics.ColliderComponent") as ColliderComponent;
    const shape = Shape.createBoxShape();
    shape.size = new vec3(1, 1, 0.01);
    collider.shape = shape;

    this.panelInteractable = this.panelColliderObj.getComponent(Interactable.getTypeName()) as Interactable;
    if (!this.panelInteractable) {
      this.panelInteractable = this.panelColliderObj.createComponent(Interactable.getTypeName()) as Interactable;
    }

    this.panelUnsubscribes.push(
      this.panelInteractable.onHoverEnter((e: InteractorEvent) => {
        this.handlePanelHover(e, "hover");
      })
    );

    this.panelUnsubscribes.push(
      this.panelInteractable.onHoverUpdate((e: InteractorEvent) => {
        // If trigger is held, treat hover moves as drag
        if (this.dragLastPos) {
          const worldPos = e.interactor?.targetHitInfo?.hit?.position;
          if (!worldPos) return;
          const localPanel = this.quadParent.getTransform().getInvertedWorldTransform().multiplyPoint(worldPos);
          const hit = this.hitTestTiles(localPanel);
          const tileId = hit ? hit.id : (this.dragTileId || "");
          const dx = localPanel.x - this.dragLastPos.x;
          const dy = localPanel.y - this.dragLastPos.y;
          this.dragLastPos = { x: localPanel.x, y: localPanel.y };

          const now = Date.now();
          if (now - this.lastInteractionSendTime > 33) {
            this.lastInteractionSendTime = now;
            if (this.receiver) {
              this.receiver.sendEvent("interact", {
                id: tileId,
                type: "drag_delta",
                dx: dx,
                dy: dy,
                x: localPanel.x,
                y: localPanel.y,
                u: hit ? hit.u : 0,
                v: hit ? hit.v : 0,
                timestamp: now,
              });
            }
          }
          return; // skip normal hover while dragging
        }
        this.handlePanelHover(e, "hover_move");
      })
    );

    this.panelUnsubscribes.push(
      this.panelInteractable.onHoverExit(() => {
        // End drag if active
        if (this.dragStartPos) {
          this.sendInteraction(this.dragTileId || "", "drag_end", null);
          this.dragStartPos = null;
          this.dragLastPos = null;
          this.dragTileId = null;
        }
        this.hideCursor();
        this.sendInteraction("", "hover_exit", null);
        this.lastHitId = null;
      })
    );

    // Trigger start: send tap + start drag tracking
    this.panelUnsubscribes.push(
      this.panelInteractable.onTriggerStart((e: InteractorEvent) => {
        this.handlePanelHover(e, "tap");
        const worldPos = e.interactor?.targetHitInfo?.hit?.position;
        if (worldPos) {
          const localPanel = this.quadParent.getTransform().getInvertedWorldTransform().multiplyPoint(worldPos);
          this.dragStartPos = { x: localPanel.x, y: localPanel.y };
          this.dragLastPos = { x: localPanel.x, y: localPanel.y };
          const hit = this.hitTestTiles(localPanel);
          this.dragTileId = hit ? hit.id : null;
        }
      })
    );

    // Trigger end: stop dragging (onTriggerCanceled handles release)
    this.panelUnsubscribes.push(
      this.panelInteractable.onTriggerCanceled((e: InteractorEvent) => {
        if (this.dragStartPos) {
          this.sendInteraction(this.dragTileId || "", "drag_end", null);
        }
        this.dragStartPos = null;
        this.dragLastPos = null;
        this.dragTileId = null;
      })
    );
  }

  private findCameraObject(): SceneObject {
    if (this.cameraObject) return this.cameraObject;
    const byName = this.findSceneObjectByName("Camera");
    if (byName) return byName;
    const byAlt = this.findSceneObjectByName("Camera Object");
    if (byAlt) return byAlt;
    const sceneAny = global.scene as any;
    if (sceneAny.getRootObject) {
      return sceneAny.getRootObject(0) as SceneObject;
    }
    return this.sceneObject;
  }

  private findSceneObjectByName(name: string): SceneObject | null {
    const sceneAny = global.scene as any;
    const roots: SceneObject[] = [];
    if (sceneAny.getRootObjectCount && sceneAny.getRootObject) {
      const count = sceneAny.getRootObjectCount();
      for (let i = 0; i < count; i++) {
        const root = sceneAny.getRootObject(i) as SceneObject;
        if (root) roots.push(root);
      }
    } else if (sceneAny.getRootObject) {
      const root = sceneAny.getRootObject(0) as SceneObject;
      if (root) roots.push(root);
    }

    const queue: SceneObject[] = roots;
    while (queue.length > 0) {
      const obj = queue.shift() as SceneObject;
      const objAny = obj as any;
      const objName = objAny.name || (objAny.getName ? objAny.getName() : "");
      if (objName === name) return obj;

      const childCount = objAny.getChildrenCount ? objAny.getChildrenCount() : 0;
      for (let i = 0; i < childCount; i++) {
        const child = objAny.getChild(i) as SceneObject;
        if (child) queue.push(child);
      }
    }

    return null;
  }

  private lastInteractionSendTime: number = 0;

  private handlePanelHover(e: InteractorEvent, type: string) {
    const worldPos = e.interactor?.targetHitInfo?.hit?.position;
    if (!worldPos) return;
    const localPanel = this.quadParent.getTransform().getInvertedWorldTransform().multiplyPoint(worldPos);

    // Cursor rendering is done on the web broadcast canvas (web-rendered cursor
    // shows up in the streamed texture, avoiding the white square from the LS quad).
    // The LS-native cursor is disabled.

    const hit = this.hitTestTiles(localPanel);
    if (!hit) return;
    this.lastHitId = hit.id;

    // Throttle hover sends to ~30fps (taps always instant)
    const now = Date.now();
    if (type === "tap" || now - this.lastInteractionSendTime > 33) {
      this.lastInteractionSendTime = now;
      this.sendInteraction(hit.id, type, { x: localPanel.x, y: localPanel.y, u: hit.u, v: hit.v });
    }
  }

  private hitTestTiles(localPos: vec3): { id: string; u: number; v: number } | null {
    let bestId: string | null = null;
    let bestZ = -999;
    let bestU = 0;
    let bestV = 0;

    for (const entry of this.quads.values()) {
      if (!entry.obj.enabled || !entry.interactive) continue;
      const worldCenter = entry.obj.getTransform().getWorldPosition();
      const localCenter = this.quadParent.getTransform().getInvertedWorldTransform().multiplyPoint(worldCenter);
      const worldScale = entry.obj.getTransform().getWorldScale();
      const w = worldScale.x;
      const h = worldScale.y;

      if (localPos.x < localCenter.x - w / 2 || localPos.x > localCenter.x + w / 2) continue;
      if (localPos.y < localCenter.y - h / 2 || localPos.y > localCenter.y + h / 2) continue;

      const u = (localPos.x - (localCenter.x - w / 2)) / w;
      const v = 1.0 - (localPos.y - (localCenter.y - h / 2)) / h;

      if (localCenter.z > bestZ) {
        bestZ = localCenter.z;
        bestId = entry.id;
        bestU = u;
        bestV = v;
      }
    }

    if (!bestId) return null;
    return { id: bestId, u: bestU, v: bestV };
  }

  private updatePanelColliderBounds() {
    if (!this.panelColliderObj) return;
    let minX = 9999;
    let maxX = -9999;
    let minY = 9999;
    let maxY = -9999;
    let hasAny = false;

    for (const entry of this.quads.values()) {
      if (!entry.obj.enabled) continue;
      const worldCenter = entry.obj.getTransform().getWorldPosition();
      const localCenter = this.quadParent.getTransform().getInvertedWorldTransform().multiplyPoint(worldCenter);
      const worldScale = entry.obj.getTransform().getWorldScale();
      const w = worldScale.x;
      const h = worldScale.y;
      minX = Math.min(minX, localCenter.x - w / 2);
      maxX = Math.max(maxX, localCenter.x + w / 2);
      minY = Math.min(minY, localCenter.y - h / 2);
      maxY = Math.max(maxY, localCenter.y + h / 2);
      hasAny = true;
    }

    if (!hasAny) {
      this.panelColliderObj.enabled = false;
      return;
    }

    this.panelColliderObj.enabled = true;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.panelColliderObj.getTransform().setLocalPosition(new vec3(cx, cy, 0));
    this.panelColliderObj.getTransform().setLocalScale(new vec3(width, height, 1));
  }

  // ---- Scene op dispatch ----

  private handleSceneOp(op: any) {
    if (!op || !op.op) return;

    switch (op.op) {
      case "group":
        this.createGroup(op);
        break;
      case "group-destroy":
        this.destroyGroup(op.id);
        break;
      case "create":
        this.createQuad(op);
        break;
      case "destroy":
        this.destroyQuad(op.id);
        break;
      case "visibility":
        this.setVisibility(op.id, op.visible);
        break;
      case "move":
        this.moveQuad(op);
        break;
      case "group-move":
        this.moveGroup(op);
        break;
      default:
        print("[TilePanel] Unknown op: " + op.op);
    }
  }

  private handleSceneEvent(payload: any) {
    if (!payload) return;

    if (payload.ops && Array.isArray(payload.ops)) {
      print("[TilePanel] Batch: " + payload.ops.length + " ops");
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

    // If quad already exists, update its position/scale instead of skipping
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
      entry.interactive = !!op.interactive;
      entry.interactable = null as any; // Reset so setupInteraction rewires fresh
      entry.obj.enabled = true;
      entry.obj.name = "MT_" + id;
    } else {
      entry = this.buildNewQuad(id, op.w || 220, op.h || 48, op.layer !== undefined ? op.layer : 0);
      entry.interactive = !!op.interactive;
    }

    // Parent to group if provided
    const groupId = (op.group as string) || null;
    if (groupId) {
      const groupObj = this.ensureGroup(groupId);
      entry.obj.setParent(groupObj);
      entry.groupId = groupId;
    } else {
      entry.obj.setParent(this.quadParent);
      entry.groupId = null;
    }

    // Position - use explicit z if provided, else derive from layer
    const x = (op.x !== undefined ? op.x : 0) as number;
    const y = (op.y !== undefined ? op.y : 0) as number;
    const z = op.z !== undefined ? (op.z as number) : (LAYER_Z[entry.layer] !== undefined ? LAYER_Z[entry.layer] : 0.05);
    entry.obj.getTransform().setLocalPosition(new vec3(x, y, z));

    // Scale based on pixel dimensions and pixelsPerCm
    const widthCm = entry.w / this.pixelsPerCm;
    const heightCm = entry.h / this.pixelsPerCm;
    const s = (op.s !== undefined ? op.s : (op.scale !== undefined ? op.scale : 1)) as number;
    entry.obj.getTransform().setLocalScale(new vec3(widthCm * s, heightCm * s, 1));

    this.quads.set(id, entry);

    print("[TilePanel] + " + id + " at (" + x.toFixed(1) + "," + y.toFixed(1) + "," + z.toFixed(2) + ") " + widthCm.toFixed(1) + "x" + heightCm.toFixed(1) + "cm");

    // Check for buffered texture - apply immediately if one was waiting
    const buffered = this.bufferedTextures.get(id);
    if (buffered) {
      this.bufferedTextures.delete(id);
      this.applyTexture(entry, buffered);
      print("[TilePanel]   -> applied buffered texture for " + id);
    }

    this.updatePanelColliderBounds();
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

    // No per-tile collider. All interaction goes through the single panel
    // collider (buildPanelInteractor) which does AABB hit-testing in code.
    // Per-tile colliders would block the panel raycast.

    return {
      id,
      obj,
      rmv,
      material: mat,
      colliderObj: null as any,
      interactable: null as any,
      layer,
      w,
      h,
      groupId: null,
      interactive: false,
      unsubscribes: [],
      currentTexture: null,
      texDecoding: false,
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
      entry.interactable.onHoverEnter((e: InteractorEvent) => {
        const hit = this.hitToLocal(entry, e);
        this.sendInteraction(id, "hover", hit);
      })
    );

    entry.unsubscribes.push(
      entry.interactable.onHoverUpdate((e: InteractorEvent) => {
        const hit = this.hitToLocal(entry, e);
        this.sendInteraction(id, "hover_move", hit);
      })
    );

    entry.unsubscribes.push(
      entry.interactable.onHoverExit(() => {
        this.sendInteraction(id, "hover_exit", null);
      })
    );

    entry.unsubscribes.push(
      entry.interactable.onTriggerStart((e: InteractorEvent) => {
        const hit = this.hitToLocal(entry, e);
        this.sendInteraction(id, "tap", hit);
      })
    );
  }

  private hitToLocal(entry: QuadEntry, e: InteractorEvent): { x: number; y: number; u: number; v: number } | null {
    const worldPos = e.interactor?.targetHitInfo?.hit?.position;
    if (!worldPos) return null;

    // Cursor position in panel-local coordinates (cm)
    const localPanel = this.quadParent.getTransform().getInvertedWorldTransform().multiplyPoint(worldPos);

    // UV within the quad collider (0..1)
    const localQuad = entry.colliderObj.getTransform().getInvertedWorldTransform().multiplyPoint(worldPos);
    const u = Math.max(0, Math.min(1, localQuad.x + 0.5));
    const v = Math.max(0, Math.min(1, 1.0 - (localQuad.y + 0.5)));

    return { x: localPanel.x, y: localPanel.y, u, v };
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
    print("[TilePanel] - " + id + " (live:" + this.quads.size + " pool:" + this.quadPool.length + ")");
    this.updatePanelColliderBounds();
  }

  // ---- Group CRUD ----

  private ensureGroup(id: string): SceneObject {
    const existing = this.groups.get(id);
    if (existing) return existing;
    const groupObj = global.scene.createSceneObject("MTG_" + id);
    groupObj.setParent(this.quadParent);
    groupObj.layer = this.sceneObject.layer;
    groupObj.getTransform().setLocalPosition(vec3.zero());
    this.groups.set(id, groupObj);
    return groupObj;
  }

  private createGroup(op: any) {
    const id = op.id as string;
    if (!id) return;
    const groupObj = this.ensureGroup(id);
    const x = (op.x !== undefined ? op.x : 0) as number;
    const y = (op.y !== undefined ? op.y : 0) as number;
    const z = (op.z !== undefined ? op.z : 0) as number;
    groupObj.getTransform().setLocalPosition(new vec3(x, y, z));
    groupObj.enabled = op.visible !== false;
    this.updatePanelColliderBounds();
  }

  private destroyGroup(id: string) {
    const groupObj = this.groups.get(id);
    if (!groupObj) return;
    for (const [qid, entry] of this.quads) {
      if (entry.groupId === id) {
        this.destroyQuad(qid);
      }
    }
    groupObj.destroy();
    this.groups.delete(id);
    this.updatePanelColliderBounds();
  }

  private setVisibility(id: string, visible: boolean) {
    const entry = this.quads.get(id);
    if (!entry) return;
    entry.obj.enabled = visible;
  }

  private moveQuad(op: any) {
    const entry = this.quads.get(op.id);
    if (!entry) return;

    const x = (op.x !== undefined ? op.x : 0) as number;
    const y = (op.y !== undefined ? op.y : 0) as number;
    const z = op.z !== undefined ? (op.z as number) : entry.obj.getTransform().getLocalPosition().z;
    entry.obj.getTransform().setLocalPosition(new vec3(x, y, z));

    // Update scale if dimensions changed
    if (op.w !== undefined || op.h !== undefined) {
      const w = (op.w !== undefined ? op.w : entry.w) as number;
      const h = (op.h !== undefined ? op.h : entry.h) as number;
      entry.w = w;
      entry.h = h;
      const s = (op.s !== undefined ? op.s : (op.scale !== undefined ? op.scale : 1)) as number;
      entry.obj.getTransform().setLocalScale(new vec3(w / this.pixelsPerCm * s, h / this.pixelsPerCm * s, 1));
    }

    this.updatePanelColliderBounds();
  }

  private moveGroup(op: any) {
    const groupObj = this.groups.get(op.id);
    if (!groupObj) return;

    const x = (op.x !== undefined ? op.x : 0) as number;
    const y = (op.y !== undefined ? op.y : 0) as number;
    const z = (op.z !== undefined ? op.z : 0) as number;
    groupObj.getTransform().setLocalPosition(new vec3(x, y, z));

    if (op.visible !== undefined) {
      groupObj.enabled = op.visible as boolean;
    }

    this.updatePanelColliderBounds();
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
    let entry = this.quads.get(id);

    if (!entry) {
      // Auto-create quad if tex arrives before create op (race condition).
      // Use payload dimensions if available, otherwise use defaults.
      const w = (payload.w as number) || 220;
      const h = (payload.h as number) || 48;
      print("[TilePanel] Auto-creating quad for tex: " + id + " (" + w + "x" + h + ")");
      this.createQuad({ op: "create", id: id, w: w, h: h, x: 0, y: 0, layer: 0 });
      entry = this.quads.get(id);
      if (!entry) return;
    }

    this.applyTexture(entry, payload.image);
  }

  /**
   * Decode a base64 JPEG and apply to a quad's material.
   * Destroys the previous texture to prevent GPU memory leaks.
   */
  private applyTexture(entry: QuadEntry, base64Image: string) {
    // Guard: skip if previous decode hasn't finished (prevents queue buildup)
    if (entry.texDecoding) return;
    entry.texDecoding = true;

    Base64.decodeTextureAsync(
      base64Image,
      (texture: Texture) => {
        entry.texDecoding = false;
        // Just overwrite — don't call destroy(). The stable version (Feb 8-9)
        // never destroyed textures and ran fine on device. Calling destroy()
        // may crash the Spectacles runtime.
        entry.material.mainPass["baseTex"] = texture;
        entry.currentTexture = texture;
      },
      () => {
        entry.texDecoding = false;
        print("[TilePanel] Failed to decode texture for " + entry.id);
      }
    );
  }

  // ---- Interaction ----

  private sendInteraction(id: string, type: string, hit: { x: number; y: number; u: number; v: number } | null) {
    if (!this.receiver) return;
    this.receiver.sendEvent("interact", {
      id: id,
      type: type,
      x: hit ? hit.x : undefined,
      y: hit ? hit.y : undefined,
      u: hit ? hit.u : undefined,
      v: hit ? hit.v : undefined,
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
      print("[TilePanel] onScene: " + JSON.stringify(payload).substring(0, 100));
      this.handleSceneEvent(payload);
    });

    receiver.onTex((payload: any) => {
      this.realtimeTexReceived = true; // Realtime path works, skip HTTP tex
      const id = payload?.id ?? "?";
      const imgLen = payload?.image?.length ?? 0;
      print("[TilePanel] onTex: id=" + id + " imgLen=" + imgLen);
      this.handleTexEvent(payload);
    });

    receiver.onCursor((_payload: any) => {
      // Cursor rendering disabled (avoid white square). We still use cursor data on web.
      return;
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

    // Camera pose broadcast (to web)
    const camEvent = this.createEvent("UpdateEvent");
    camEvent.bind(() => {
      const now = Date.now();
      if (now - this.lastCameraSend < 100) return; // 10fps
      this.lastCameraSend = now;
      if (!this.cameraObj || !this.receiver) return;

      const camT = this.cameraObj.getTransform();
      const worldPos = camT.getWorldPosition();
      const localPos = this.quadParent.getTransform().getInvertedWorldTransform().multiplyPoint(worldPos);

      this.receiver.sendEvent("camera", {
        x: localPos.x,
        y: localPos.y,
        z: localPos.z,
        wx: worldPos.x,
        wy: worldPos.y,
        wz: worldPos.z,
        ts: now,
      });
    });

    print("[TilePanel] Receiver attached");
    return receiver;
  }

  // ---- HTTP Bridge (editor preview fallback) ----

  /**
   * Start HTTP polling against the spectacles-bridge server.
   * Uses InternetModule.fetch() which works in LS preview (unlike WebSocket).
   */
  private startHttpBridge() {
    try {
      this.internetModule = require('LensStudio:InternetModule') as InternetModule;
    } catch (e) {
      print("[TilePanel] ERROR: Could not load InternetModule: " + e);
      return;
    }

    this.httpPolling = true;
    const bridgeUrl = this.httpBridgeUrl.replace(/\/$/, ""); // strip trailing slash
    print("[TilePanel] HTTP bridge polling: " + bridgeUrl);

    const pollEvent = this.createEvent("UpdateEvent");
    let lastPoll = 0;

    pollEvent.bind(() => {
      const now = Date.now();
      if (now - lastPoll < 300) return; // ~3fps polling
      if (this.httpPollBusy) return; // skip if previous poll still in-flight
      if (now < this.httpBackoffUntil) return; // backoff after failures
      lastPoll = now;
      this.httpPollBusy = true;
      this.httpPollCount++;

      this.httpPollOnce(bridgeUrl);
    });
  }

  /**
   * Single poll cycle: fetch scene ops and textures from bridge.
   */
  private async httpPollOnce(bridgeUrl: string) {
    try {
      // Poll scene ops
      const sceneRes = await this.internetModule.fetch(
        bridgeUrl + "/scene",
        { method: "GET" }
      );
      const sceneText = await sceneRes.text();
      const sceneData = JSON.parse(sceneText);

      // Reset backoff on successful connection
      if (this.httpFailCount > 0) {
        print("[TilePanel] HTTP bridge reconnected after " + this.httpFailCount + " failures");
        this.httpFailCount = 0;
        this.httpBackoffUntil = 0;
      }

      if (sceneData.version > this.httpLastSceneVersion) {
        this.httpLastSceneVersion = sceneData.version;
        print("[TilePanel] HTTP scene v" + sceneData.version + " (" + (sceneData.ops?.length || 0) + " ops)");
        this.handleSceneEvent(sceneData);
      }

      // Poll tile textures (incremental) — skip if Realtime is already delivering
      if (!this.realtimeTexReceived) {
        const texRes = await this.internetModule.fetch(
          bridgeUrl + "/textures?since=" + this.httpLastTexVersion,
          { method: "GET" }
        );
        const texText = await texRes.text();
        const texData = JSON.parse(texText);

        if (texData.tiles && texData.tiles.length > 0) {
          for (const tile of texData.tiles) {
            this.handleTexEvent(tile);
          }
          this.httpLastTexVersion = texData.version;

          if (this.httpPollCount % 10 === 0) {
            print("[TilePanel] HTTP tex v" + texData.version + " (" + texData.tiles.length + " tiles updated)");
          }
        }
      }
    } catch (e) {
      this.httpFailCount++;
      // Exponential backoff: 1s, 2s, 4s, 8s, max 15s
      const backoff = Math.min(15000, 1000 * Math.pow(2, Math.min(this.httpFailCount - 1, 4)));
      this.httpBackoffUntil = Date.now() + backoff;
      if (this.httpFailCount <= 3 || this.httpFailCount % 10 === 0) {
        print("[TilePanel] HTTP poll error (fail #" + this.httpFailCount + ", backoff " + (backoff / 1000) + "s): " + e);
      }
    }

    this.httpPollBusy = false;
  }


  // ---- Cleanup ----

  private cleanup() {
    for (const [id] of this.quads) {
      this.destroyQuad(id);
    }
    for (const [id] of this.groups) {
      this.destroyGroup(id);
    }
    for (const unsub of this.panelUnsubscribes) {
      unsub();
    }
    this.panelUnsubscribes = [];
    for (const entry of this.quadPool) {
      entry.obj.destroy();
    }
    this.quadPool = [];
    this.bufferedTextures.clear();
    print("[TilePanel] Cleaned up");
  }

  private hideCursor() {
    if (!this.cursorObj) return;
    if (this.cursorVisible) {
      this.cursorObj.enabled = false;
      this.cursorVisible = false;
    }
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

  public getLastHitId(): string | null {
    return this.lastHitId;
  }
}
