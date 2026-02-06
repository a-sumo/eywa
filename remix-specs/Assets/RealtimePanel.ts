/**
 * RealtimePanel.ts
 *
 * Creates a grid of quads (cols x rows), each with its own cloned material
 * for independent texture updates. One RealtimeTextureReceiver handles all
 * tile events and routes them to the correct quad's material.
 *
 * Interaction uses a single Interactable on the parent. Hit position is
 * decomposed into { col, row, u, v } (which tile + local UV within tile).
 *
 * Tile positions are sent with each broadcast so the web/Gemini can
 * reposition tiles at runtime.
 */

import { SnapCloudRequirements } from './SnapCloudRequirements';
import { RealtimeTextureReceiver } from './RealtimeTextureReceiver';
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";

@component
export class RealtimePanel extends BaseScriptComponent {
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
  @hint("Grid columns")
  public gridCols: number = 3;

  @input
  @hint("Grid rows")
  public gridRows: number = 2;

  @input
  @hint("Individual tile size in cm (14 recommended, see SPECTACLES_ERGONOMICS.md)")
  public tileSize: number = 14;

  @input
  @hint("Gap between tiles in cm")
  public tileGap: number = 1.5;

  @input
  @hint("Position offset from parent (center of grid)")
  public positionOffset: vec3 = vec3.zero();

  @input
  @hint("Material for the quads. Create an Unlit material in Asset Browser.")
  public material: Material;

  @input
  @hint("Show debug status text")
  public showStatus: boolean = true;

  // Grid of quad objects and their materials
  private quads: SceneObject[][] = [];
  private materials: Material[][] = [];
  private gridParent: SceneObject;
  private receiver: RealtimeTextureReceiver;
  private interactable: Interactable;
  private unsubscribes: (() => void)[] = [];
  private resolvedDeviceId: string = "";

  // Local cursor overlay (zero-latency, follows hit position directly)
  private cursorObj: SceneObject;
  private cursorVisible: boolean = false;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.init());
    this.createEvent("OnDestroyEvent").bind(() => {
      this.unsubscribes.forEach((fn) => fn());
    });
  }

  private init() {
    // Auto-generate device ID if not manually set
    this.resolvedDeviceId = this.deviceId || this.generateDeviceId();

    print("[RealtimePanel] Initializing " + this.gridCols + "x" + this.gridRows + " tile grid, device: " + this.resolvedDeviceId);

    this.gridParent = global.scene.createSceneObject("TileGrid");
    this.gridParent.setParent(this.sceneObject);
    this.gridParent.getTransform().setLocalPosition(this.positionOffset);

    this.buildGrid();
    this.buildCursor();
    this.receiver = this.attachReceiver();
    this.setupInteraction();

    print("[RealtimePanel] Ready! Channel: spectacles:" + this.channelName + ":" + this.resolvedDeviceId);
  }

  private generateDeviceId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "specs-";
    for (let i = 0; i < 4; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  private buildGrid() {
    const totalW = this.gridCols * this.tileSize + (this.gridCols - 1) * this.tileGap;
    const totalH = this.gridRows * this.tileSize + (this.gridRows - 1) * this.tileGap;

    for (let row = 0; row < this.gridRows; row++) {
      this.quads[row] = [];
      this.materials[row] = [];

      for (let col = 0; col < this.gridCols; col++) {
        const obj = this.buildQuad(col, row, totalW, totalH);
        this.quads[row][col] = obj;
      }
    }

    // Single collider spanning the full grid for interaction
    const colliderObj = global.scene.createSceneObject("GridCollider");
    colliderObj.setParent(this.gridParent);
    colliderObj.getTransform().setLocalPosition(vec3.zero());
    colliderObj.getTransform().setLocalScale(new vec3(totalW, totalH, 1));

    const rmv = colliderObj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
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
    rmv.mesh = builder.getMesh();
    builder.updateMesh();

    // Make collider mesh invisible
    rmv.enabled = false;

    const collider = colliderObj.createComponent("Physics.ColliderComponent") as ColliderComponent;
    const shape = Shape.createBoxShape();
    shape.size = new vec3(1, 1, 0.01);
    collider.shape = shape;

    // Store ref for interaction
    (this as any)._colliderObj = colliderObj;
    (this as any)._totalW = totalW;
    (this as any)._totalH = totalH;
  }

  private buildQuad(col: number, row: number, totalW: number, totalH: number): SceneObject {
    const obj = global.scene.createSceneObject("Tile_" + col + "_" + row);
    obj.setParent(this.gridParent);

    // Position: center each tile in the grid
    // Grid origin is center, so offset from top-left
    const x = -totalW / 2 + col * (this.tileSize + this.tileGap) + this.tileSize / 2;
    const y = totalH / 2 - row * (this.tileSize + this.tileGap) - this.tileSize / 2; // Y up, row 0 at top

    const transform = obj.getTransform();
    transform.setLocalPosition(new vec3(x, y, 0.01)); // slight Z offset in front of collider
    transform.setLocalRotation(quat.quatIdentity());
    transform.setLocalScale(new vec3(this.tileSize, this.tileSize, 1));

    const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;

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

    rmv.mesh = builder.getMesh();
    builder.updateMesh();

    // Clone material for this tile
    if (this.material) {
      const mat = this.material.clone();
      rmv.mainMaterial = mat;
      this.materials[row][col] = mat;
    } else {
      print("[RealtimePanel] WARNING: No material assigned for tile " + col + "," + row);
    }

    print("[RealtimePanel] Tile (" + col + "," + row + ") at (" + x.toFixed(1) + ", " + y.toFixed(1) + ") " + this.tileSize + "cm");
    return obj;
  }

  /**
   * Build a small glowing cursor dot that hovers in front of the tile grid.
   * This renders locally with zero network latency.
   */
  private buildCursor() {
    this.cursorObj = global.scene.createSceneObject("Cursor");
    this.cursorObj.setParent(this.gridParent);

    const cursorSize = 1.2; // 1.2 cm diameter
    const transform = this.cursorObj.getTransform();
    transform.setLocalScale(new vec3(cursorSize, cursorSize, 1));
    transform.setLocalPosition(new vec3(0, 0, 0.5)); // in front of tiles

    const rmv = this.cursorObj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;

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

    rmv.mesh = builder.getMesh();
    builder.updateMesh();

    // Clone and tint the material for the cursor (bright cyan glow)
    if (this.material) {
      const mat = this.material.clone();
      mat.mainPass["baseColor"] = new vec4(0.08, 0.82, 1.0, 0.8); // #15D1FF with slight transparency
      rmv.mainMaterial = mat;
    }

    // Start hidden
    this.cursorObj.enabled = false;
    this.cursorVisible = false;

    print("[RealtimePanel] Cursor overlay created");
  }

  /**
   * Move the cursor to a world position on the grid. Called from local
   * interaction handlers for zero-latency feedback.
   */
  private moveCursor(worldPos: vec3) {
    if (!this.cursorObj) return;

    // Convert world pos to grid-local, keep Z in front of tiles
    const localPos = this.gridParent.getTransform().getInvertedWorldTransform().multiplyPoint(worldPos);
    this.cursorObj.getTransform().setLocalPosition(new vec3(localPos.x, localPos.y, 0.5));

    if (!this.cursorVisible) {
      this.cursorObj.enabled = true;
      this.cursorVisible = true;
    }
  }

  private hideCursor() {
    if (!this.cursorObj) return;
    if (this.cursorVisible) {
      this.cursorObj.enabled = false;
      this.cursorVisible = false;
    }
  }

  private setupInteraction() {
    const colliderObj = (this as any)._colliderObj as SceneObject;

    this.interactable = colliderObj.getComponent(Interactable.getTypeName()) as Interactable;
    if (!this.interactable) {
      this.interactable = colliderObj.createComponent(Interactable.getTypeName()) as Interactable;
    }

    this.unsubscribes.push(
      this.interactable.onHoverEnter((e: InteractorEvent) => {
        const worldPos = e.interactor?.targetHitInfo?.hit?.position;
        if (worldPos) this.moveCursor(worldPos);
        const hit = this.hitToTile(e);
        if (hit) this.sendInteraction("pointer_move", hit);
      })
    );

    this.unsubscribes.push(
      this.interactable.onHoverUpdate((e: InteractorEvent) => {
        const worldPos = e.interactor?.targetHitInfo?.hit?.position;
        if (worldPos) this.moveCursor(worldPos);
        const hit = this.hitToTile(e);
        if (hit) this.sendInteraction("pointer_move", hit);
      })
    );

    this.unsubscribes.push(
      this.interactable.onHoverExit(() => {
        this.hideCursor();
        this.sendInteraction("pointer_exit", { col: 0, row: 0, u: 0, v: 0 });
      })
    );

    this.unsubscribes.push(
      this.interactable.onTriggerStart((e: InteractorEvent) => {
        const hit = this.hitToTile(e);
        if (hit) this.sendInteraction("pointer_down", hit);
      })
    );

    this.unsubscribes.push(
      this.interactable.onTriggerEnd((e: InteractorEvent) => {
        const hit = this.hitToTile(e);
        if (hit) this.sendInteraction("pointer_up", hit);
      })
    );

    print("[RealtimePanel] Interaction ready on grid collider");
  }

  /**
   * Convert a hit event on the grid collider to tile coordinates.
   * Returns { col, row, u, v } where u,v are local within that tile.
   */
  private hitToTile(e: InteractorEvent): { col: number; row: number; u: number; v: number } | null {
    const worldPos = e.interactor?.targetHitInfo?.hit?.position;
    if (!worldPos) return null;

    const colliderObj = (this as any)._colliderObj as SceneObject;
    const localPos = colliderObj.getTransform().getInvertedWorldTransform().multiplyPoint(worldPos);

    // localPos is in unit space of the collider (-0.5 to 0.5)
    // Convert to grid UV (0,0 = top-left, 1,1 = bottom-right)
    const gridU = localPos.x + 0.5;
    const gridV = 1.0 - (localPos.y + 0.5); // flip Y: top = 0

    // Which tile?
    const totalW = (this as any)._totalW as number;
    const totalH = (this as any)._totalH as number;

    const px = gridU * totalW;
    const py = gridV * totalH;

    const col = Math.floor(px / (this.tileSize + this.tileGap));
    const row = Math.floor(py / (this.tileSize + this.tileGap));

    if (col < 0 || col >= this.gridCols || row < 0 || row >= this.gridRows) return null;

    // Local UV within the tile
    const tileStartX = col * (this.tileSize + this.tileGap);
    const tileStartY = row * (this.tileSize + this.tileGap);
    const u = Math.max(0, Math.min(1, (px - tileStartX) / this.tileSize));
    const v = Math.max(0, Math.min(1, (py - tileStartY) / this.tileSize));

    return { col, row, u, v };
  }

  private sendInteraction(type: string, hit: { col: number; row: number; u: number; v: number }) {
    if (!this.receiver) return;
    this.receiver.sendEvent("interaction", {
      type: type,
      col: hit.col,
      row: hit.row,
      u: hit.u,
      v: hit.v,
      timestamp: Date.now(),
    });
  }

  private attachReceiver(): RealtimeTextureReceiver {
    let statusText: Text | null = null;

    if (this.showStatus) {
      const statusObj = global.scene.createSceneObject("StatusText");
      statusObj.setParent(this.sceneObject);
      const totalH = (this as any)._totalH as number;
      statusObj.getTransform().setLocalPosition(new vec3(0, totalH / 2 + 3, 0));
      statusText = statusObj.createComponent("Component.Text") as Text;
      statusText.text = "Connecting...";
      statusText.size = 2;
    }

    // Create receiver on grid parent, pass it our materials grid
    const receiver = this.gridParent.createComponent(
      RealtimeTextureReceiver.getTypeName()
    ) as RealtimeTextureReceiver;

    (receiver as any).snapCloudRequirements = this.snapCloudRequirements;
    (receiver as any).channelName = this.channelName + ":" + this.resolvedDeviceId;
    (receiver as any).lobbyChannelName = this.channelName;
    (receiver as any).deviceId = this.resolvedDeviceId;
    (receiver as any).gridCols = this.gridCols;
    (receiver as any).gridRows = this.gridRows;
    if (statusText) {
      (receiver as any).statusText = statusText;
    }

    // Pass materials grid to receiver
    receiver.setMaterialsGrid(this.materials);

    // Wire up web-originated cursor events to the local cursor overlay
    receiver.onCursor((payload: any) => {
      if (!payload || payload.col < 0) {
        this.hideCursor();
        return;
      }
      // Convert tile col,row + local u,v to grid-local position
      const totalW = (this as any)._totalW as number;
      const totalH = (this as any)._totalH as number;

      const tileStartX = payload.col * (this.tileSize + this.tileGap);
      const tileStartY = payload.row * (this.tileSize + this.tileGap);
      const px = tileStartX + payload.u * this.tileSize;
      const py = tileStartY + payload.v * this.tileSize;

      // Convert pixel coords to grid-local centered coords
      const x = -totalW / 2 + px;
      const y = totalH / 2 - py;

      this.cursorObj.getTransform().setLocalPosition(new vec3(x, y, 0.5));
      if (!this.cursorVisible) {
        this.cursorObj.enabled = true;
        this.cursorVisible = true;
      }
    });

    print("[RealtimePanel] Receiver attached with " + this.gridCols + "x" + this.gridRows + " material grid");
    return receiver;
  }

  public getReceiver(): RealtimeTextureReceiver {
    return this.receiver;
  }

  public isConnected(): boolean {
    return this.receiver ? this.receiver.isConnected() : false;
  }

  /** Get world position of a specific tile (for external positioning) */
  public getTileWorldPosition(col: number, row: number): vec3 | null {
    if (row < 0 || row >= this.gridRows || col < 0 || col >= this.gridCols) return null;
    return this.quads[row][col].getTransform().getWorldPosition();
  }

  /** Move a specific tile to a new local position (for Gemini-driven layout) */
  public moveTile(col: number, row: number, localPos: vec3) {
    if (row < 0 || row >= this.gridRows || col < 0 || col >= this.gridCols) return;
    this.quads[row][col].getTransform().setLocalPosition(localPos);
  }

  /** Get grid dimensions for external use */
  public getGridInfo(): { cols: number; rows: number; tileSize: number; tileGap: number } {
    return {
      cols: this.gridCols,
      rows: this.gridRows,
      tileSize: this.tileSize,
      tileGap: this.tileGap,
    };
  }
}
