import { useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { createXRStore, XR, XROrigin } from "@react-three/xr";
import { Text, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

const xrStore = createXRStore({
  emulate: false,
  foveation: 1,
  frameRate: "high",
});

// ---- Test 1: Spinning cube ----
function TestCube() {
  return (
    <mesh position={[0, 0, -1.5]} rotation={[0.4, 0.6, 0]}>
      <boxGeometry args={[0.3, 0.3, 0.3]} />
      <meshStandardMaterial color="#4488ff" />
    </mesh>
  );
}

// ---- Test 2: Cube + flat color plane ----
function TestPanel() {
  return (
    <group>
      <TestCube />
      <mesh position={[0.5, 0, -1.5]}>
        <planeGeometry args={[0.5, 0.7]} />
        <meshStandardMaterial color="#ff6688" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ---- Test 3: Cube + panel with troika Text ----
function TestText() {
  return (
    <group>
      <TestCube />
      <group position={[0.5, 0, -1.5]}>
        <mesh>
          <planeGeometry args={[0.5, 0.7]} />
          <meshStandardMaterial color="#ff6688" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
        <Text
          position={[0, 0.2, 0.01]}
          fontSize={0.04}
          font="/fonts/JetBrainsMono-Regular.ttf"
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          Hello XR
        </Text>
        <Text
          position={[0, 0.05, 0.01]}
          fontSize={0.025}
          font="/fonts/JetBrainsMono-Regular.ttf"
          color="#aaaaff"
          anchorX="center"
          anchorY="middle"
        >
          troika text works
        </Text>
      </group>
    </group>
  );
}

// ---- Test 4: RoundedBox glass panel ----
function TestGlass() {
  return (
    <group>
      <TestCube />
      <group position={[0.5, 0, -1.5]}>
        <RoundedBox args={[0.5, 0.7, 0.02]} radius={0.01} smoothness={4}>
          <meshStandardMaterial
            color="#4488ff"
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
            roughness={0.3}
          />
        </RoundedBox>
        <mesh>
          <boxGeometry args={[0.504, 0.704, 0.01]} />
          <meshBasicMaterial color="#4488ff" wireframe transparent opacity={0.5} />
        </mesh>
        <Text
          position={[0, 0.25, 0.02]}
          fontSize={0.035}
          font="/fonts/JetBrainsMono-Regular.ttf"
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          Glass Panel
        </Text>
        <Text
          position={[0, 0.1, 0.02]}
          fontSize={0.022}
          font="/fonts/JetBrainsMono-Regular.ttf"
          color="#b8c0dd"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.45}
        >
          {"agent-alpha / session-019\nAnalyzed 14 documents"}
        </Text>
      </group>
    </group>
  );
}

// ---- Test 5: Multiple panels in arc ----
function TestArc() {
  const panels = [
    { x: -0.7, z: -1.8, rotY: 0.15, color: "#ff6688", label: "Browse" },
    { x: 0, z: -1.5, rotY: 0, color: "#4488ff", label: "Context" },
    { x: 0.65, z: -1.7, rotY: -0.12, color: "#ffaa44", label: "Gemini" },
  ];

  return (
    <group>
      {panels.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
          <RoundedBox args={[0.45, 0.6, 0.02]} radius={0.01} smoothness={4}>
            <meshStandardMaterial
              color={p.color}
              transparent
              opacity={i === 1 ? 0.35 : 0.2}
              side={THREE.DoubleSide}
              roughness={0.3}
            />
          </RoundedBox>
          <mesh>
            <boxGeometry args={[0.454, 0.604, 0.01]} />
            <meshBasicMaterial color={p.color} wireframe transparent opacity={i === 1 ? 0.7 : 0.4} />
          </mesh>
          <Text
            position={[0, 0.2, 0.02]}
            fontSize={0.03}
            font="/fonts/JetBrainsMono-Regular.ttf"
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
          >
            {p.label}
          </Text>
        </group>
      ))}
      {/* Sweet spot ring */}
      <mesh position={[0, 0, -1.5]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.35, 0.004, 8, 48]} />
        <meshBasicMaterial color="#50ffa0" transparent opacity={0.25} wireframe />
      </mesh>
    </group>
  );
}

const TESTS = [
  { name: "1. Cube", component: TestCube },
  { name: "2. + Panel", component: TestPanel },
  { name: "3. + Text", component: TestText },
  { name: "4. Glass", component: TestGlass },
  { name: "5. Arc", component: TestArc },
] as const;

export function XRTest() {
  const [testIdx, setTestIdx] = useState(0);
  const [xrError, setXrError] = useState<string | null>(null);

  const handleEnterXR = useCallback(async () => {
    setXrError(null);
    try {
      // Try AR first, fall back to VR
      if (navigator.xr) {
        const arOk = await navigator.xr.isSessionSupported("immersive-ar").catch(() => false);
        if (arOk) { await xrStore.enterAR(); return; }
        const vrOk = await navigator.xr.isSessionSupported("immersive-vr").catch(() => false);
        if (vrOk) { await xrStore.enterVR(); return; }
      }
      setXrError("WebXR not supported on this device");
    } catch (err) {
      setXrError(err instanceof Error ? err.message : "XR failed");
    }
  }, []);

  const TestComponent = TESTS[testIdx].component;

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", background: "#0a0a14" }}>
      {/* Controls */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        padding: "0.75rem", display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap",
      }}>
        <button onClick={handleEnterXR} style={btnXR}>Enter XR</button>

        {TESTS.map((t, i) => (
          <button
            key={i}
            onClick={() => setTestIdx(i)}
            style={{
              ...btn,
              background: i === testIdx ? "#334" : "#1a1a2e",
              color: i === testIdx ? "#fff" : "#888",
              border: i === testIdx ? "1px solid #4488ff" : "1px solid #333",
            }}
          >
            {t.name}
          </button>
        ))}

        {xrError && <span style={{ color: "#ff6666", fontSize: "0.75rem" }}>{xrError}</span>}

        <span style={{ color: "#555", fontSize: "0.7rem", marginLeft: "auto" }}>
          XR Sanity Tests — {TESTS[testIdx].name}
        </span>
      </div>

      {/* Canvas */}
      <Canvas
        camera={{ position: [0, 0, 0], fov: 70, near: 0.01, far: 100 }}
      >
        <color attach="background" args={["#0e0e1a"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 4]} intensity={1} />

        <XR store={xrStore}>
          <XROrigin>
            <TestComponent />
          </XROrigin>
        </XR>
      </Canvas>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "0.35rem 0.7rem", borderRadius: 6, fontSize: "0.75rem",
  fontWeight: 600, cursor: "pointer", background: "#1a1a2e", color: "#ccc",
  border: "1px solid #333",
};

const btnXR: React.CSSProperties = {
  ...btn,
  background: "linear-gradient(135deg, #4488ff, #44ff88)",
  color: "#000", fontWeight: 700, fontSize: "0.85rem",
  padding: "0.4rem 1rem", border: "none",
};
