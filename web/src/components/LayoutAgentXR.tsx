import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { createXRStore, XR, XROrigin } from "@react-three/xr";
import { OrbitControls, Grid } from "@react-three/drei";

import {
  computeFocusLayout,
  type PanelLayout,
} from "../hooks/useLayoutAgent";
import { useGestureAgent } from "../hooks/useGestureAgent";
import { useXRGesture, type GestureType } from "../hooks/useXRGesture";

import {
  PANEL_LABELS,
  PANEL_COLORS,
  PANEL_TEXT,
  PANEL_HEIGHT,
  VIEWPORT,
  TIMELINE,
  AR_SCALE,
  lerpLayout,
  type Vec3,
  type TimelineStep,
} from "../lib/layoutMath";

import { XRGlassPanel } from "./xr/XRGlassPanel";
import { XRSweetSpot } from "./xr/XRSweetSpot";
import { XRHandModel } from "./xr/XRHandModel";
import { XRGestureArrows } from "./xr/XRGestureArrows";
import { XRHUD } from "./xr/XRHUD";

// ---- XR store (no emulation on production) ----

const xrStore = createXRStore({
  emulate: false,
  foveation: 1,
  frameRate: "high",
});

// ---- types ----

type DemoMode = "scripted" | "ai";

// ---- compute facing angle ----

function computeFacing(panel: PanelLayout, camPos: Vec3): number {
  const rotY = panel.rotation[1];
  const normal: Vec3 = [Math.sin(rotY), 0, Math.cos(rotY)];
  const viewDir: Vec3 = [
    panel.position[0] - camPos[0],
    panel.position[1] - camPos[1],
    panel.position[2] - camPos[2],
  ];
  const len = Math.sqrt(viewDir[0] ** 2 + viewDir[1] ** 2 + viewDir[2] ** 2);
  if (len < 1e-8) return 0;
  const vn: Vec3 = [viewDir[0] / len, viewDir[1] / len, viewDir[2] / len];
  const cosAngle = -(normal[0] * vn[0] + normal[1] * vn[1] + normal[2] * vn[2]);
  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
}

// ---- scene content ----

interface SceneProps {
  mode: DemoMode;
  stepIdx: number;
  displayLayout: PanelLayout[];
  step: TimelineStep;
  aiLoading: boolean;
  aiResult: ReturnType<typeof useGestureAgent>["result"];
  onGestureDetected?: (gesture: GestureType, targetPanel: number | null) => void;
}

function Scene({
  mode,
  stepIdx,
  displayLayout,
  step,
  aiLoading,
  aiResult,
  onGestureDetected,
}: SceneProps) {
  const { camera } = useThree();

  // Camera position for facing computation — use actual camera pos, convert back from AR scale
  const camPos: Vec3 = useMemo(() => {
    const p = camera.position;
    return [p.x / AR_SCALE, p.y / AR_SCALE, p.z / AR_SCALE];
  }, [camera.position]);

  // XR gesture tracking for AI mode
  const panelPositions = useMemo(
    () => displayLayout.map(p => p.position as Vec3),
    [displayLayout],
  );
  const gesture = useXRGesture(panelPositions);

  // Forward gesture to parent for AI mode
  useEffect(() => {
    if (mode === "ai" && gesture.gesture !== "idle" && onGestureDetected) {
      onGestureDetected(gesture.gesture, gesture.targetPanel);
    }
  }, [mode, gesture.gesture, gesture.targetPanel, onGestureDetected]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 5]} intensity={0.8} />
      <directionalLight position={[-3, 2, -2]} intensity={0.3} color="#4488ff" />

      {/* Grid floor */}
      <Grid
        position={[0, -PANEL_HEIGHT * AR_SCALE * 0.55, 0]}
        args={[10, 10]}
        cellSize={0.2}
        cellColor="#1a1a30"
        sectionSize={1}
        sectionColor="#2a2a4a"
        fadeDistance={5}
        fadeStrength={1}
        infiniteGrid
      />

      {/* Sweet spot ring */}
      <XRSweetSpot />

      {/* Glass panels */}
      {displayLayout.map((panel, i) => {
        const facing = computeFacing(panel, camPos);
        return (
          <XRGlassPanel
            key={i}
            position={panel.position}
            rotation={panel.rotation}
            width={panel.width}
            title={PANEL_LABELS[i]}
            lines={PANEL_TEXT[i].slice(1)}
            color={PANEL_COLORS[i]}
            isFocus={i === step.focus}
            isPredictedTarget={step.predictedTarget === i && step.grab}
            facingAngle={facing}
          />
        );
      })}

      {/* Scripted mode: virtual hand */}
      {mode === "scripted" && (
        <XRHandModel handPos={step.handPos} handPose={step.handPose} />
      )}

      {/* Gesture arrows */}
      <XRGestureArrows step={step} panels={displayLayout} />

      {/* Head-locked HUD */}
      <XRHUD
        step={step}
        stepIdx={stepIdx}
        mode={mode}
        aiLoading={aiLoading}
        aiResult={aiResult}
      />

      {/* Orbit controls for non-XR desktop viewing */}
      <OrbitControls
        target={[0, 0, -0.5]}
        enableDamping
        dampingFactor={0.1}
        minDistance={0.5}
        maxDistance={5}
      />
    </>
  );
}

// ---- main component ----

export function LayoutAgentXR() {
  const [mode, setMode] = useState<DemoMode>("scripted");
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const prevLayoutRef = useRef<PanelLayout[] | null>(null);
  const animRef = useRef(0);
  const [xrMode, setXrMode] = useState<"immersive-ar" | "immersive-vr" | null>(null);
  const [xrError, setXrError] = useState<string | null>(null);

  const [aiFocus, setAiFocus] = useState(1);

  // Check WebXR support — try AR first, fall back to VR
  useEffect(() => {
    if (!navigator.xr) return;
    navigator.xr.isSessionSupported("immersive-ar").then(arOk => {
      if (arOk) { setXrMode("immersive-ar"); return; }
      return navigator.xr!.isSessionSupported("immersive-vr").then(vrOk => {
        if (vrOk) setXrMode("immersive-vr");
      });
    }).catch(() => {});
  }, []);

  const step = TIMELINE[stepIdx];
  const effectiveFocus = mode === "ai" ? aiFocus : step.focus;

  const targetLayout = useMemo(
    () => computeFocusLayout(VIEWPORT.width, effectiveFocus),
    [effectiveFocus],
  );

  const [displayLayout, setDisplayLayout] = useState(targetLayout);
  const [aiCorrectionLayout, setAiCorrectionLayout] = useState<PanelLayout[] | null>(null);

  const finalTarget = aiCorrectionLayout ?? targetLayout;

  // Layout interpolation
  useEffect(() => {
    if (!prevLayoutRef.current) {
      prevLayoutRef.current = finalTarget;
      setDisplayLayout(finalTarget);
      return;
    }
    const from = prevLayoutRef.current;
    const to = finalTarget;
    let t = 0;
    const tick = () => {
      t = Math.min(1, t + 0.04);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayLayout(lerpLayout(from, to, eased));
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        prevLayoutRef.current = to;
      }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [finalTarget]);

  // Clear correction when focus changes
  useEffect(() => {
    setAiCorrectionLayout(null);
  }, [effectiveFocus]);

  // Gesture agent for AI mode
  const gestureAgent = useGestureAgent(mode === "ai", VIEWPORT);

  // Apply gesture agent results
  useEffect(() => {
    if (mode !== "ai" || !gestureAgent.result) return;
    const r = gestureAgent.result;
    setAiFocus(r.focusPanel);
    if (r.layoutCorrections) {
      setAiCorrectionLayout(r.layoutCorrections);
    } else {
      setAiCorrectionLayout(null);
    }
  }, [gestureAgent.result, mode]);

  // Auto-play scripted mode
  useEffect(() => {
    if (!playing || mode === "ai") return;
    const timer = setInterval(() => {
      setStepIdx(prev => {
        const next = prev + 1;
        if (next >= TIMELINE.length) {
          setPlaying(false);
          return prev;
        }
        return next;
      });
    }, 2200);
    return () => clearInterval(timer);
  }, [playing, mode]);

  // Handle gesture from XR hand tracking
  const handleGestureDetected = useCallback(
    (gesture: GestureType, targetPanel: number | null) => {
      if (mode !== "ai") return;

      switch (gesture) {
        case "reach":
          if (targetPanel !== null) setAiFocus(targetPanel);
          break;
        case "grab":
          if (targetPanel !== null) {
            const dropTarget = (targetPanel + 1) % 3;
            setAiFocus(dropTarget);
          }
          break;
        case "pull":
          if (targetPanel !== null) setAiFocus(targetPanel);
          break;
        case "push":
          setAiFocus(1);
          break;
      }
    },
    [mode],
  );

  const handleEnterXR = useCallback(async () => {
    setXrError(null);
    try {
      if (xrMode === "immersive-ar") {
        await xrStore.enterAR();
      } else {
        await xrStore.enterVR();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to enter XR";
      setXrError(msg);
      console.warn("[XR]", msg);
    }
  }, [xrMode]);

  return (
    <div style={styles.container}>
      {/* Overlay UI */}
      <div style={styles.overlay}>
        <div style={styles.header}>
          <h2 style={styles.title}>Layout Agent XR</h2>
          <p style={styles.subtitle}>
            Immersive AR demo — use hand tracking to control panel layout.
            {!xrMode && " Orbit with mouse on desktop."}
          </p>
        </div>

        <div style={styles.controls}>
          <button
            onClick={handleEnterXR}
            style={{ ...styles.btn, ...styles.btnAR }}
          >
            {xrMode === "immersive-ar" ? "Enter AR" : xrMode === "immersive-vr" ? "Enter VR" : "Enter XR"}
          </button>

          {xrError && (
            <span style={{ color: "#ff6666", fontSize: "0.75rem" }}>{xrError}</span>
          )}

          <div style={styles.modeToggle}>
            <button
              onClick={() => setMode("scripted")}
              style={{
                ...styles.modeBtn,
                ...(mode === "scripted" ? styles.modeBtnActive : {}),
              }}
            >
              Scripted
            </button>
            <button
              onClick={() => setMode("ai")}
              style={{
                ...styles.modeBtn,
                ...(mode === "ai" ? styles.modeBtnActiveAI : {}),
              }}
            >
              AI
            </button>
          </div>

          {mode === "scripted" && (
            <>
              <button
                onClick={() => {
                  setPlaying(!playing);
                  if (!playing && stepIdx >= TIMELINE.length - 1) setStepIdx(0);
                }}
                style={{ ...styles.btn, ...styles.btnPrimary }}
              >
                {playing ? "Pause" : stepIdx >= TIMELINE.length - 1 ? "Replay" : "Play"}
              </button>
              <button
                onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
                disabled={stepIdx === 0}
                style={styles.btn}
              >
                Prev
              </button>
              <button
                onClick={() => setStepIdx(Math.min(TIMELINE.length - 1, stepIdx + 1))}
                disabled={stepIdx >= TIMELINE.length - 1}
                style={styles.btn}
              >
                Next
              </button>
            </>
          )}

          <span style={styles.stepLabel}>
            {step.label} — {step.description}
          </span>
        </div>
      </div>

      {/* 3D Canvas */}
      <Canvas
        style={styles.canvas}
        camera={{ position: [0, 0.3, 2], fov: 60, near: 0.01, far: 100 }}
      >
        <color attach="background" args={["#0a0a18"]} />
        <fog attach="fog" args={["#0a0a18", 3, 8]} />
        <XR store={xrStore}>
          <XROrigin>
            <Scene
              mode={mode}
              stepIdx={stepIdx}
              displayLayout={displayLayout}
              step={step}
              aiLoading={gestureAgent.loading}
              aiResult={gestureAgent.result}
              onGestureDetected={handleGestureDetected}
            />
          </XROrigin>
        </XR>
      </Canvas>
    </div>
  );
}

// ---- styles ----

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
    width: "100%",
    height: "100vh",
    background: "#0a0a14",
    overflow: "hidden",
  },
  canvas: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    padding: "1rem",
    pointerEvents: "none",
  },
  header: {
    marginBottom: "0.5rem",
  },
  title: {
    margin: 0,
    fontSize: "1.3rem",
    color: "#fff",
    textShadow: "0 2px 8px rgba(0,0,0,0.5)",
  },
  subtitle: {
    margin: "0.15rem 0 0",
    fontSize: "0.8rem",
    color: "#888",
  },
  controls: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    flexWrap: "wrap" as const,
    pointerEvents: "auto" as const,
  },
  btn: {
    padding: "0.4rem 0.8rem",
    borderRadius: 6,
    border: "1px solid #333",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    background: "#1a1a2e",
    color: "#ccc",
  },
  btnAR: {
    background: "linear-gradient(135deg, #4488ff, #44ff88)",
    color: "#000",
    border: "none",
    fontWeight: 700,
    fontSize: "0.9rem",
    padding: "0.5rem 1.2rem",
  },
  btnPrimary: {
    background: "#4488ff",
    color: "#fff",
    border: "none",
  },
  modeToggle: {
    display: "flex",
    borderRadius: 6,
    overflow: "hidden",
    border: "1px solid #333",
  },
  modeBtn: {
    padding: "0.3rem 0.6rem",
    fontSize: "0.72rem",
    fontWeight: 700,
    border: "none",
    cursor: "pointer",
    background: "transparent",
    color: "#666",
  },
  modeBtnActive: {
    background: "#2a3a5a",
    color: "#4488ff",
  },
  modeBtnActiveAI: {
    background: "#3a2a5a",
    color: "#aa88ff",
  },
  stepLabel: {
    fontSize: "0.75rem",
    color: "#888",
    marginLeft: "0.5rem",
  },
};
