import { type ReactNode, type CSSProperties } from "react";

interface GlassPanelProps {
  rotateY?: number;
  transformOrigin?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function GlassPanel({
  rotateY = 0,
  transformOrigin,
  className = "",
  style,
  children,
}: GlassPanelProps) {
  return (
    <div
      className={`glass-panel ${className}`.trim()}
      style={{
        transform: rotateY ? `rotateY(${rotateY}deg)` : undefined,
        transformOrigin,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
