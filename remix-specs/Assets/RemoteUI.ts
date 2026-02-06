/**
 * RemoteUI.ts
 *
 * Displays a remote-rendered UI texture on a quad and forwards
 * interaction events (raycast UV + gestures) back to the server.
 *
 * Setup in Lens Studio:
 * 1. Create a Quad mesh (or use Image component)
 * 2. Add this script to the quad's SceneObject
 * 3. Set the serverUrl to your Eywa instance
 * 4. Optionally add a ColliderComponent for precise raycasting
 */

// SIK interaction event type (varies by SIK version)
interface InteractionEvent {
  interactor: {
    targetHitInfo: {
      hit: boolean;
      position: vec3;
    } | null;
  };
}

@component
export class RemoteUI extends BaseScriptComponent {
  /** Base URL for the Eywa server */
  @input
  serverUrl: string = "https://eywa.example.com";

  /** Room slug */
  @input
  roomSlug: string = "demo";

  /** How often to refresh the texture (seconds) */
  @input
  refreshInterval: number = 0.1; // 10 fps

  /** Size of the UI panel in world units */
  @input
  panelWidth: number = 40; // cm
  @input
  panelHeight: number = 40; // cm

  private texture: Texture;
  private material: Material;
  private remoteService: RemoteServiceModule;
  private lastRefresh: number = 0;

  private isDragging: boolean = false;
  private dragStartUV: vec2 | null = null;
  private lastPointerUV: vec2 | null = null;

  // Interaction component for pinch detection
  private interaction: InteractionComponent;
  private collider: ColliderComponent;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.init());
  }

  private init(): void {
    this.remoteService = require("LensStudio:RemoteServiceModule");

    // Create or get the render mesh visual
    this.setupQuad();

    // Set up interaction
    this.setupInteraction();

    // Start the refresh loop
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());

    // Initial texture fetch
    this.refreshTexture();

    print(`RemoteUI: Initialized for room ${this.roomSlug}`);
  }

  private setupQuad(): void {
    // Get or create the Image/RenderMeshVisual component
    let visual = this.sceneObject.getComponent("Component.Image") as Image;

    if (!visual) {
      // Create as RenderMeshVisual with a quad
      const rmv = this.sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (rmv) {
        // Clone the material so we can swap the texture
        this.material = rmv.mainMaterial.clone();
        rmv.mainMaterial = this.material;
      }
    } else {
      // Image component - we'll set the texture directly
      this.material = visual.mainMaterial.clone();
      visual.mainMaterial = this.material;
    }

    // Set the quad size
    const transform = this.sceneObject.getTransform();
    transform.setLocalScale(new vec3(this.panelWidth, this.panelHeight, 1));
  }

  private setupInteraction(): void {
    // Get or create collider for raycasting
    this.collider = this.sceneObject.getComponent("Physics.ColliderComponent") as ColliderComponent;
    if (!this.collider) {
      this.collider = this.sceneObject.createComponent("Physics.ColliderComponent") as ColliderComponent;
      const shape = Shape.createBoxShape();
      shape.size = new vec3(this.panelWidth, this.panelHeight, 1);
      this.collider.shape = shape;
    }

    // Get or create interaction component
    this.interaction = this.sceneObject.getComponent("Component.InteractionComponent") as InteractionComponent;
    if (!this.interaction) {
      this.interaction = this.sceneObject.createComponent("Component.InteractionComponent") as InteractionComponent;
    }

    // Set up event handlers
    this.interaction.onHoverEnter.add((event) => {
      this.onPointerEnter(event);
    });

    this.interaction.onHoverUpdate.add((event) => {
      this.onPointerMove(event);
    });

    this.interaction.onHoverExit.add((event) => {
      this.onPointerExit(event);
    });

    this.interaction.onTap.add((event) => {
      this.onTap(event);
    });

    // For drag, we use the trigger events
    this.interaction.onTriggerStart.add((event) => {
      this.onDragStart(event);
    });

    this.interaction.onTriggerEnd.add((event) => {
      this.onDragEnd(event);
    });
  }

  private onUpdate(): void {
    const now = getTime();
    if (now - this.lastRefresh >= this.refreshInterval) {
      this.refreshTexture();
      this.lastRefresh = now;
    }

    // If dragging, continuously send pointer updates
    if (this.isDragging && this.lastPointerUV) {
      this.sendInteraction("drag", this.lastPointerUV);
    }
  }

  private refreshTexture(): void {
    const url = `${this.serverUrl}/api/spectacles/frame?room=${this.roomSlug}&t=${Date.now()}`;

    const request = RemoteServiceHttpRequest.create();
    request.url = url;
    request.method = RemoteServiceHttpRequest.HttpRequestMethod.Get;

    this.remoteService.performHttpRequest(request, (response) => {
      if (response.statusCode === 200) {
        // Create texture from response body
        try {
          const texture = ProceduralTextureProvider.createFromBuffer(
            response.asArrayBuffer(),
            response.headers["content-type"] || "image/jpeg"
          );
          if (texture && this.material) {
            this.material.mainPass.baseTex = texture;
          }
        } catch (e) {
          print(`RemoteUI: Failed to create texture: ${e}`);
        }
      }
    });
  }

  private getUVFromEvent(event: InteractionEvent): vec2 | null {
    // Get the hit point in local space and convert to UV
    // UV coords are 0-1, with (0,0) at bottom-left
    const hitPoint = event.interactor.targetHitInfo;
    if (!hitPoint || !hitPoint.hit) return null;

    const localPos = this.sceneObject.getTransform()
      .getInvertedWorldTransform()
      .multiplyPoint(hitPoint.position);

    // Convert local position to UV (assuming quad is centered at origin)
    const u = (localPos.x / this.panelWidth) + 0.5;
    const v = (localPos.y / this.panelHeight) + 0.5;

    // Clamp to 0-1
    return new vec2(
      Math.max(0, Math.min(1, u)),
      Math.max(0, Math.min(1, 1 - v)) // Flip Y for screen coords
    );
  }

  private onPointerEnter(event: InteractionEvent): void {
    const uv = this.getUVFromEvent(event);
    if (uv) {
      this.lastPointerUV = uv;
      this.sendInteraction("pointer_move", uv);
    }
  }

  private onPointerMove(event: InteractionEvent): void {
    const uv = this.getUVFromEvent(event);
    if (uv) {
      this.lastPointerUV = uv;
      if (!this.isDragging) {
        this.sendInteraction("pointer_move", uv);
      }
    }
  }

  private onPointerExit(event: InteractionEvent): void {
    this.lastPointerUV = null;
  }

  private onTap(event: InteractionEvent): void {
    const uv = this.getUVFromEvent(event);
    if (uv) {
      // Send both down and up for a tap
      this.sendInteraction("pointer_down", uv);

      // Delayed pointer up
      const delayedEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
      delayedEvent.bind(() => {
        this.sendInteraction("pointer_up", uv);
      });
      delayedEvent.reset(0.1);
    }
  }

  private onDragStart(event: InteractionEvent): void {
    const uv = this.getUVFromEvent(event);
    if (uv) {
      this.isDragging = true;
      this.dragStartUV = uv;
      this.lastPointerUV = uv;
      this.sendInteraction("pointer_down", uv);
    }
  }

  private onDragEnd(event: InteractionEvent): void {
    const uv = this.getUVFromEvent(event) || this.lastPointerUV;
    if (uv && this.isDragging) {
      this.sendInteraction("pointer_up", uv);
    }
    this.isDragging = false;
    this.dragStartUV = null;
  }

  private sendInteraction(type: string, uv: vec2): void {
    const url = `${this.serverUrl}/api/spectacles/interact`;

    const body = JSON.stringify({
      room: this.roomSlug,
      type: type,
      uv: [uv.x, uv.y],
      timestamp: Date.now(),
    });

    const request = RemoteServiceHttpRequest.create();
    request.url = url;
    request.method = RemoteServiceHttpRequest.HttpRequestMethod.Post;
    request.body = body;
    request.setHeader("Content-Type", "application/json");

    this.remoteService.performHttpRequest(request, (response) => {
      if (response.statusCode !== 200) {
        print(`RemoteUI: Interaction failed: ${response.statusCode}`);
      }
    });
  }
}
