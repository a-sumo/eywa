import { Text } from "@react-three/drei";

const FONT_URL = "/fonts/JetBrainsMono-Regular.ttf";

/**
 * 3D torus ring marking the optimal reading zone in AR space.
 * Positioned at comfortable reading distance (~0.8m forward, eye height).
 */
export function XRSweetSpot() {
  return (
    <group position={[0, 0, 0]}>
      {/* Torus ring — centered on focus panel zone */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.35, 0.004, 8, 48]} />
        <meshBasicMaterial
          color="#50ffa0"
          transparent
          opacity={0.18}
          wireframe
        />
      </mesh>

      {/* Label */}
      <Text
        position={[0, 0.39, 0]}
        fontSize={0.025}
        font={FONT_URL}
        color="#50ffa0"
        anchorX="center"
        anchorY="bottom"
        fillOpacity={0.3}
      >
        sweet spot
      </Text>
    </group>
  );
}
