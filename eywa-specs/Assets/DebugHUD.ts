/**
 * DebugHUD.ts
 *
 * Drop-in debug panel for Spectacles development. Creates all UI
 * programmatically: a column of SIK command buttons and a live event log.
 *
 * Finds TilePanel automatically in the scene, reuses its material and
 * bridge URL. Position itself to the right of the main panel.
 *
 * Buttons send SIK events via HTTP bridge. Log shows sent + received events.
 * Supports sim mode (automated tour) and manual mode (click buttons).
 */

import { TilePanel } from './TilePanel';
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";

@component
export class DebugHUD extends BaseScriptComponent {

  @input
  @hint("Leave empty to auto-find TilePanel in scene")
  @allowUndefined
  public tilePanel: TilePanel;

  @input
  @hint("Leave empty to use TilePanel's bridge URL")
  @allowUndefined
  public httpBridgeUrl: string = "";

  @input
  @hint("Material for buttons. Leave empty to use TilePanel's material.")
  @allowUndefined
  public material: Material;

  private internetModule: InternetModule;
  private sharedMesh: RenderMesh;
  private hudRoot: SceneObject;
  private logText: Text;
  private logEntries: string[] = [];
  private focusIndex: number = 0;
  private simRunning: boolean = false;
  private bridgeUrl: string = "";

  private static AGENTS = [
    "autonomous", "openclaw", "i18n-deployer",
    "api", "deploy", "editor"
  ];

  // Minimal 4x4 white JPEG for button backgrounds
  private static WHITE_TEX = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.init());
  }

  private init() {
    try {
      this.internetModule = require('LensStudio:InternetModule') as InternetModule;
    } catch (e) {
      print("[DebugHUD] ERROR: InternetModule not available: " + e);
      return;
    }

    // Auto-find TilePanel
    if (!this.tilePanel) {
      this.tilePanel = this.findTilePanel();
    }

    if (this.tilePanel) {
      if (!this.material) {
        this.material = (this.tilePanel as any).material;
      }
      if (!this.httpBridgeUrl || this.httpBridgeUrl.trim() === "") {
        this.bridgeUrl = (this.tilePanel as any).httpBridgeUrl || "http://localhost:8765";
      }
    }

    this.bridgeUrl = (this.httpBridgeUrl && this.httpBridgeUrl.trim() !== "")
      ? this.httpBridgeUrl.replace(/\/$/, "")
      : this.bridgeUrl || "http://localhost:8765";

    if (!this.material) {
      print("[DebugHUD] ERROR: No material found. Assign one or ensure TilePanel has a material.");
      return;
    }

    this.sharedMesh = this.buildUnitQuadMesh();

    // Create HUD root, position to the right of the main panel
    this.hudRoot = global.scene.createSceneObject("DebugHUD_Root");
    this.hudRoot.setParent(this.sceneObject);
    this.hudRoot.layer = this.sceneObject.layer;
    this.hudRoot.getTransform().setLocalPosition(new vec3(45, 15, 0));

    this.buildButtons();
    this.buildLog();
    this.startLogPoller();

    this.log("HUD ready, bridge: " + this.bridgeUrl);
    print("[DebugHUD] Initialized with " + DebugHUD.AGENTS.length + " agents, bridge: " + this.bridgeUrl);
  }

  // --- Button grid ---

  private buildButtons() {
    const buttons: Array<{ label: string; action: () => void }> = [
      { label: "Zoom +",  action: () => this.sendSik("zoom_in", { factor: 1.5 }) },
      { label: "Zoom -",  action: () => this.sendSik("zoom_out", { factor: 0.67 }) },
      { label: "Reset",   action: () => this.sendSik("reset_view") },
      { label: "Pan L",   action: () => this.sendSik("pan", { dx: -0.3, dy: 0 }) },
      { label: "Pan R",   action: () => this.sendSik("pan", { dx: 0.3, dy: 0 }) },
      { label: "Pan U",   action: () => this.sendSik("pan", { dx: 0, dy: 0.3 }) },
      { label: "Pan D",   action: () => this.sendSik("pan", { dx: 0, dy: -0.3 }) },
      { label: "Focus >", action: () => this.focusNext() },
      { label: "Grid",    action: () => this.sendSik("toggle_grid") },
      { label: "Theme",   action: () => this.sendSik("toggle_theme") },
      { label: "Info",    action: () => this.sendSik("toggle_info") },
      { label: "SIM",     action: () => this.toggleSim() },
    ];

    const cols = 3;
    const btnW = 8;  // cm
    const btnH = 3.5;  // cm
    const gap = 0.8;

    for (let i = 0; i < buttons.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (btnW + gap);
      const y = -row * (btnH + gap);
      this.createButton(buttons[i].label, x, y, btnW, btnH, buttons[i].action);
    }
  }

  private createButton(label: string, x: number, y: number, w: number, h: number, action: () => void) {
    const obj = global.scene.createSceneObject("HUD_" + label.replace(/\s/g, ""));
    obj.setParent(this.hudRoot);
    obj.layer = this.sceneObject.layer;
    obj.getTransform().setLocalPosition(new vec3(x, y, 0.1));
    obj.getTransform().setLocalScale(new vec3(w, h, 1));

    // Quad visual
    const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = this.sharedMesh;
    const mat = this.material.clone();
    rmv.mainMaterial = mat;

    // Dark background texture
    Base64.decodeTextureAsync(
      DebugHUD.WHITE_TEX,
      (texture: Texture) => {
        mat.mainPass["baseTex"] = texture;
        mat.mainPass["baseColor"] = new vec4(0.12, 0.15, 0.18, 0.9);
      },
      () => {}
    );

    // Text label (child object so it's not scaled with the quad)
    const textObj = global.scene.createSceneObject("Lbl_" + label);
    textObj.setParent(this.hudRoot);
    textObj.layer = this.sceneObject.layer;
    textObj.getTransform().setLocalPosition(new vec3(x, y, 0.2));
    const text = textObj.createComponent("Component.Text") as Text;
    text.text = label;
    text.size = 3.5;
    text.horizontalAlignment = 1; // center
    text.verticalAlignment = 1; // center

    // Collider for interaction
    const collider = obj.createComponent("Physics.ColliderComponent") as ColliderComponent;
    const shape = Shape.createBoxShape();
    shape.size = new vec3(1, 1, 0.1);
    collider.shape = shape;

    // SIK Interactable
    let interactable = obj.getComponent(Interactable.getTypeName()) as Interactable;
    if (!interactable) {
      interactable = obj.createComponent(Interactable.getTypeName()) as Interactable;
    }

    interactable.onTriggerStart((_e: InteractorEvent) => {
      this.log("TAP: " + label);
      // Flash the button
      mat.mainPass["baseColor"] = new vec4(0.2, 0.8, 0.4, 0.9);
      const resetEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
      resetEvent.reset(0.2);
      resetEvent.bind(() => {
        mat.mainPass["baseColor"] = new vec4(0.12, 0.15, 0.18, 0.9);
      });
      action();
    });

    interactable.onHoverEnter((_e: InteractorEvent) => {
      mat.mainPass["baseColor"] = new vec4(0.18, 0.22, 0.28, 0.95);
    });

    interactable.onHoverExit(() => {
      mat.mainPass["baseColor"] = new vec4(0.12, 0.15, 0.18, 0.9);
    });
  }

  // --- Log panel ---

  private buildLog() {
    const logObj = global.scene.createSceneObject("HUD_Log");
    logObj.setParent(this.hudRoot);
    logObj.layer = this.sceneObject.layer;
    // Below the buttons
    logObj.getTransform().setLocalPosition(new vec3(0, -20, 0.1));

    this.logText = logObj.createComponent("Component.Text") as Text;
    this.logText.text = "Event Log\n---";
    this.logText.size = 2.8;
    this.logText.horizontalAlignment = 0; // left
  }

  private log(msg: string) {
    const ts = new Date();
    const time = ts.getMinutes().toString().padStart(2, "0") + ":" + ts.getSeconds().toString().padStart(2, "0");
    this.logEntries.push(time + " " + msg);
    if (this.logEntries.length > 12) {
      this.logEntries.shift();
    }
    if (this.logText) {
      this.logText.text = "EVENT LOG\n" + this.logEntries.join("\n");
    }
    print("[DebugHUD] " + msg);
  }

  /**
   * Poll bridge /status periodically and log frame counts.
   */
  private startLogPoller() {
    const pollEvent = this.createEvent("UpdateEvent");
    let lastPoll = 0;
    let lastFrameCount = 0;

    pollEvent.bind(() => {
      const now = Date.now();
      if (now - lastPoll < 3000) return;
      lastPoll = now;

      this.internetModule.fetch(this.bridgeUrl + "/status", { method: "GET" })
        .then((res: any) => res.text())
        .then((text: string) => {
          const data = JSON.parse(text);
          if (data.frameCount !== lastFrameCount) {
            lastFrameCount = data.frameCount;
            this.log("rx " + data.frameCount + " frames, scene v" + data.sceneVersion + ", " + data.tileCount + " tiles");
          }
        })
        .catch(() => {});
    });
  }

  // --- SIK event sending ---

  private async sendSik(type: string, extra: Record<string, any> = {}) {
    this.log("-> " + type + (extra.factor ? " x" + extra.factor : "") + (extra.agent ? " " + extra.agent : ""));

    try {
      await this.internetModule.fetch(this.bridgeUrl + "/send", {
        method: "POST",
        body: JSON.stringify({
          event: "interaction",
          payload: { type, ...extra }
        }),
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      this.log("ERR: " + e);
    }
  }

  private focusNext() {
    const agent = DebugHUD.AGENTS[this.focusIndex % DebugHUD.AGENTS.length];
    this.focusIndex++;
    this.sendSik("focus_agent", { agent, focusZoom: 2.0 + Math.random() });
  }

  // --- Sim mode ---

  private toggleSim() {
    this.simRunning = !this.simRunning;
    this.log(this.simRunning ? "SIM started" : "SIM stopped");
    if (this.simRunning) {
      this.runSim();
    }
  }

  private async runSim() {
    const delay = (ms: number) => new Promise<void>(r => {
      const ev = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent;
      ev.reset(ms / 1000);
      ev.bind(() => r());
    });

    while (this.simRunning) {
      // Focus tour
      for (const agent of DebugHUD.AGENTS) {
        if (!this.simRunning) return;
        await this.sendSik("focus_agent", { agent, focusZoom: 2.5 });
        await delay(3000);
      }

      if (!this.simRunning) return;
      await this.sendSik("reset_view");
      await delay(2000);

      // Zoom and pan sequence
      await this.sendSik("zoom_in", { factor: 1.4 });
      await delay(1500);
      await this.sendSik("pan", { dx: 0.3, dy: -0.2 });
      await delay(1500);
      await this.sendSik("toggle_grid");
      await delay(2000);
      await this.sendSik("toggle_grid");
      await delay(1000);
      await this.sendSik("reset_view");
      await delay(2000);
    }
  }

  // --- Utilities ---

  private findTilePanel(): TilePanel | null {
    // Walk the scene to find a TilePanel component
    const sceneAny = global.scene as any;
    if (!sceneAny.getRootObjectCount) return null;

    const queue: SceneObject[] = [];
    const count = sceneAny.getRootObjectCount();
    for (let i = 0; i < count; i++) {
      const root = sceneAny.getRootObject(i) as SceneObject;
      if (root) queue.push(root);
    }

    while (queue.length > 0) {
      const obj = queue.shift() as SceneObject;
      const tp = obj.getComponent(TilePanel.getTypeName()) as TilePanel;
      if (tp) {
        print("[DebugHUD] Found TilePanel on: " + (obj as any).name);
        return tp;
      }
      const childCount = (obj as any).getChildrenCount ? (obj as any).getChildrenCount() : 0;
      for (let i = 0; i < childCount; i++) {
        const child = (obj as any).getChild(i) as SceneObject;
        if (child) queue.push(child);
      }
    }

    print("[DebugHUD] TilePanel not found in scene");
    return null;
  }

  private buildUnitQuadMesh(): RenderMesh {
    const builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "normal", components: 3 },
      { name: "texture0", components: 2 }
    ]);
    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;
    builder.appendVerticesInterleaved([-0.5, -0.5, 0, 0, 0, 1, 0, 0]);
    builder.appendVerticesInterleaved([0.5, -0.5, 0, 0, 0, 1, 1, 0]);
    builder.appendVerticesInterleaved([0.5, 0.5, 0, 0, 0, 1, 1, 1]);
    builder.appendVerticesInterleaved([-0.5, 0.5, 0, 0, 0, 1, 0, 1]);
    builder.appendIndices([0, 1, 2, 0, 2, 3]);
    const mesh = builder.getMesh();
    builder.updateMesh();
    return mesh;
  }
}
