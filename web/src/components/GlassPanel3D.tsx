import { type ReactNode, type RefObject } from "react";
import { RoundedBox, Html } from "@react-three/drei";
import { DoubleSide } from "three";

interface GlassPanel3DProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
  children: ReactNode;
  portal?: RefObject<HTMLDivElement>;
}

export function GlassPanel3D({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  width = 3.6,
  height = 4.2,
  children,
  portal,
}: GlassPanel3DProps) {
  const depth = 0.05;

  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[width, height, depth]} radius={0.15} smoothness={4}>
        <meshPhysicalMaterial
          transparent
          opacity={0.15}
          transmission={0.92}
          roughness={0.25}
          metalness={0}
          ior={1.45}
          thickness={0.5}
          color="#dde4ff"
          side={DoubleSide}
        />
      </RoundedBox>

      <Html
        transform
        distanceFactor={8}
        position={[0, 0, depth / 2 + 0.01]}
        portal={portal}
        className="glass-panel-html-wrapper"
      >
        <div
          className="glass-panel-content"
          style={{ width: `${width * 110}px`, height: `${height * 110}px` }}
        >
          {children}
        </div>
      </Html>
    </group>
  );
}
