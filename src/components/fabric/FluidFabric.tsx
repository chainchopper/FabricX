import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { FluidEngine } from "../../simulation/FluidEngine";
import type { FluidConfig, FluidInteraction } from "../../types/fluid";
import { useFluidMultiUser } from "../../hooks/useFluidMultiUser";

export interface FluidFabricProps {
  roomId?: string;
  onReady?: (engine: FluidEngine) => void;
  customization?: Partial<FluidConfig>;
}

export const FluidFabric = forwardRef<FluidEngine | null, FluidFabricProps>(
  ({ roomId = "default", onReady, customization }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const engineRef = useRef<FluidEngine | null>(null);
    const rafRef = useRef<number | null>(null);
    const { remoteInteractions, sendInteraction } = useFluidMultiUser(roomId);

    useImperativeHandle(ref, () => engineRef.current, []);

    useEffect(() => {
      if (!canvasRef.current) return;

      const config: FluidConfig = {
        SIM_RESOLUTION: 128,
        DYE_RESOLUTION: 1024,
        DENSITY_DISSIPATION: 1,
        VELOCITY_DISSIPATION: 0.2,
        PRESSURE: 0.8,
        PRESSURE_ITERATIONS: 20,
        CURL: 30,
        SPLAT_RADIUS: 0.25,
        SPLAT_FORCE: 6000,
        SHADING: true,
        COLORFUL: true,
        PAUSED: false,
        BACK_COLOR: { r: 0, g: 0, b: 0 },
        TRANSPARENT: false,
      };

      engineRef.current = new FluidEngine(canvasRef.current, config);
      if (customization) engineRef.current.updateCustomization(customization);
      onReady?.(engineRef.current);

      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        engineRef.current?.resize();
        engineRef.current?.step(1 / 60);
      };
      loop();

      const onPointer = (e: MouseEvent | TouchEvent) => {
        if (!canvasRef.current || !engineRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const isMouse = (e as MouseEvent).clientX !== undefined;
        const cx = isMouse ? (e as MouseEvent).clientX : (e as TouchEvent).touches[0]?.clientX;
        const cy = isMouse ? (e as MouseEvent).clientY : (e as TouchEvent).touches[0]?.clientY;
        if (cx == null || cy == null) return;
        const x = (cx - rect.left) / rect.width;
        const y = 1 - (cy - rect.top) / rect.height;

        const full = sendInteraction({
          position: { x, y },
          force: { x: 0, y: 0 },
          pressure: 1.0,
        });

        engineRef.current.applySplatFromUser(full.userId, {
          position: full.position,
          force: full.force,
          pressure: full.pressure,
          color: full.color,
        });
      };

      canvasRef.current.addEventListener("mousedown", onPointer);
      canvasRef.current.addEventListener("touchstart", onPointer, { passive: true });

      const resizeObs = new ResizeObserver(() => engineRef.current?.resize());
      if (containerRef.current) resizeObs.observe(containerRef.current);

      return () => {
        resizeObs.disconnect();
        canvasRef.current?.removeEventListener("mousedown", onPointer);
        canvasRef.current?.removeEventListener("touchstart", onPointer);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        engineRef.current?.cleanup();
        engineRef.current = null;
      };
    }, [customization, onReady, roomId, sendInteraction]);

    useEffect(() => {
      if (!engineRef.current) return;
      remoteInteractions.forEach((i: FluidInteraction) => {
        engineRef.current?.applySplatFromUser(i.userId, {
          position: i.position,
          force: i.force,
          pressure: i.pressure,
          color: i.color,
        });
      });
    }, [remoteInteractions]);

    return (
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "auto",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
          }}
        />
      </div>
    );
  }
);

FluidFabric.displayName = "FluidFabric";