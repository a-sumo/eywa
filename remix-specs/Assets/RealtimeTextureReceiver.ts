/**
 * RealtimeTextureReceiver.ts
 *
 * Receives realtime texture updates via Supabase broadcast and displays them on a quad.
 * Uses WebSocket streaming instead of HTTP polling for lower latency.
 *
 * Setup in Lens Studio:
 * 1. Create a Quad mesh or Image component
 * 2. Add this script to the SceneObject
 * 3. Assign SnapCloudRequirements reference
 * 4. Set the channel name to match your room slug
 */

import { SnapCloudRequirements } from './SnapCloudRequirements';

import {
  RealtimeChannel,
  SupabaseClient,
  createClient,
} from "SupabaseClient.lspkg/supabase-snapcloud";

@component
export class RealtimeTextureReceiver extends BaseScriptComponent {

  // Supabase Configuration
  @input
  @hint("Reference to SnapCloudRequirements for centralized Supabase configuration")
  public snapCloudRequirements: SnapCloudRequirements;

  @input
  @hint("Channel name - typically your room slug")
  public channelName: string = "demo";

  // Visual Configuration
  @input
  @hint("Width of the panel in world units (cm)")
  public panelWidth: number = 40;

  @input
  @hint("Height of the panel in world units (cm)")
  public panelHeight: number = 40;

  // Status Display
  @input
  @allowUndefined
  @hint("Optional Text component to display connection status")
  public statusText: Text;

  // Debug
  @input
  @hint("Show debug information in console")
  public enableDebugLogs: boolean = true;

  @input
  @hint("Log frame reception frequency (every N frames)")
  @widget(new SliderWidget(1, 50, 1))
  public logFrequency: number = 10;

  // Private variables
  private client: SupabaseClient;
  private realtimeChannel: RealtimeChannel;
  private isInitialized: boolean = false;

  private material: Material;
  private transform: Transform;

  // Stats
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private connectionStatus: string = "disconnected";

  onAwake() {
    this.log("RealtimeTextureReceiver awakening...");

    this.transform = this.sceneObject.getTransform();

    // Deferred init - components not ready on frame 0
    this.createEvent("OnStartEvent").bind(() => {
      this.setupQuad();
      this.initializeSupabase();
    });

    this.createEvent("OnDestroyEvent").bind(() => {
      this.cleanup();
    });
  }

  /**
   * Setup the quad mesh and material for texture display
   */
  private setupQuad(): void {
    // Try to get Image component first
    let image = this.sceneObject.getComponent("Component.Image") as Image;

    if (image) {
      // Clone material so we can modify it
      this.material = image.mainMaterial.clone();
      image.mainMaterial = this.material;
      this.log("Using Image component for texture display");
    } else {
      // Try RenderMeshVisual
      let rmv = this.sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (rmv) {
        this.material = rmv.mainMaterial.clone();
        rmv.mainMaterial = this.material;
        this.log("Using RenderMeshVisual for texture display");
      } else {
        this.log("WARNING: No Image or RenderMeshVisual component found!");
        return;
      }
    }

    // Set panel size
    this.transform.setLocalScale(new vec3(this.panelWidth, this.panelHeight, 1));
    this.log(`Panel size set to ${this.panelWidth}x${this.panelHeight}`);
  }

  /**
   * Initialize Supabase client and realtime connection
   */
  private async initializeSupabase() {
    if (!this.snapCloudRequirements || !this.snapCloudRequirements.isConfigured()) {
      this.log("SnapCloudRequirements not configured");
      this.updateStatus("error: no config");
      return;
    }

    try {
      this.updateStatus("connecting");

      // Create Supabase client
      this.client = createClient(
        this.snapCloudRequirements.getSupabaseUrl(),
        this.snapCloudRequirements.getSupabasePublicToken()
      );

      if (!this.client) {
        this.log("Failed to create Supabase client");
        this.updateStatus("error: client");
        return;
      }

      // Sign in user
      await this.signInUser();

      // Setup realtime channel
      await this.setupRealtimeChannel();

      this.isInitialized = true;
      this.log("Supabase realtime initialized");

    } catch (error) {
      this.log(`Initialization error: ${error}`);
      this.updateStatus("error: init");
    }
  }

  /**
   * Sign in user with Snapchat provider
   */
  private async signInUser() {
    const { data, error } = await this.client.auth.signInWithIdToken({
      provider: "snapchat",
      token: "spectacles-auth-token"
    });

    if (error) {
      this.log("Sign in warning: " + JSON.stringify(error));
    } else {
      this.log("User signed in successfully");
    }
  }

  /**
   * Setup Supabase Realtime channel to receive frames
   */
  private async setupRealtimeChannel() {
    const channelKey = `spectacles:${this.channelName}`;
    this.log(`Subscribing to channel: ${channelKey}`);

    this.realtimeChannel = this.client.channel(channelKey, {
      config: {
        broadcast: { self: false, ack: false }
      }
    });

    // Listen for frame broadcasts
    this.realtimeChannel
      .on("broadcast", { event: "frame" }, (msg) => {
        this.handleIncomingFrame(msg.payload);
      });

    // Subscribe to channel
    this.realtimeChannel.subscribe(async (status) => {
      this.log(`Channel status: ${status}`);

      if (status === "SUBSCRIBED") {
        this.log("Subscribed to realtime channel!");
        this.updateStatus("connected");
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        this.log("Channel closed or error occurred");
        this.updateStatus("error: " + status.toLowerCase());
      }
    });
  }

  /**
   * Handle incoming frame data
   */
  private handleIncomingFrame(payload: any) {
    if (!payload || !payload.image) {
      this.log("Received frame with no image data");
      return;
    }

    this.frameCount++;
    this.lastFrameTime = Date.now();

    // Log based on frequency setting
    if (this.frameCount % this.logFrequency === 0) {
      this.log(`Received frame #${this.frameCount} (${payload.frame ?? '?'})`);
    }

    // Decode base64 image and update texture
    this.updateTexture(payload.image);

    // Update status
    this.updateStatus(`streaming (${this.frameCount})`);
  }

  /**
   * Decode base64 image and apply to material
   */
  private updateTexture(base64Image: string) {
    if (!this.material) {
      this.log("Material not initialized");
      return;
    }

    Base64.decodeTextureAsync(
      base64Image,
      (texture: Texture) => {
        // Successfully decoded - apply to material
        this.material.mainPass.baseTex = texture;

        if (this.frameCount <= 3) {
          this.log(`Texture decoded and applied (${texture.getWidth()}x${texture.getHeight()})`);
        }
      },
      () => {
        this.log("Failed to decode base64 texture");
      }
    );
  }

  /**
   * Update connection status display
   */
  private updateStatus(status: string) {
    this.connectionStatus = status;

    if (this.statusText) {
      const timeSince = this.lastFrameTime > 0
        ? Math.floor((Date.now() - this.lastFrameTime) / 1000)
        : null;

      let displayText = `Status: ${status}\n`;
      displayText += `Channel: spectacles:${this.channelName}\n`;
      displayText += `Frames: ${this.frameCount}`;

      if (timeSince !== null) {
        displayText += `\nLast: ${timeSince}s ago`;
      }

      this.statusText.text = displayText;
    }
  }

  /**
   * Cleanup connections
   */
  private cleanup() {
    if (this.client && this.realtimeChannel) {
      this.client.removeChannel(this.realtimeChannel);
    }
    this.log("Disconnected and cleaned up");
  }

  /**
   * Logging helper
   */
  private log(message: string) {
    if (this.enableDebugLogs) {
      print(`[RealtimeTextureReceiver] ${message}`);
    }
  }

  /**
   * Public API - Check if connected
   */
  public isConnected(): boolean {
    return this.isInitialized && this.connectionStatus === "connected";
  }

  /**
   * Public API - Get frame count
   */
  public getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Public API - Get channel name
   */
  public getChannelName(): string {
    return this.channelName;
  }

  /**
   * Public API - Get connection status
   */
  public getStatus(): string {
    return this.connectionStatus;
  }
}
