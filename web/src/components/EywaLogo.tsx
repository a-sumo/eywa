import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Simple 3D noise function
function noise3D(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = x * x * (3 - 2 * x);
  const v = y * y * (3 - 2 * y);
  const w = z * z * (3 - 2 * z);
  const A = (X + Y * 57 + Z * 113) * 0.0001;
  return (Math.sin(A * 12.9898 + u * 78.233 + v * 43.1934 + w * 93.9234) * 43758.5453) % 1;
}

function NoiseSphere() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const { geometry, originalPositions } = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 4);
    const positions = geo.attributes.position.array.slice();
    return { geometry: geo, originalPositions: positions };
  }, []);

  // Custom shader for aurora gradient
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        void main() {
          vPosition = position;
          vNormal = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        uniform float uTime;

        void main() {
          // Aurora colors
          vec3 cyan = vec3(0.306, 0.918, 1.0);    // #4eeaff
          vec3 purple = vec3(0.659, 0.333, 0.969); // #a855f7
          vec3 pink = vec3(0.957, 0.447, 0.714);   // #f472b6
          vec3 blue = vec3(0.420, 0.549, 1.0);     // #6b8cff

          // Mix based on position and normal
          float t1 = (vPosition.y + 1.0) * 0.5;
          float t2 = (vPosition.x + 1.0) * 0.5;
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);

          vec3 color1 = mix(purple, cyan, t1);
          vec3 color2 = mix(pink, blue, t2);
          vec3 finalColor = mix(color1, color2, 0.5 + fresnel * 0.3);

          // Add subtle glow at edges
          finalColor += fresnel * 0.3 * cyan;

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.elapsedTime * 0.3;
    const positions = geometry.attributes.position.array as Float32Array;
    const noiseScale = 0.8;
    const noiseStrength = 0.15;

    for (let i = 0; i < positions.length; i += 3) {
      const ox = originalPositions[i];
      const oy = originalPositions[i + 1];
      const oz = originalPositions[i + 2];

      // Low frequency noise deformation
      const n = noise3D(
        ox * noiseScale + time,
        oy * noiseScale + time * 0.7,
        oz * noiseScale + time * 0.5
      );

      const displacement = 1 + n * noiseStrength;
      positions[i] = ox * displacement;
      positions[i + 1] = oy * displacement;
      positions[i + 2] = oz * displacement;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    // Slow rotation
    meshRef.current.rotation.y = time * 0.2;
    meshRef.current.rotation.x = Math.sin(time * 0.1) * 0.1;

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <primitive object={shaderMaterial} ref={materialRef} attach="material" />
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
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <NoiseSphere />
      </Canvas>
    </div>
  );
}

// Static version for places where we can't use Three.js (like favicons)
export function EywaLogoStatic({ size = 48, className = "" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
    >
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
      <circle
        cx="24"
        cy="24"
        r="16"
        fill="url(#eywa-grad)"
        filter="url(#eywa-glow)"
      />
    </svg>
  );
}
