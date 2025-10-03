import React, { useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { loadTracks } from "./tracks";

export default function Ambience() {
  if (Platform.OS !== "web") return null;

  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const isDefaultFluid = activeExperience?.id === "default-fluid";

  // Read toggles/names from config; default track is "ambience"
  const s = (experienceConfig.specific as Record<string, unknown>) || {};
  const enabled = Boolean((s.ambienceEnabled as boolean) ?? false);
  const chosenName = String((s.ambienceFile as string) || "ambience");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // mount / cleanup
  useEffect(() => {
    if (!isDefaultFluid) return;
    let cancelled = false;
    const el = new Audio();
    el.loop = false;
    el.preload = "auto";
    el.volume = 0;
    audioRef.current = el;

    const start = async () => {
      try {
        const tracks = await loadTracks();
        const current = tracks.find((t) => t.name === chosenName) ?? tracks[0];
        if (!current) return;
        el.src = current.uri;

        if (enabled) {
          await el.play().catch(() => {});
        }
        const loop = () => {
          if (cancelled || !audioRef.current) return;
          const a = audioRef.current;
          const maxVol = 0.72;

          // Fade up/down depending on enabled
          if (enabled) {
            a.volume = Math.min(maxVol, a.volume + 0.01);
          } else {
            a.volume = Math.max(0, a.volume - 0.02);
            if (a.volume === 0 && !a.paused) a.pause();
          }

          // If near end, fade and restart (soft loop)
          const remain = isFinite(a.duration) && a.duration > 0 ? a.duration - a.currentTime : 9999;
          if (remain < 1.5 && enabled) {
            a.volume = Math.max(0, a.volume - 0.02);
            if (remain <= 0.05) {
              a.currentTime = 0;
              if (a.paused) void a.play().catch(() => {});
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        // ignore
      }
    };
    void start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
        audioRef.current.src = "";
      }
      audioRef.current = null;
    };
  }, [isDefaultFluid, chosenName, enabled]);

  return null;
}