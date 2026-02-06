/**
 * RealtimePanel.ts
 *
 * Simple wrapper that creates a quad with the RealtimeTextureReceiver attached.
 * Displays live-streamed texture from the web SpectaclesView.
 *
 * Usage in Lens Studio:
 * 1. Add this script to an empty SceneObject
 * 2. Assign your SnapCloudRequirements reference
 * 3. Set channel name to your room slug
 * 4. Run!
 */

import { SnapCloudRequirements } from './SnapCloudRequirements';
import { RealtimeTextureReceiver } from './RealtimeTextureReceiver';

@component
export class RealtimePanel extends BaseScriptComponent {
  @input
  @hint("SnapCloudRequirements reference for Supabase config")
  public snapCloudRequirements: SnapCloudRequirements;

  @input
  @hint("Channel name - use your room slug")
  public channelName: string = "demo";

  @input
  @hint("Panel width in cm")
  public panelWidth: number = 40;

  @input
  @hint("Panel height in cm")
  public panelHeight: number = 40;

  @input
  @hint("Position offset from parent")
  public positionOffset: vec3 = vec3.zero();

  @input
  @hint("Show debug status text")
  public showStatus: boolean = true;

  private quadObject: SceneObject;
  private receiver: RealtimeTextureReceiver;
  private statusText: Text;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.init());
  }

  private init() {
    print("[RealtimePanel] Initializing...");

    this.createQuad();
    this.createStatusText();
    this.attachReceiver();

    print("[RealtimePanel] Ready! Waiting for frames on channel: " + this.channelName);
  }

  private createQuad() {
    // Create quad object
    this.quadObject = global.scene.createSceneObject("RealtimeQuad");
    this.quadObject.setParent(this.sceneObject);

    const transform = this.quadObject.getTransform();
    transform.setLocalPosition(this.positionOffset);
    transform.setLocalRotation(quat.quatIdentity());
    transform.setLocalScale(vec3.one());

    // Add RenderMeshVisual with quad mesh
    const rmv = this.quadObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;

    // Create quad mesh
    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3 },
      { name: "texture0", components: 2 }
    ]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;

    // Quad vertices (centered at origin)
    const hw = this.panelWidth / 2;
    const hh = this.panelHeight / 2;

    builder.appendVertices([
      [-hw, -hh, 0], [0, 0, 1], [0, 0],
      [hw, -hh, 0],  [0, 0, 1], [1, 0],
      [hw, hh, 0],   [0, 0, 1], [1, 1],
      [-hw, hh, 0],  [0, 0, 1], [0, 1]
    ]);

    builder.appendIndices([0, 1, 2, 0, 2, 3]);

    const mesh = builder.getMesh();
    builder.updateMesh();
    rmv.mesh = mesh;

    // Create unlit material for texture display
    const material = rmv.mainMaterial.clone();
    rmv.mainMaterial = material;

    print("[RealtimePanel] Quad created: " + this.panelWidth + "x" + this.panelHeight + " cm");
  }

  private createStatusText() {
    if (!this.showStatus) return;

    const statusObj = global.scene.createSceneObject("StatusText");
    statusObj.setParent(this.sceneObject);

    const transform = statusObj.getTransform();
    transform.setLocalPosition(new vec3(0, this.panelHeight / 2 + 5, 0));
    transform.setLocalRotation(quat.quatIdentity());
    transform.setLocalScale(vec3.one());

    this.statusText = statusObj.createComponent("Component.Text") as Text;
    this.statusText.text = "Connecting...";
    this.statusText.size = 2;

    print("[RealtimePanel] Status text created");
  }

  private attachReceiver() {
    // Add RealtimeTextureReceiver to the quad
    this.receiver = this.quadObject.createComponent(
      RealtimeTextureReceiver.getTypeName()
    ) as RealtimeTextureReceiver;

    // Configure receiver via script API (since we can't set @input programmatically directly)
    // We'll need to use the receiver's public properties
    // Note: In Lens Studio, @input properties become public fields
    (this.receiver as any).snapCloudRequirements = this.snapCloudRequirements;
    (this.receiver as any).channelName = this.channelName;
    (this.receiver as any).panelWidth = this.panelWidth;
    (this.receiver as any).panelHeight = this.panelHeight;
    (this.receiver as any).statusText = this.statusText;
    (this.receiver as any).enableDebugLogs = true;

    print("[RealtimePanel] Receiver attached and configured");
  }

  /**
   * Public API - get receiver reference
   */
  public getReceiver(): RealtimeTextureReceiver {
    return this.receiver;
  }

  /**
   * Public API - check connection status
   */
  public isConnected(): boolean {
    return this.receiver ? this.receiver.isConnected() : false;
  }
}
