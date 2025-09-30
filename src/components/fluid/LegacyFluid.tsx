import React, { useEffect, useRef } from "react";
import { LegacyFluidEngine } from "./LegacyFluidEngine";

export default function LegacyFluid() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<LegacyFluidEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    engineRef.current = new LegacyFluidEngine(canvasRef.current, containerRef.current);
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: "transparent",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
        }}
      />
    </div>
  );
}