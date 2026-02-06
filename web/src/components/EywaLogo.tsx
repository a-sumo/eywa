import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

// Simplex-like noise for smooth blob shape
function noise3D(x: number, y: number, z: number): number {
  const p = x * 0.5 + y * 0.8 + z * 0.3;
  return (
    Math.sin(p * 1.2) * 0.5 +
    Math.sin(p * 2.1 + 1.3) * 0.25 +
    Math.sin(p * 0.7 + 2.1) * 0.25
  );
}

function BlobSphere() {
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 5);
    const positions = geo.attributes.position.array as Float32Array;
    const noiseScale = 0.4; // Very low frequency
    const noiseStrength = 0.25; // Visible blob deformation

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      // Normalize to get direction
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;

      // Low frequency noise displacement
      const n = noise3D(nx * noiseScale, ny * noiseScale, nz * noiseScale);
      const displacement = 1 + n * noiseStrength;

      positions[i] = nx * displacement;
      positions[i + 1] = ny * displacement;
      positions[i + 2] = nz * displacement;
    }

    geo.computeVertexNormals();
    return geo;
  }, []);

  // Custom shader for aurora gradient
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          // Aurora colors
          vec3 cyan = vec3(0.306, 0.918, 1.0);
          vec3 purple = vec3(0.659, 0.333, 0.969);
          vec3 pink = vec3(0.957, 0.447, 0.714);
          vec3 blue = vec3(0.420, 0.549, 1.0);

          // Mix based on position
          float t1 = (vPosition.y + 1.0) * 0.5;
          float t2 = (vPosition.x + 1.0) * 0.5;

          // Fresnel for edge glow
          vec3 viewDir = vec3(0.0, 0.0, 1.0);
          float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.5);

          vec3 color1 = mix(purple, cyan, t1);
          vec3 color2 = mix(pink, blue, t2);
          vec3 finalColor = mix(color1, color2, 0.5);

          // Add glow at edges
          finalColor += fresnel * 0.4 * cyan;

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }, []);

  return (
    <mesh geometry={geometry} rotation={[0.3, 0.5, 0]}>
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
}

interface Props {
  size?: number;
  className?: string;
}

export default function EywaLogo({ size = 48, className = "" }: Props) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "#08090f",
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", height: "100%" }}
        frameloop="demand"
      >
        <BlobSphere />
      </Canvas>
    </div>
  );
}

// Static version for favicons
export function EywaLogoStatic({ size = 48, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <defs>
        <radialGradient id="eywa-grad" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#4eeaff" />
          <stop offset="40%" stopColor="#a855f7" />
          <stop offset="70%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#6b8cff" />
        </radialGradient>
        <filter id="eywa-glow">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="24" cy="24" r="22" fill="#08090f" />
      <circle cx="24" cy="24" r="16" fill="url(#eywa-grad)" filter="url(#eywa-glow)" />
    </svg>
  );
}
