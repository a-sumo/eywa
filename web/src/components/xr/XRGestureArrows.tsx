import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, Text } from "@react-three/drei";
import { AR_SCALE, type TimelineStep, type Vec3 } from "../../lib/layoutMath";
import type { PanelLayout } from "../../hooks/useLayoutAgent";

interface XRGestureArrowsProps {
  step: TimelineStep;
  panels: PanelLayout[];
}

const FONT_URL = "/fonts/JetBrainsMono-Regular.ttf";

/**
 * 3D arrows showing pull/push gesture direction + grab indicator.
 */
export function XRGestureArrows({ step, panels }: XRGestureArrowsProps) {
  const opacityRef = useRef(0.5);

  useFrame((state) => {
    opacityRef.current = 0.3 + 0.3 * Math.sin(state.clock.elapsedTime * 4);
  });

  const handPos: Vec3 = [
    step.handPos[0] * AR_SCALE,
    step.handPos[1] * AR_SCALE,
    step.handPos[2] * AR_SCALE,
  ];

  if (!step.gestureArrow && !step.grab) return null;

  return (
    <group>
      {/* Pull arrow: from target panel toward user */}
      {step.gestureArrow === "pull" && (
        <PullArrow
          handPos={handPos}
          focusPanel={panels[step.focus]}
        />
      )}

      {/* Push arrow: from hand toward scene center */}
      {step.gestureArrow === "push" && (
        <PushArrow handPos={handPos} />
      )}

      {/* Grab indicator: card floating above hand */}
      {step.grab && step.grabLabel && (
        <GrabCard
          handPos={handPos}
          label={step.grabLabel}
          sourceColor={step.grabSourcePanel !== undefined
            ? ["#ff6688", "#4488ff", "#ffaa44"][step.grabSourcePanel]
            : "#ffaa44"}
        />
      )}

      {/* Gesture label under hand */}
      {step.gestureLabel && step.gestureColor && (
        <Text
          position={[handPos[0], handPos[1] - 0.05, handPos[2]]}
          fontSize={0.025}
          font={FONT_URL}
          color={step.gestureColor}
          anchorX="center"
          anchorY="top"
          fillOpacity={0.8}
          fontWeight="bold"
        >
          {step.gestureLabel}
        </Text>
      )}
    </group>
  );
}

function PullArrow({ handPos, focusPanel }: { handPos: Vec3; focusPanel: PanelLayout }) {
  const panelPos: Vec3 = [
    focusPanel.position[0] * AR_SCALE,
    focusPanel.position[1] * AR_SCALE,
    focusPanel.position[2] * AR_SCALE,
  ];

  const midX = (panelPos[0] + handPos[0]) / 2;
  const midY = Math.max(panelPos[1], handPos[1]) + 0.1;
  const midZ = (panelPos[2] + handPos[2]) / 2;

  const points: [number, number, number][] = [
    [panelPos[0], panelPos[1], panelPos[2]],
    [midX, midY, midZ],
    [handPos[0], handPos[1], handPos[2]],
  ];

  return (
    <Line
      points={points}
      color="#44ff88"
      lineWidth={2}
      dashed
      dashSize={0.03}
      gapSize={0.02}
    />
  );
}

function PushArrow({ handPos }: { handPos: Vec3 }) {
  const targetPos: Vec3 = [0, 0, 0]; // scene center
  const midX = (handPos[0] + targetPos[0]) / 2;
  const midY = Math.max(handPos[1], targetPos[1]) + 0.08;
  const midZ = (handPos[2] + targetPos[2]) / 2;

  const points: [number, number, number][] = [
    [handPos[0], handPos[1], handPos[2]],
    [midX, midY, midZ],
    [targetPos[0], targetPos[1], targetPos[2]],
  ];

  return (
    <Line
      points={points}
      color="#ff8844"
      lineWidth={2}
      dashed
      dashSize={0.03}
      gapSize={0.02}
    />
  );
}

function GrabCard({
  handPos,
  label,
  sourceColor,
}: {
  handPos: Vec3;
  label: string;
  sourceColor: string;
}) {
  return (
    <group position={[handPos[0], handPos[1] + 0.06, handPos[2]]}>
      {/* Card background */}
      <mesh>
        <planeGeometry args={[0.1, 0.04]} />
        <meshBasicMaterial color={sourceColor} transparent opacity={0.6} side={2} />
      </mesh>
      {/* Card border */}
      <mesh>
        <planeGeometry args={[0.102, 0.042]} />
        <meshBasicMaterial color={sourceColor} transparent opacity={0.9} wireframe side={2} />
      </mesh>
      {/* Card text */}
      <Text
        position={[0, 0, 0.001]}
        fontSize={0.012}
        font={FONT_URL}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {label}
      </Text>
    </group>
  );
}
