/**
 * RealtimeTextureReceiver.ts
 *
 * Receives realtime texture updates via Supabase broadcast and applies them
 * to materials. Supports two modes:
 *
 * 1. Single-quad mode (legacy): listens for "frame" events, applies texture
 *    to whatever visual component is on this object.
 *
 * 2. Tile-grid mode: listens for "tile" events with { col, row, image },
 *    routes each tile to the correct material in a materials[row][col] grid.
 *    The grid is set by RealtimePanel via setMaterialsGrid().
 */

import { SnapCloudRequirements } from './SnapCloudRequirements';

import {
  RealtimeChannel,
  SupabaseClient,
  createClient,
} from "SupabaseClient.lspkg/supabase-snapcloud";

@component
export class RealtimeTextureReceiver extends BaseScriptComponent {

  @input
  @allowUndefined
  @hint("Reference to SnapCloudRequirements for Supabase config")
  public snapCloudRequirements: SnapCloudRequirements;

  @input
  @allowUndefined
  @hint("Channel name - typically your room slug")
  public channelName: string = "demo";

  @input
  @allowUndefined
  @hint("Optional Text component to display connection status")
  public statusText: Text;

  @input
  @hint("Grid columns (set by RealtimePanel, 0 = single-quad mode)")
  public gridCols: number = 0;

  @input
  @hint("Grid rows (set by RealtimePanel)")
  public gridRows: number = 0;

  @input
  @allowUndefined
  @hint("Lobby channel name for auto-discovery (set by RealtimePanel)")
  public lobbyChannelName: string = "";

  @input
  @allowUndefined
  @hint("Device ID for lobby announcements (set by RealtimePanel)")
  public deviceId: string = "";

  @input
  @hint("Show debug info in console")
  public enableDebugLogs: boolean = true;

  @input
  @hint("Log frame reception every N frames")
  @widget(new SliderWidget(1, 50, 1))
  public logFrequency: number = 10;

  private client: SupabaseClient;
  private realtimeChannel: RealtimeChannel;
  private lobbyChannel: RealtimeChannel;
  private singleMaterial: Material; // for single-quad mode
  private materialsGrid: Material[][] = []; // for tile-grid mode
  private tileMaterials: Map<string, Material> = new Map(); // for tile mode (keyed by tile ID)
  private frameCount: number = 0;
  private tileUpdateCounts: Map<string, number> = new Map();
  private lastFrameTime: number = 0;
  private connectionStatus: string = "disconnected";
  private heartbeatEvent: any = null;
  private onCursorCallback: ((payload: any) => void) | null = null;
  private onSceneCallback: ((payload: any) => void) | null = null;
  private onTexCallback: ((payload: any) => void) | null = null;

  onAwake() {
    this.log("awakening...");
    this.createEvent("OnStartEvent").bind(() => this.start());
    this.createEvent("OnDestroyEvent").bind(() => this.cleanup());
  }

  /**
   * Set the materials grid for tile-based rendering.
   * Called by RealtimePanel after creating all quads.
   */
  public setMaterialsGrid(grid: Material[][]) {
    this.materialsGrid = grid;
    this.log("Materials grid set: " + grid.length + " rows");
  }

  private start(): void {
    const hasCallbacks = this.onTexCallback !== null || this.onSceneCallback !== null;
    const hasGrid = this.gridCols > 0 && this.gridRows > 0;

    this.log("start() - channel: " + this.channelName
      + " | grid: " + this.gridCols + "x" + this.gridRows
      + " | callbacks: " + hasCallbacks
      + " | snapCloud: " + (this.snapCloudRequirements ? "yes" : "no"));

    if (hasCallbacks) {
      // Relay mode: TilePanel manages quads and materials. Just connect.
      this.log("Relay mode (forwarding to callbacks)");
    } else if (hasGrid) {
      // Grid mode: RealtimePanel set the materials grid.
      this.log("Grid mode (" + this.gridCols + "x" + this.gridRows + ")");
    } else {
      // Single-quad mode: need a material on this object.
      this.singleMaterial = this.findAndCloneMaterial();
      if (!this.singleMaterial) {
        this.log("Single-quad mode but no material found. Will still connect.");
      }
    }

    this.initializeSupabase();
  }

  private findAndCloneMaterial(): Material | null {
    const image = this.sceneObject.getComponent("Component.Image") as Image;
    if (image && image.mainMaterial) {
      const mat = image.mainMaterial.clone();
      image.mainMaterial = mat;
      this.log("Using Image component");
      return mat;
    }

    const rmv = this.sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (rmv && rmv.mainMaterial) {
      const mat = rmv.mainMaterial.clone();
      rmv.mainMaterial = mat;
      this.log("Using RenderMeshVisual");
      return mat;
    }

    return null;
  }

  private async initializeSupabase() {
    if (!this.snapCloudRequirements || !this.snapCloudRequirements.isConfigured()) {
      this.log("SnapCloudRequirements not configured");
      this.updateStatus("error: no config");
      return;
    }

    try {
      this.updateStatus("connecting");

      const url = this.snapCloudRequirements.getSupabaseUrl();
      const key = this.snapCloudRequirements.getSupabasePublicToken();
      this.log("Supabase URL: " + url);
      this.log("Supabase key: " + key.substring(0, 20) + "...");

      this.client = createClient(url, key);

      if (!this.client) {
        this.log("Failed to create Supabase client");
        this.updateStatus("error: client");
        return;
      }

      // Auth is optional for broadcast channels. Try Snapchat SSO
      // (works on device), but proceed regardless if it fails (editor/preview).
      try {
        await this.client.auth.signInWithIdToken({
          provider: "snapchat",
          token: "spectacles-auth-token"
        });
        this.log("Auth succeeded (Snapchat SSO)");
      } catch (authErr) {
        this.log("Auth skipped (broadcast does not require auth): " + authErr);
      }

      await this.subscribeToChannel();
      await this.joinLobby();
      this.log("Realtime initialized");

    } catch (error) {
      this.log("Init error: " + error);
      this.updateStatus("error: init");
    }
  }

  private async subscribeToChannel() {
    const channelKey = "spectacles:" + this.channelName;
    this.log("Subscribing to: " + channelKey);

    this.realtimeChannel = this.client.channel(channelKey, {
      config: { broadcast: { self: false, ack: false } }
    });

    // Listen for tile events (grid format)
    this.realtimeChannel.on("broadcast", { event: "tile" }, (msg) => {
      this.log(">> tile event received");
      this.onTile(msg.payload);
    });

    // Listen for frame events (legacy single-quad format)
    this.realtimeChannel.on("broadcast", { event: "frame" }, (msg) => {
      this.log(">> frame event received");
      this.onFrame(msg.payload);
    });

    // Listen for cursor position from web (lightweight JSON, no texture)
    this.realtimeChannel.on("broadcast", { event: "cursor" }, (msg) => {
      if (this.onCursorCallback) {
        this.onCursorCallback(msg.payload);
      }
    });

    // Micro-tile protocol: scene ops (create/move/destroy quads)
    this.realtimeChannel.on("broadcast", { event: "scene" }, (msg) => {
      this.log(">> scene event: " + JSON.stringify(msg.payload).substring(0, 120));
      if (this.onSceneCallback) {
        this.onSceneCallback(msg.payload);
      }
    });

    // Micro-tile protocol: texture updates (JPEG base64 by tile ID)
    this.realtimeChannel.on("broadcast", { event: "tex" }, (msg) => {
      this.onMicroTex(msg.payload);
    });

    // Batched texture updates (multiple tiles in one message, less network overhead)
    this.realtimeChannel.on("broadcast", { event: "tex_batch" }, (msg) => {
      const textures = msg.payload?.textures;
      if (!textures || !Array.isArray(textures)) return;
      for (const tex of textures) {
        this.onMicroTex(tex);
      }
    });

    this.realtimeChannel.subscribe((status) => {
      this.log("Channel status: " + status + " (key: " + channelKey + ")");
      if (status === "SUBSCRIBED") {
        this.updateStatus("connected");
        this.log("SUCCESS: Subscribed to " + channelKey + ". Waiting for events...");
        // Ask the web to resync all tiles. Handles the case where the web
        // was already broadcasting before we connected.
        this.realtimeChannel.send({
          type: "broadcast",
          event: "sync_request",
          payload: { deviceId: this.deviceId, timestamp: Date.now() },
        });
        this.log("Sent sync_request to web");
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        this.updateStatus("error: " + status.toLowerCase());
        this.log("FAILED: Channel " + channelKey + " status: " + status);
      }
    });
  }

  /**
   * Join the lobby channel and announce this device.
   * Sends a heartbeat every 10s so the web renderer knows we're alive.
   */
  private async joinLobby() {
    if (!this.lobbyChannelName || !this.deviceId) return;

    const lobbyKey = "spectacles:" + this.lobbyChannelName + ":lobby";
    this.log("Joining lobby: " + lobbyKey);

    this.lobbyChannel = this.client.channel(lobbyKey, {
      config: { broadcast: { self: false, ack: false } }
    });

    this.lobbyChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        this.log("Lobby joined, announcing device: " + this.deviceId);
        this.announceLobby("device_connect");
        this.startHeartbeat();
      }
    });
  }

  private announceLobby(event: string) {
    if (!this.lobbyChannel) return;
    this.lobbyChannel.send({
      type: "broadcast",
      event: event,
      payload: {
        deviceId: this.deviceId,
        channelName: this.channelName,
        gridCols: this.gridCols,
        gridRows: this.gridRows,
        timestamp: Date.now(),
      },
    });
  }

  private startHeartbeat() {
    // Send heartbeat every 10 seconds
    this.heartbeatEvent = this.createEvent("UpdateEvent");
    let lastBeat = 0;
    this.heartbeatEvent.bind(() => {
      const now = Date.now();
      if (now - lastBeat >= 10000) {
        this.announceLobby("device_heartbeat");
        lastBeat = now;
      }
    });
  }

  /**
   * Handle a tile update event.
   * Payload: { col: number, row: number, image: string }
   */
  private onTile(payload: any) {
    if (!payload || !payload.image || payload.col === undefined || payload.row === undefined) return;

    const col = payload.col as number;
    const row = payload.row as number;

    if (row < 0 || row >= this.materialsGrid.length) return;
    if (col < 0 || col >= (this.materialsGrid[row]?.length ?? 0)) return;

    const material = this.materialsGrid[row][col];
    if (!material) return;

    this.frameCount++;
    this.lastFrameTime = Date.now();

    const key = col + "," + row;
    this.tileUpdateCounts.set(key, (this.tileUpdateCounts.get(key) ?? 0) + 1);

    if (this.frameCount % this.logFrequency === 0) {
      this.log("Tile (" + col + "," + row + ") #" + this.frameCount);
    }

    this.applyTextureToMaterial(payload.image, material, col, row);
    this.updateStatus("tiles (" + this.frameCount + ")");
  }

  /**
   * Handle a legacy single-frame update.
   */
  private onFrame(payload: any) {
    if (!payload || !payload.image) return;

    this.frameCount++;
    this.lastFrameTime = Date.now();

    if (this.frameCount % this.logFrequency === 0) {
      this.log("Frame #" + this.frameCount);
    }

    if (this.singleMaterial) {
      this.applyTextureToMaterial(payload.image, this.singleMaterial, -1, -1);
    }
    this.updateStatus("streaming (" + this.frameCount + ")");
  }

  private applyTextureToMaterial(base64Image: string, material: Material, col: number, row: number) {
    Base64.decodeTextureAsync(
      base64Image,
      (texture: Texture) => {
        material.mainPass.baseTex = texture;
        if (this.frameCount <= 3) {
          const label = col >= 0 ? " tile(" + col + "," + row + ")" : "";
          this.log("Texture applied" + label + ": " + texture.getWidth() + "x" + texture.getHeight());
        }
      },
      () => {
        this.log("Failed to decode texture" + (col >= 0 ? " for tile(" + col + "," + row + ")" : ""));
      }
    );
  }

  private updateStatus(status: string) {
    this.connectionStatus = status;
    if (!this.statusText) return;

    let text = "Status: " + status + "\n";
    text += "Channel: spectacles:" + this.channelName + "\n";

    if (this.gridCols > 0) {
      text += "Grid: " + this.gridCols + "x" + this.gridRows + "\n";
    }

    text += "Updates: " + this.frameCount;

    if (this.lastFrameTime > 0) {
      const ago = Math.floor((Date.now() - this.lastFrameTime) / 1000);
      text += "\nLast: " + ago + "s ago";
    }

    this.statusText.text = text;
  }

  private cleanup() {
    if (this.lobbyChannel) {
      this.announceLobby("device_disconnect");
      this.client.removeChannel(this.lobbyChannel);
    }
    if (this.client && this.realtimeChannel) {
      this.client.removeChannel(this.realtimeChannel);
    }
    this.log("Cleaned up");
  }

  private log(message: string) {
    if (this.enableDebugLogs) {
      print("[RealtimeTextureReceiver] " + message);
    }
  }

  public isConnected(): boolean {
    return this.connectionStatus === "connected" || this.connectionStatus.startsWith("streaming") || this.connectionStatus.startsWith("tiles");
  }

  public getFrameCount(): number {
    return this.frameCount;
  }

  public getChannelName(): string {
    return this.channelName;
  }

  public getStatus(): string {
    return this.connectionStatus;
  }

  /**
   * Register a callback for cursor position updates from the web.
   * Payload: { col, row, u, v } or { col: -1 } for exit.
   */
  public onCursor(callback: (payload: any) => void) {
    this.onCursorCallback = callback;
  }

  /**
   * Register a callback for tile scene ops (create/move/destroy).
   * Used by TilePanel to manage quads dynamically.
   */
  public onScene(callback: (payload: any) => void) {
    this.onSceneCallback = callback;
  }

  /**
   * Handle a tile texture update.
   * Payload: { id: string, image: string (base64) }
   */
  private onMicroTex(payload: any) {
    if (!payload || !payload.id || !payload.image) return;

    const id = payload.id as string;
    this.frameCount++;
    this.lastFrameTime = Date.now();

    if (this.frameCount % this.logFrequency === 0) {
      this.log("MicroTex " + id + " #" + this.frameCount);
    }

    // If TilePanel is handling materials (onTexCallback set), forward to it exclusively.
    // Otherwise fall back to the built-in tile material map.
    // Never do both — that causes double texture decode and GPU memory exhaustion.
    if (this.onTexCallback) {
      this.onTexCallback(payload);
    } else {
      const mat = this.tileMaterials.get(id);
      if (mat) {
        this.applyTextureToMaterial(payload.image, mat, -1, -1);
      }
    }

    this.updateStatus("micro (" + this.frameCount + ")");
  }

  /**
   * Register a callback for tile texture events.
   * Used by TilePanel when it manages its own materials.
   */
  public onTex(callback: (payload: any) => void) {
    this.onTexCallback = callback;
  }

  /**
   * Register a material for a tile ID.
   * Used when this receiver manages materials directly.
   */
  public setTileMaterial(id: string, material: Material) {
    this.tileMaterials.set(id, material);
  }

  /**
   * Remove a material for a tile ID.
   */
  public removeTileMaterial(id: string) {
    this.tileMaterials.delete(id);
  }

  /**
   * Send an event back to the web via the same broadcast channel.
   * Used by RealtimePanel and TilePanel to relay interaction events.
   */
  public sendEvent(event: string, payload: any) {
    if (!this.realtimeChannel) return;
    this.realtimeChannel.send({
      type: "broadcast",
      event: event,
      payload: payload,
    });
  }
}
