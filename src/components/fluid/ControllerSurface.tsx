import React, { useEffect, useState, type RefObject } from "react";
import {
  getControllerSnapshot,
  requestControllerCalibration,
  setControllerRole,
  subscribeController,
  type ControllerSnapshot,
} from "../../sensors/controllerStore";
import type { MotionStats } from "../../sensors/useDeviceMotion";

/**
 * ControllerSurface — Slice 34 (Layer B3): what a phone shows
 * while it is joined to the room as a senses-only CONTROLLER.
 *
 * The surface is deliberately dark and quiet — the experience is
 * rendering on the other screens; this phone's job is to sense.
 * What it shows is the honest minimum a controller needs:
 * - the role, named plainly ("you're driving the room");
 * - the live lean (the same smoothed vector the room receives),
 *   so a tilt has visible feedback without a canvas;
 * - the calibration state — the captured neutral grip that
 *   registers this phone's orientation for the shared space —
 *   and the button that captures it;
 * - the way back: one tap returns the phone to being a screen.
 *
 * The surface covers the canvas and takes pointer events: in
 * controller mode this phone's touch does not paint (it is not a
 * screen right now), and stray taps must not fall through to a
 * canvas the user can't see. (This component is plain DOM under
 * LegacyFluid — no pointer-events:none ancestor exists here, so
 * the buttons are live by default.)
 *
 * Powered by Nirvana
 */

export default function ControllerSurface(props: {
  motionStatsRef: RefObject<MotionStats>;
  hueColor: string;
}) {
  const [snap, setSnap] = useState<ControllerSnapshot>(() =>
    getControllerSnapshot()
  );
  useEffect(() => subscribeController(setSnap), []);
  const [tilt, setTilt] = useState({ x: 0, y: 0, shakes: 0 });
  const [calNote, setCalNote] = useState<string | null>(null);

  // The readout polls the sensor hook's stats ref — the same
  // numbers the room receives, at a UI cadence, no new stream.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = props.motionStatsRef.current;
      if (s) setTilt({ x: s.tiltX, y: s.tiltY, shakes: s.shakes });
    }, 200);
    return () => window.clearInterval(id);
  }, [props.motionStatsRef]);

  const bar = (v: number) => (
    <div
      style={{
        position: "relative",
        height: 8,
        borderRadius: 4,
        background: "rgba(148,163,184,0.25)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: v < 0 ? `${50 + v * 50}%` : "50%",
          width: `${Math.abs(v) * 50}%`,
          background: props.hueColor,
        }}
      />
    </div>
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 8,
        background: "rgba(2,6,17,0.97)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          color: props.hueColor,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 3,
        }}
      >
        CONTROLLER
      </div>
      <div style={{ color: "#e5e7eb", fontSize: 20, fontWeight: 700 }}>
        You're driving the room
      </div>
      <div
        style={{
          color: "#94a3b8",
          fontSize: 13,
          lineHeight: 1.55,
          maxWidth: 340,
        }}
      >
        This phone is sensing, not showing — its tilt, shake and hand
        gestures feed the fabric, and the experience renders on the
        other screens. Your raw motion readings never leave this
        phone; only the lean and the shake travel, as events.
      </div>

      <div style={{ width: 240, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ color: "#94a3b8", fontSize: 11, textAlign: "left" }}>
          LEAN {tilt.x >= 0 ? "RIGHT" : "LEFT"} {Math.abs(tilt.x).toFixed(2)} ·{" "}
          {tilt.y >= 0 ? "DOWN" : "UP"} {Math.abs(tilt.y).toFixed(2)} ·{" "}
          {tilt.shakes} SHAKES
        </div>
        {bar(tilt.x)}
        {bar(tilt.y)}
      </div>

      <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.5, maxWidth: 340 }}>
        {snap.calibration
          ? `Calibrated — your grip at β ${snap.calibration.beta0.toFixed(0)}° / γ ${snap.calibration.gamma0.toFixed(0)}° is the room's neutral.`
          : "Not calibrated — tilt is measured from the standard grip. Hold the phone the way you naturally hold it and calibrate to make your grip the room's neutral."}
        {calNote ? (
          <div style={{ color: "#fca5a5", marginTop: 6 }}>{calNote}</div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => {
            const ok = requestControllerCalibration();
            setCalNote(
              ok
                ? null
                : "No motion is flowing right now — turn Motion on for this layer (and grant access) first; calibration reads the live sensor."
            );
          }}
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            border: `1px solid ${props.hueColor}`,
            background: "transparent",
            color: "#e5e7eb",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Calibrate my grip
        </button>
        <button
          type="button"
          onClick={() => setControllerRole("screen")}
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            border: "1px solid rgba(148,163,184,0.5)",
            background: "transparent",
            color: "#94a3b8",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Back to screen
        </button>
      </div>
    </div>
  );
}
