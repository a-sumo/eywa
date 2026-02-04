import { Text, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { PANEL_HEIGHT, AR_SCALE } from "../../lib/layoutMath";

interface XRGlassPanelProps {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  title: string;
  lines: string[];
  color: string;
  isFocus: boolean;
  isPredictedTarget: boolean;
  facingAngle: number;
}

const FONT_URL = "/fonts/JetBrainsMono-Regular.woff2";

export function XRGlassPanel({
  position,
  rotation,
  width,
  title,
  lines,
  color,
  isFocus,
  isPredictedTarget,
  facingAngle,
}: XRGlassPanelProps) {
  const scaledPos: [number, number, number] = [
    position[0] * AR_SCALE,
    position[1] * AR_SCALE,
    position[2] * AR_SCALE,
  ];
  const scaledW = width * AR_SCALE;
  const scaledH = PANEL_HEIGHT * AR_SCALE;
  const depth = 0.02;

  const readAlpha = facingAngle < 30 ? 1 : facingAngle < 55 ? 0.55 : 0.25;
  const facingAway = facingAngle > 90;

  const fontSize = scaledW * 0.035;
  const titleFontSize = fontSize * 1.15;
  const lineHeight = fontSize * 2.2;
  const textZ = depth / 2 + 0.002;
  const topY = scaledH / 2 - lineHeight;

  return (
    <group position={scaledPos} rotation={[rotation[0], rotation[1], rotation[2]]}>
      {/* Glass body */}
      <RoundedBox
        args={[scaledW, scaledH, depth]}
        radius={0.01}
        smoothness={4}
      >
        <meshPhysicalMaterial
          transmission={facingAway ? 0.3 : 0.92}
          roughness={0.05}
          thickness={0.5}
          color={facingAway ? "#333" : color}
          opacity={facingAway ? 0.08 : isFocus ? 0.22 : 0.12}
          transparent
          side={THREE.DoubleSide}
          envMapIntensity={0.5}
        />
      </RoundedBox>

      {/* Border */}
      <mesh>
        <boxGeometry args={[scaledW + 0.004, scaledH + 0.004, depth * 0.5]} />
        <meshBasicMaterial
          color={facingAway ? "#444" : color}
          transparent
          opacity={isFocus ? 0.6 : 0.3}
          wireframe
        />
      </mesh>

      {/* Focus glow border */}
      {isFocus && !facingAway && (
        <mesh>
          <boxGeometry args={[scaledW + 0.01, scaledH + 0.01, depth * 0.3]} />
          <meshBasicMaterial
            color="#44ffaa"
            transparent
            opacity={0.35}
            wireframe
          />
        </mesh>
      )}

      {/* Predicted target pulsing border */}
      {isPredictedTarget && (
        <mesh>
          <boxGeometry args={[scaledW + 0.015, scaledH + 0.015, depth * 0.3]} />
          <meshBasicMaterial
            color="#44ff88"
            transparent
            opacity={0.5}
            wireframe
          />
        </mesh>
      )}

      {/* Text content */}
      {!facingAway && (
        <>
          {/* Title */}
          <Text
            position={[-scaledW / 2 + fontSize, topY, textZ]}
            fontSize={titleFontSize}
            font={FONT_URL}
            color="#ffffff"
            anchorX="left"
            anchorY="top"
            maxWidth={scaledW * 0.9}
            fillOpacity={0.95 * readAlpha}
            fontWeight="bold"
          >
            {title}
          </Text>

          {/* Content lines */}
          {lines.map((line, i) => {
            if (!line) return null;
            const y = topY - (i + 1) * lineHeight;
            if (y < -scaledH / 2 + fontSize) return null;
            return (
              <Text
                key={i}
                position={[-scaledW / 2 + fontSize, y, textZ]}
                fontSize={fontSize}
                font={FONT_URL}
                color="#b8c0dd"
                anchorX="left"
                anchorY="top"
                maxWidth={scaledW * 0.9}
                fillOpacity={0.65 * readAlpha}
              >
                {line}
              </Text>
            );
          })}
        </>
      )}

      {/* Back face label */}
      {facingAway && (
        <Text
          position={[0, 0, -textZ]}
          fontSize={fontSize * 1.5}
          font={FONT_URL}
          color="#ff4444"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.6}
          rotation={[0, Math.PI, 0]}
        >
          BACK
        </Text>
      )}

      {/* Facing angle badge */}
      {!facingAway && (
        <Text
          position={[scaledW / 2 - fontSize * 2, -scaledH / 2 + fontSize, textZ]}
          fontSize={fontSize * 0.8}
          font={FONT_URL}
          color={facingAngle < 30 ? "#44ff88" : facingAngle < 55 ? "#ffaa44" : "#ff4444"}
          anchorX="right"
          anchorY="bottom"
          fillOpacity={0.8 * readAlpha}
          fontWeight="bold"
        >
          {`${facingAngle.toFixed(0)}°`}
        </Text>
      )}
    </group>
  );
}
