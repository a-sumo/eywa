import { type ReactNode, type RefObject, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Environment, Grid, OrbitControls } from "@react-three/drei";
import { GlassPanel3D } from "./GlassPanel3D";

interface SpatialSceneProps {
  source: ReactNode;
  context: ReactNode;
  chat: ReactNode;
  portal: RefObject<HTMLDivElement>;
}

/**
 * Compute panel positions from the camera frustum so panels fill the
 * visible area regardless of window size. Side panels sit on a
 * parabolic arc (pushed back in z) and rotate to face the camera.
 */
function usePanelLayout() {
  const { viewport } = useThree();

  return useMemo(() => {
    const widths = [3.6, 3.6, 3.2]; // source, context, chat
    const totalW = widths[0] + widths[1] + widths[2];

    // fill ~80% of the visible width, clamp gap so panels never collide
    const usable = viewport.width * 0.8;
    const gap = Math.max(0.4, (usable - totalW) / 2);

    // x centers, evenly distributed
    const xCenters = [
      -(widths[1] / 2 + gap + widths[0] / 2),
      0,
      widths[1] / 2 + gap + widths[2] / 2,
    ];

    // parabolic arc: z = -k * x².  Side panels pushed back.
    const curvature = 0.07;
    // rotation: panels aim toward a focal point behind the camera
    const focalDist = 14;

    return widths.map((w, i) => ({
      position: [
        xCenters[i],
        0,
        -curvature * xCenters[i] * xCenters[i],
      ] as [number, number, number],
      rotation: [
        0,
        Math.atan2(xCenters[i], focalDist),
        0,
      ] as [number, number, number],
      width: w,
    }));
  }, [viewport.width]);
}

export function SpatialScene({
  source,
  context,
  chat,
  portal,
}: SpatialSceneProps) {
  const panels = usePanelLayout();
  const children = [source, context, chat];

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={0.5} />
      <directionalLight position={[-4, 4, -2]} intensity={0.3} />

      <Environment preset="city" background={false} environmentIntensity={0.3} />

      <Grid
        position={[0, -2.5, 0]}
        args={[30, 30]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#c0c8e0"
        sectionSize={3}
        sectionThickness={1}
        sectionColor="#a0aad0"
        fadeDistance={12}
        fadeStrength={1}
        infiniteGrid
      />

      {panels.map((p, i) => (
        <GlassPanel3D
          key={i}
          position={p.position}
          rotation={p.rotation}
          width={p.width}
          portal={portal}
        >
          {children[i]}
        </GlassPanel3D>
      ))}

      <OrbitControls
        makeDefault
        enablePan={false}
        minAzimuthAngle={-Math.PI / 6}
        maxAzimuthAngle={Math.PI / 6}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={(100 * Math.PI) / 180}
        minDistance={6}
        maxDistance={16}
      />
    </>
  );
}
