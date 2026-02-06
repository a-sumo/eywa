import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

// Smooth noise for blob shape
function noise3D(x: number, y: number, z: number): number {
  return (
    Math.sin(x * 2.1 + y * 1.3) * 0.4 +
    Math.sin(y * 1.8 + z * 2.4) * 0.35 +
    Math.sin(z * 1.5 + x * 1.9) * 0.25
  );
}

function BlobSphere() {
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 5);
    const positions = geo.attributes.position.array as Float32Array;
    const noiseStrength = 0.35;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;

      const n = noise3D(nx * 1.2, ny * 1.2, nz * 1.2);
      const displacement = 1 + n * noiseStrength;

      positions[i] = nx * displacement;
      positions[i + 1] = ny * displacement;
      positions[i + 2] = nz * displacement;
    }

    geo.computeVertexNormals();
    return geo;
  }, []);

  // Frosted glass shader with internal glowing spheres
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewDir;

        // Internal light spheres - soft falloff
        float sphereLight(vec3 p, vec3 center, float radius, float intensity) {
          float d = length(p - center);
          float falloff = 1.0 - smoothstep(0.0, radius, d);
          return intensity * falloff * falloff;
        }

        // Frosted noise for surface texture
        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 45.5432))) * 43758.5453);
        }

        void main() {
          // Aurora colors
          vec3 cyan = vec3(0.306, 0.918, 1.0);
          vec3 purple = vec3(0.659, 0.333, 0.969);
          vec3 pink = vec3(0.957, 0.447, 0.714);
          vec3 blue = vec3(0.420, 0.549, 1.0);

          vec3 p = vPosition;

          // Internal glowing orbs
          float light1 = sphereLight(p, vec3(0.0, 0.15, 0.1), 0.6, 1.4);
          float light2 = sphereLight(p, vec3(0.4, -0.15, 0.15), 0.45, 1.1);
          float light3 = sphereLight(p, vec3(-0.35, -0.1, 0.25), 0.4, 1.0);
          float light4 = sphereLight(p, vec3(0.15, 0.4, -0.15), 0.35, 0.9);

          vec3 internalGlow = vec3(0.0);
          internalGlow += light1 * cyan * 1.3;
          internalGlow += light2 * purple * 1.1;
          internalGlow += light3 * pink * 1.0;
          internalGlow += light4 * blue * 0.9;

          // Fresnel for frosted glass rim
          float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.5);

          // Subsurface scattering approximation
          float scatter = pow(max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 0.5);

          // Frosted surface noise
          float frost = hash(vPosition * 20.0) * 0.08;

          // Base frosted color - milky white-ish tint
          vec3 frostTint = vec3(0.85, 0.9, 0.95);

          // Combine: internal glow shows through frosted surface
          vec3 finalColor = internalGlow * (0.7 + scatter * 0.5);
          finalColor = mix(finalColor, frostTint, 0.15 + frost);
          finalColor += fresnel * cyan * 0.6;

          // Boost vibrancy
          float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
          finalColor = mix(vec3(lum), finalColor, 1.5);

          // Semi-transparent frosted glass
          float alpha = 0.85 + fresnel * 0.15;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
    });
  }, []);

  return (
    <mesh geometry={geometry} rotation={[0.2, 0.4, 0.1]}>
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
        camera={{ position: [0, 0, 2.2], fov: 50 }}
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
