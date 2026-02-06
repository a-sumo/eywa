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
 * 4. Add a ColliderComponent for raycasting
 */

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import { Interactor } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";

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

  private material: Material;
  private remoteService: RemoteServiceModule;
  private lastRefresh: number = 0;

  private isDragging: boolean = false;
  private dragStartUV: vec2 | null = null;
  private lastPointerUV: vec2 | null = null;

  // SIK Interactable for pinch/hover detection
  private interactable: Interactable;
  private collider: ColliderComponent;
  private transform: Transform;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.init());
  }

  private init(): void {
    this.remoteService = require("LensStudio:RemoteServiceModule");
    this.transform = this.sceneObject.getTransform();

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
    this.transform.setLocalScale(new vec3(this.panelWidth, this.panelHeight, 1));
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

    // Get or create Interactable (SIK component)
    this.interactable = this.sceneObject.getComponent(Interactable.getTypeName()) as Interactable;
    if (!this.interactable) {
      this.interactable = this.sceneObject.createComponent(Interactable.getTypeName()) as Interactable;
    }

    // Set up event handlers using SIK patterns
    this.interactable.onHoverEnter((event: InteractorEvent) => {
      this.onPointerEnter(event);
    });

    this.interactable.onHoverUpdate((event: InteractorEvent) => {
      this.onPointerMove(event);
    });

    this.interactable.onHoverExit(() => {
      this.onPointerExit();
    });

    // For drag, use SIK drag events
    this.interactable.onDragStart((event: InteractorEvent) => {
      this.onDragStart(event);
    });

    this.interactable.onDragUpdate((event: InteractorEvent) => {
      this.onDragUpdate(event);
    });

    this.interactable.onDragEnd((event: InteractorEvent) => {
      this.onDragEnd(event);
    });
  }

  private onUpdate(): void {
    const now = getTime();
    if (now - this.lastRefresh >= this.refreshInterval) {
      this.refreshTexture();
      this.lastRefresh = now;
    }
  }

  private refreshTexture(): void {
    const url = `${this.serverUrl}/api/spectacles/frame?room=${this.roomSlug}&t=${Date.now()}&format=base64`;

    const request = RemoteServiceHttpRequest.create();
    request.url = url;
    request.method = RemoteServiceHttpRequest.HttpRequestMethod.Get;

    this.remoteService.performHttpRequest(request, (response) => {
      if (response.statusCode === 200) {
        // Server returns JSON with base64 image
        try {
          const result = JSON.parse(response.body);
          if (result.image) {
            Base64.decodeTextureAsync(
              result.image,
              (texture: Texture) => {
                if (this.material) {
                  this.material.mainPass.baseTex = texture;
                }
              },
              () => {
                print("RemoteUI: Failed to decode base64 texture");
              }
            );
          }
        } catch (e) {
          print(`RemoteUI: Failed to parse response: ${e}`);
        }
      }
    });
  }

  private getUVFromEvent(event: InteractorEvent): vec2 | null {
    // Get the hit point in local space and convert to UV
    // UV coords are 0-1, with (0,0) at bottom-left
    const interactor = event.interactor;
    const hitPosition = interactor?.targetHitInfo?.hit?.position;
    if (!hitPosition) {
      return null;
    }
    const localPos = this.transform
      .getInvertedWorldTransform()
      .multiplyPoint(hitPosition);

    // Convert local position to UV (assuming quad is centered at origin)
    const u = (localPos.x / this.panelWidth) + 0.5;
    const v = (localPos.y / this.panelHeight) + 0.5;

    // Clamp to 0-1
    return new vec2(
      Math.max(0, Math.min(1, u)),
      Math.max(0, Math.min(1, 1 - v)) // Flip Y for screen coords
    );
  }

  private onPointerEnter(event: InteractorEvent): void {
    const uv = this.getUVFromEvent(event);
    if (uv) {
      this.lastPointerUV = uv;
      this.sendInteraction("pointer_move", uv);
    }
  }

  private onPointerMove(event: InteractorEvent): void {
    const uv = this.getUVFromEvent(event);
    if (uv) {
      this.lastPointerUV = uv;
      if (!this.isDragging) {
        this.sendInteraction("pointer_move", uv);
      }
    }
  }

  private onPointerExit(): void {
    this.lastPointerUV = null;
  }

  private onDragStart(event: InteractorEvent): void {
    const uv = this.getUVFromEvent(event);
    if (uv) {
      this.isDragging = true;
      this.dragStartUV = uv;
      this.lastPointerUV = uv;
      this.sendInteraction("pointer_down", uv);
    }
  }

  private onDragUpdate(event: InteractorEvent): void {
    const uv = this.getUVFromEvent(event);
    if (uv && this.isDragging) {
      this.lastPointerUV = uv;
      this.sendInteraction("drag", uv);
    }
  }

  private onDragEnd(event: InteractorEvent): void {
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
