import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { getFingerDefs, AR_SCALE, type HandPose, type Vec3 } from "../../lib/layoutMath";

interface XRHandModelProps {
  handPos: Vec3;
  handPose: HandPose;
}

/**
 * Virtual hand for scripted mode — renders a stylized hand
 * animated through timeline poses. Hidden in AI mode (user sees real hands).
 */
export function XRHandModel({ handPos, handPose }: XRHandModelProps) {
  const fingers = useMemo(() => getFingerDefs(handPose), [handPose]);

  // Convert from demo world units to AR scale
  const scaledPos: [number, number, number] = [
    handPos[0] * AR_SCALE,
    handPos[1] * AR_SCALE,
    handPos[2] * AR_SCALE,
  ];

  // Hand scale factor - finger defs are in ~pixel units, convert to meters
  const handScale = 0.0015 * AR_SCALE;

  return (
    <group position={scaledPos}>
      {/* Palm */}
      <mesh>
        <sphereGeometry args={[0.025, 12, 8]} />
        <meshStandardMaterial color="#d4aa88" roughness={0.7} />
      </mesh>

      {/* Palm shadow */}
      <mesh position={[0.001, -0.002, 0.002]}>
        <sphereGeometry args={[0.026, 12, 8]} />
        <meshBasicMaterial color="#000" transparent opacity={0.15} />
      </mesh>

      {/* Fingers */}
      {fingers.map((f, i) => {
        const basePos: [number, number, number] = [
          f.bx * handScale,
          -f.by * handScale,
          0,
        ];
        const tipPos: [number, number, number] = [
          f.tx * handScale,
          -f.ty * handScale,
          0,
        ];

        const points: [number, number, number][] = [basePos];

        if (f.cx !== undefined && f.cy !== undefined) {
          // Curved finger - add control point
          const ctrlPos: [number, number, number] = [
            f.cx * handScale,
            -f.cy * handScale,
            0,
          ];
          // Subdivide the curve
          for (let t = 0.25; t <= 0.75; t += 0.25) {
            const x = (1 - t) * (1 - t) * basePos[0] + 2 * (1 - t) * t * ctrlPos[0] + t * t * tipPos[0];
            const y = (1 - t) * (1 - t) * basePos[1] + 2 * (1 - t) * t * ctrlPos[1] + t * t * tipPos[1];
            points.push([x, y, 0]);
          }
        }

        points.push(tipPos);

        return (
          <group key={i}>
            <Line
              points={points}
              color="#d4aa88"
              lineWidth={3}
            />
            {/* Fingertip */}
            <mesh position={tipPos}>
              <sphereGeometry args={[0.004, 6, 4]} />
              <meshStandardMaterial color="#e8cbb0" roughness={0.6} />
            </mesh>
          </group>
        );
      })}

      {/* Wrist */}
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.04, 0.006, 0.006]} />
        <meshStandardMaterial color="#c49a78" roughness={0.8} />
      </mesh>

      {/* Gesture label */}
      {(handPose === "grab" || handPose === "pull" || handPose === "push") && (
        <mesh position={[0, -0.05, 0]}>
          <planeGeometry args={[0.06, 0.02]} />
          <meshBasicMaterial
            color={handPose === "pull" ? "#44ff88" : handPose === "push" ? "#ff8844" : "#ffffff"}
            transparent
            opacity={0.7}
          />
        </mesh>
      )}
    </group>
  );
}
