import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

// Aurora colors
const CYAN = new THREE.Color("#4eeaff");
const PURPLE = new THREE.Color("#a855f7");
const PINK = new THREE.Color("#f472b6");
const BLUE = new THREE.Color("#6b8cff");

function ParticleSwarm() {
  const { positions, colors, sizes } = useMemo(() => {
    const particles: { pos: THREE.Vector3; color: THREE.Color; size: number }[] = [];

    // Center particle - larger
    particles.push({
      pos: new THREE.Vector3(0, 0, 0),
      color: CYAN.clone(),
      size: 0.18,
    });

    // 4-pointed star arms
    const armLength = 0.85;
    const particlesPerArm = 6;
    const armColors = [CYAN, PURPLE, PINK, BLUE];
    const armAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]; // 4 directions

    armAngles.forEach((angle, armIdx) => {
      const armColor = armColors[armIdx];
      for (let i = 1; i <= particlesPerArm; i++) {
        const t = i / particlesPerArm;
        const dist = t * armLength;
        // Slight curve/spread as we go out
        const spread = Math.sin(t * Math.PI) * 0.15;
        const x = Math.cos(angle) * dist + (Math.random() - 0.5) * spread;
        const y = Math.sin(angle) * dist + (Math.random() - 0.5) * spread;
        const z = (Math.random() - 0.5) * 0.1;

        // Size decreases along arm
        const size = 0.12 * (1 - t * 0.5) + Math.random() * 0.02;

        // Color gradient along arm
        const mixedColor = armColor.clone().lerp(CYAN, (1 - t) * 0.3);

        particles.push({ pos: new THREE.Vector3(x, y, z), color: mixedColor, size });
      }
    });

    // Diagonal arms (between main arms) - smaller particles
    const diagonalAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    diagonalAngles.forEach((angle, idx) => {
      const armColor = armColors[(idx + 1) % 4];
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const dist = t * armLength * 0.6;
        const x = Math.cos(angle) * dist + (Math.random() - 0.5) * 0.08;
        const y = Math.sin(angle) * dist + (Math.random() - 0.5) * 0.08;
        const z = (Math.random() - 0.5) * 0.05;
        const size = 0.06 * (1 - t * 0.4);
        particles.push({ pos: new THREE.Vector3(x, y, z), color: armColor.clone(), size });
      }
    });

    // Scatter some ambient particles
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.2 + Math.random() * 0.5;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      const z = (Math.random() - 0.5) * 0.15;
      const color = armColors[Math.floor(Math.random() * 4)].clone();
      color.lerp(new THREE.Color("#ffffff"), 0.2);
      particles.push({ pos: new THREE.Vector3(x, y, z), color, size: 0.03 + Math.random() * 0.03 });
    }

    // Build arrays
    const positions = new Float32Array(particles.length * 3);
    const colors = new Float32Array(particles.length * 3);
    const sizes = new Float32Array(particles.length);

    particles.forEach((p, i) => {
      positions[i * 3] = p.pos.x;
      positions[i * 3 + 1] = p.pos.y;
      positions[i * 3 + 2] = p.pos.z;
      colors[i * 3] = p.color.r;
      colors[i * 3 + 1] = p.color.g;
      colors[i * 3 + 2] = p.color.b;
      sizes[i] = p.size;
    });

    return { positions, colors, sizes };
  }, []);

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute float size;
        attribute vec3 particleColor;
        varying vec3 vColor;
        void main() {
          vColor = particleColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;

          // Soft glow falloff
          float alpha = 1.0 - smoothstep(0.0, 0.5, d);
          alpha = pow(alpha, 1.5);

          // Bright core
          float core = 1.0 - smoothstep(0.0, 0.2, d);
          vec3 color = vColor + core * 0.5;

          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-particleColor" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <primitive object={shaderMaterial} attach="material" />
    </points>
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
        camera={{ position: [0, 0, 2], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", height: "100%" }}
        frameloop="demand"
      >
        <ParticleSwarm />
      </Canvas>
    </div>
  );
}

// Static SVG version for favicons
export function EywaLogoStatic({ size = 48, className = "" }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="24" cy="24" r="22" fill="#08090f" />
      <g filter="url(#glow)">
        {/* Center */}
        <circle cx="24" cy="24" r="4" fill="#4eeaff" />
        {/* Top arm */}
        <circle cx="24" cy="18" r="2.5" fill="#4eeaff" opacity="0.9" />
        <circle cx="24" cy="12" r="2" fill="#4eeaff" opacity="0.7" />
        <circle cx="24" cy="7" r="1.5" fill="#4eeaff" opacity="0.5" />
        {/* Right arm */}
        <circle cx="30" cy="24" r="2.5" fill="#a855f7" opacity="0.9" />
        <circle cx="36" cy="24" r="2" fill="#a855f7" opacity="0.7" />
        <circle cx="41" cy="24" r="1.5" fill="#a855f7" opacity="0.5" />
        {/* Bottom arm */}
        <circle cx="24" cy="30" r="2.5" fill="#f472b6" opacity="0.9" />
        <circle cx="24" cy="36" r="2" fill="#f472b6" opacity="0.7" />
        <circle cx="24" cy="41" r="1.5" fill="#f472b6" opacity="0.5" />
        {/* Left arm */}
        <circle cx="18" cy="24" r="2.5" fill="#6b8cff" opacity="0.9" />
        <circle cx="12" cy="24" r="2" fill="#6b8cff" opacity="0.7" />
        <circle cx="7" cy="24" r="1.5" fill="#6b8cff" opacity="0.5" />
      </g>
    </svg>
  );
}
