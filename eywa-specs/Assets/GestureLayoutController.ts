import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import { MicroTilePanel } from "./MicroTilePanel";
import { RealtimeTextureReceiver } from "./RealtimeTextureReceiver";

@component
export class GestureLayoutController extends BaseScriptComponent {
  @input
  @hint("MicroTilePanel for hover context + receiver")
  panel: MicroTilePanel;

  @input
  @hint("Receiver (optional override). If unset, uses panel.getReceiver().")
  receiver: RealtimeTextureReceiver;

  // --- Clap gesture ---
  @input clapCloseDist: number = 6.0; // cm
  @input clapOpenDist: number = 12.0; // cm
  @input clapWindowMs: number = 250;

  // --- Snap gesture ---
  @input snapCloseDist: number = 1.5; // cm
  @input snapOpenDist: number = 5.0;  // cm
  @input snapWindowMs: number = 200;

  // --- Two-finger hold (peace sign) ---
  @input fingerUpThreshold: number = 0.7;
  @input foldedMaxExtension: number = 9.0;

  private rightHand: any = null;
  private leftHand: any = null;

  private clapPrimed = false;
  private clapTime = 0;

  private snapPrimedR = false;
  private snapTimeR = 0;
  private snapPrimedL = false;
  private snapTimeL = 0;

  private lastSend = 0;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.init());
  }

  private init(): void {
    try {
      this.rightHand = SIK.HandInputData.getHand("right");
      this.leftHand = SIK.HandInputData.getHand("left");
    } catch (e) {
      print("[GestureLayoutController] Hand tracking not available: " + e);
    }
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onUpdate(): void {
    const now = Date.now();
    if (now - this.lastSend < 150) return;

    const leftTip = this.getPrimaryTip(this.leftHand);
    const rightTip = this.getPrimaryTip(this.rightHand);

    // Clap: hands together then separate quickly → expand zones
    if (leftTip && rightTip) {
      const d = leftTip.distance(rightTip);
      if (!this.clapPrimed && d < this.clapCloseDist) {
        this.clapPrimed = true;
        this.clapTime = now;
      } else if (this.clapPrimed && d > this.clapOpenDist && now - this.clapTime < this.clapWindowMs) {
        this.clapPrimed = false;
        this.lastSend = now;
        this.sendLayout([
          { type: "shift-zone", zoneId: "left", dx: -2 },
          { type: "shift-zone", zoneId: "right", dx: 2 },
        ]);
        return;
      } else if (this.clapPrimed && now - this.clapTime > this.clapWindowMs) {
        this.clapPrimed = false;
      }
    }

    // Two-finger hold (peace) on either hand → focus hovered group
    if (this.isPeace(this.leftHand) || this.isPeace(this.rightHand)) {
      const hitId = this.panel ? this.panel.getLastHitId() : null;
      const groupId = hitId ? this.tileIdToGroupId(hitId) : null;
      if (groupId) {
        this.lastSend = now;
        this.sendLayout([{ type: "focus-group", groupId: groupId, zPullCm: 2.0 }]);
        return;
      }
    }

    // Snap gesture (thumb + middle together then apart) → reset layout
    if (this.detectSnap(this.rightHand, true) || this.detectSnap(this.leftHand, false)) {
      this.lastSend = now;
      this.sendLayout([{ type: "reset-layout" }]);
      return;
    }
  }

  private getPrimaryTip(hand: any): vec3 | null {
    if (!hand) return null;
    return (hand.indexTip?.position as vec3) || null;
  }

  private isPeace(hand: any): boolean {
    if (!hand) return false;
    const iK = hand.indexKnuckle?.position as vec3;
    const iT = hand.indexTip?.position as vec3;
    const mK = hand.middleKnuckle?.position as vec3;
    const mT = hand.middleTip?.position as vec3;
    const rK = hand.ringKnuckle?.position as vec3;
    const rT = hand.ringTip?.position as vec3;
    const pK = hand.pinkyKnuckle?.position as vec3;
    const pT = hand.pinkyTip?.position as vec3;
    if (!iK || !iT || !mK || !mT || !rK || !rT || !pK || !pT) return false;

    if (this.fingerUpness(iK, iT) < this.fingerUpThreshold) return false;
    if (this.fingerUpness(mK, mT) < this.fingerUpThreshold) return false;
    if (rT.distance(rK) > this.foldedMaxExtension) return false;
    if (pT.distance(pK) > this.foldedMaxExtension) return false;
    return true;
  }

  private fingerUpness(knuckle: vec3, tip: vec3): number {
    const dx = tip.x - knuckle.x;
    const dy = tip.y - knuckle.y;
    const dz = tip.z - knuckle.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return len > 0.001 ? dy / len : 0;
  }

  private detectSnap(hand: any, right: boolean): boolean {
    if (!hand) return false;
    const thumb = hand.thumbTip?.position as vec3;
    const middle = hand.middleTip?.position as vec3;
    if (!thumb || !middle) return false;
    const d = thumb.distance(middle);
    const now = Date.now();

    if (right) {
      if (!this.snapPrimedR && d < this.snapCloseDist) {
        this.snapPrimedR = true;
        this.snapTimeR = now;
      } else if (this.snapPrimedR && d > this.snapOpenDist && now - this.snapTimeR < this.snapWindowMs) {
        this.snapPrimedR = false;
        return true;
      } else if (this.snapPrimedR && now - this.snapTimeR > this.snapWindowMs) {
        this.snapPrimedR = false;
      }
      return false;
    }

    if (!this.snapPrimedL && d < this.snapCloseDist) {
      this.snapPrimedL = true;
      this.snapTimeL = now;
    } else if (this.snapPrimedL && d > this.snapOpenDist && now - this.snapTimeL < this.snapWindowMs) {
      this.snapPrimedL = false;
      return true;
    } else if (this.snapPrimedL && now - this.snapTimeL > this.snapWindowMs) {
      this.snapPrimedL = false;
    }
    return false;
  }

  private tileIdToGroupId(tileId: string): string | null {
    // Interactive bg tiles use the same ID as the group (prefixed with "g-").
    // E.g. tile "mem-abc123-def-456" -> group "g-mem-abc123-def-456"
    // Sub-tiles like "mem-abc123-def-456-agent" are not interactive,
    // so we only need to handle the bg tile IDs here.
    if (tileId.startsWith("mem-") || tileId.startsWith("ctx-")) {
      return "g-" + tileId;
    }
    if (tileId.startsWith("agent-")) {
      return "g-" + tileId;
    }
    if (tileId.startsWith("prompt-")) {
      return "g-" + tileId;
    }
    if (tileId.startsWith("chat-")) {
      return "g-" + tileId;
    }
    return null;
  }

  private sendLayout(actions: any[]) {
    const recv = this.receiver || (this.panel ? this.panel.getReceiver() : null);
    if (!recv) return;
    recv.sendEvent("layout", { actions: actions, timestamp: Date.now() });
  }
}
