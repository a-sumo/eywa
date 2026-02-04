import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { PANEL_LABELS, TIMELINE, type TimelineStep } from "../../lib/layoutMath";
import type { GestureAgentResult } from "../../hooks/useGestureAgent";

interface XRHUDProps {
  step: TimelineStep;
  stepIdx: number;
  mode: "scripted" | "ai";
  aiLoading?: boolean;
  aiResult?: GestureAgentResult | null;
}

const FONT_URL = "/fonts/JetBrainsMono-Regular.ttf";

/**
 * Head-locked HUD for step info, mode indicator, and AI status.
 * Follows the camera with slight lag for comfort.
 */
export function XRHUD({ step, stepIdx, mode, aiLoading, aiResult }: XRHUDProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current) return;

    // Position HUD relative to camera — 0.6m forward, slightly below eye level
    const hudOffset = new THREE.Vector3(0, -0.12, -0.6);
    hudOffset.applyQuaternion(camera.quaternion);
    const targetPos = camera.position.clone().add(hudOffset);

    // Smooth follow with lag for comfort
    groupRef.current.position.lerp(targetPos, 0.08);
    groupRef.current.quaternion.slerp(camera.quaternion, 0.06);
  });

  const progress = (stepIdx + 1) / TIMELINE.length;

  return (
    <group ref={groupRef}>
      {/* Step label */}
      <Text
        position={[-0.18, 0.05, 0]}
        fontSize={0.016}
        font={FONT_URL}
        color="#ffffff"
        anchorX="left"
        anchorY="top"
        fontWeight="bold"
        fillOpacity={0.9}
      >
        {step.label}
      </Text>

      {/* Step description */}
      <Text
        position={[-0.18, 0.032, 0]}
        fontSize={0.01}
        font={FONT_URL}
        color="#aaaaaa"
        anchorX="left"
        anchorY="top"
        maxWidth={0.32}
        fillOpacity={0.7}
      >
        {step.description}
      </Text>

      {/* Mode indicator */}
      <Text
        position={[0.18, 0.05, 0]}
        fontSize={0.012}
        font={FONT_URL}
        color={mode === "ai" ? "#aa88ff" : "#4488ff"}
        anchorX="right"
        anchorY="top"
        fontWeight="bold"
        fillOpacity={0.8}
      >
        {mode === "ai" ? "AI MODE" : "SCRIPTED"}
      </Text>

      {/* Progress bar background */}
      <mesh position={[0, 0.01, 0]}>
        <planeGeometry args={[0.36, 0.003]} />
        <meshBasicMaterial color="#222222" transparent opacity={0.6} side={2} />
      </mesh>

      {/* Progress bar fill */}
      <mesh position={[-0.18 + (progress * 0.36) / 2, 0.01, 0.0001]}>
        <planeGeometry args={[progress * 0.36, 0.003]} />
        <meshBasicMaterial
          color={mode === "ai" ? "#aa66ff" : "#44ff88"}
          transparent
          opacity={0.8}
          side={2}
        />
      </mesh>

      {/* Step counter */}
      <Text
        position={[0.18, 0.003, 0]}
        fontSize={0.008}
        font={FONT_URL}
        color="#555555"
        anchorX="right"
        anchorY="top"
        fillOpacity={0.6}
      >
        {`${stepIdx + 1}/${TIMELINE.length}`}
      </Text>

      {/* AI status */}
      {mode === "ai" && aiLoading && (
        <Text
          position={[0.18, -0.005, 0]}
          fontSize={0.009}
          font={FONT_URL}
          color="#6bb4ff"
          anchorX="right"
          anchorY="top"
          fillOpacity={0.8}
        >
          Analyzing...
        </Text>
      )}

      {mode === "ai" && aiResult && !aiLoading && (
        <Text
          position={[0.18, -0.005, 0]}
          fontSize={0.009}
          font={FONT_URL}
          color="#44ff88"
          anchorX="right"
          anchorY="top"
          fillOpacity={0.8}
        >
          {`${aiResult.gesture} → ${PANEL_LABELS[aiResult.focusPanel]} (${aiResult.confidence.toFixed(2)})`}
        </Text>
      )}
    </group>
  );
}
