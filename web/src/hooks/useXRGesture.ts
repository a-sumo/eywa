import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceStates } from "@react-three/xr";
import type { Vec3 } from "../lib/layoutMath";
import { sub, dot, AR_SCALE } from "../lib/layoutMath";

export type GestureType = "idle" | "reach" | "grab" | "pull" | "push";

export interface XRGestureResult {
  gesture: GestureType;
  handPos: Vec3;
  targetPanel: number | null;
  confidence: number;
}

const PINCH_THRESHOLD = 0.03; // meters
const VELOCITY_THRESHOLD = 0.15; // m/s
const REACH_DISTANCE_RATE = -0.3; // distance decreasing per second

interface HandTrackingState {
  prevPos: Vec3;
  prevTime: number;
  velocity: Vec3;
  prevPanelDistance: number;
}

/**
 * Custom hook that reads WebXR hand joint data and classifies gestures.
 * Falls back to pointer events for Vision Pro (no raw hand joints).
 */
export function useXRGesture(
  panelPositions: Vec3[],
): XRGestureResult {
  const inputSourceStates = useXRInputSourceStates();
  const trackingRef = useRef<HandTrackingState>({
    prevPos: [0, 0, 0],
    prevTime: 0,
    velocity: [0, 0, 0],
    prevPanelDistance: Infinity,
  });

  const resultRef = useRef<XRGestureResult>({
    gesture: "idle",
    handPos: [0, 0, 0],
    targetPanel: null,
    confidence: 0,
  });

  // Find the primary hand input source (prefer right hand)
  const handState = useMemo(() => {
    // Look for hand tracking first
    const hands = inputSourceStates.filter(s => s.type === "hand");
    if (hands.length > 0) {
      // Prefer right hand
      const right = hands.find(s => s.inputSource.handedness === "right");
      return right ?? hands[0];
    }
    // Fallback: controller or transient pointer (Vision Pro pinch)
    const controllers = inputSourceStates.filter(s => s.type === "controller" || s.type === "transientPointer");
    if (controllers.length > 0) {
      const right = controllers.find(s => s.inputSource.handedness === "right");
      return right ?? controllers[0];
    }
    return null;
  }, [inputSourceStates]);

  useFrame((state, delta) => {
    const tracking = trackingRef.current;
    const now = state.clock.elapsedTime;

    if (!handState) {
      resultRef.current = { gesture: "idle", handPos: [0, 0, 0], targetPanel: null, confidence: 0 };
      return;
    }

    let handPos: Vec3 = [0, 0, 0];
    let thumbTipPos: Vec3 | null = null;
    let indexTipPos: Vec3 | null = null;
    let hasRawJoints = false;

    // Try to get hand joint positions from the XR frame
    const xrFrame = state.gl.xr.getFrame?.();
    const refSpace = state.gl.xr.getReferenceSpace?.();

    if (xrFrame && refSpace && handState.type === "hand") {
      const inputSource = handState.inputSource as XRInputSource & { hand?: XRHand };
      const hand = inputSource.hand;

      if (hand) {
        // Get wrist position
        const wristSpace = hand.get("wrist");
        if (wristSpace) {
          const wristPose = xrFrame.getJointPose?.(wristSpace, refSpace);
          if (wristPose) {
            const p = wristPose.transform.position;
            handPos = [p.x, p.y, p.z];
            hasRawJoints = true;
          }
        }

        // Get thumb tip
        const thumbSpace = hand.get("thumb-tip");
        if (thumbSpace) {
          const thumbPose = xrFrame.getJointPose?.(thumbSpace, refSpace);
          if (thumbPose) {
            const p = thumbPose.transform.position;
            thumbTipPos = [p.x, p.y, p.z];
          }
        }

        // Get index finger tip
        const indexSpace = hand.get("index-finger-tip");
        if (indexSpace) {
          const indexPose = xrFrame.getJointPose?.(indexSpace, refSpace);
          if (indexPose) {
            const p = indexPose.transform.position;
            indexTipPos = [p.x, p.y, p.z];
          }
        }
      }
    }

    // Fallback for controllers/pointers (Vision Pro, Spectacles)
    if (!hasRawJoints && handState.inputSource.gripSpace && xrFrame && refSpace) {
      const gripPose = xrFrame.getPose?.(handState.inputSource.gripSpace, refSpace);
      if (gripPose) {
        const p = gripPose.transform.position;
        handPos = [p.x, p.y, p.z];
      }
    }

    // Compute velocity
    const dt = delta || 0.016;
    const velocity: Vec3 = [
      (handPos[0] - tracking.prevPos[0]) / dt,
      (handPos[1] - tracking.prevPos[1]) / dt,
      (handPos[2] - tracking.prevPos[2]) / dt,
    ];
    tracking.prevPos = handPos;
    tracking.prevTime = now;
    tracking.velocity = velocity;

    // Panel targeting: find nearest panel
    let targetPanel: number | null = null;
    let minDist = Infinity;

    // Scale panel positions by AR_SCALE for comparison
    for (let i = 0; i < panelPositions.length; i++) {
      const pp = panelPositions[i];
      const scaledP: Vec3 = [pp[0] * AR_SCALE, pp[1] * AR_SCALE, pp[2] * AR_SCALE];
      const diff = sub(handPos, scaledP);
      const dist = Math.sqrt(dot(diff, diff));
      if (dist < minDist) {
        minDist = dist;
        targetPanel = i;
      }
    }

    // If hand is too far from all panels, no target
    if (minDist > 1.5) targetPanel = null;

    // Classify gesture
    let gesture: GestureType = "idle";
    let confidence = 0.5;

    const speed = Math.sqrt(dot(velocity, velocity));
    const zVelocity = velocity[2]; // positive = toward user, negative = away

    // Check for pinch (grab) - thumb-index distance
    if (thumbTipPos && indexTipPos) {
      const pinchDiff = sub(thumbTipPos, indexTipPos);
      const pinchDist = Math.sqrt(dot(pinchDiff, pinchDiff));

      if (pinchDist < PINCH_THRESHOLD) {
        // Pinching
        if (zVelocity > VELOCITY_THRESHOLD) {
          gesture = "pull";
          confidence = 0.8;
        } else {
          gesture = "grab";
          confidence = 0.85;
        }
      } else if (speed > VELOCITY_THRESHOLD) {
        // Hand is moving
        if (zVelocity < -VELOCITY_THRESHOLD && pinchDist > 0.06) {
          // Open hand pushing away
          gesture = "push";
          confidence = 0.75;
        } else {
          // Check if distance to nearest panel is decreasing (reaching)
          const distRate = (minDist - tracking.prevPanelDistance) / dt;
          if (distRate < REACH_DISTANCE_RATE && targetPanel !== null) {
            gesture = "reach";
            confidence = 0.7;
          }
        }
      }
    } else {
      // No raw joints - use controller/pointer events
      // Check for select events (pinch on Vision Pro / trigger on controller)
      const events = handState.events;
      if (events && events.length > 0) {
        for (const evt of events) {
          if (evt.type === "selectstart" || evt.type === "squeezestart") {
            gesture = "grab";
            confidence = 0.8;
          } else if (evt.type === "selectend" || evt.type === "squeezeend") {
            // Released - check velocity for pull vs drop
            if (zVelocity > VELOCITY_THRESHOLD) {
              gesture = "pull";
              confidence = 0.7;
            } else {
              gesture = "idle";
              confidence = 0.6;
            }
          }
        }
      }

      // Movement-based classification when no events
      if (gesture === "idle" && speed > VELOCITY_THRESHOLD) {
        if (zVelocity < -VELOCITY_THRESHOLD) {
          gesture = "push";
          confidence = 0.65;
        } else if (targetPanel !== null) {
          const distRate = (minDist - tracking.prevPanelDistance) / dt;
          if (distRate < REACH_DISTANCE_RATE) {
            gesture = "reach";
            confidence = 0.6;
          }
        }
      }
    }

    tracking.prevPanelDistance = minDist;

    resultRef.current = { gesture, handPos, targetPanel, confidence };
  });

  return resultRef.current;
}
