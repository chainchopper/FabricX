import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";

type Track = { name: string; url: string };

function useTracks(): Track[] {
  const [tracks, setTracks] = useState<Track[]>([{ name: "ambience", url: "/audio/ambience.mp3" }]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/audio/manifest.json");
        if (res.ok) {
          const list = (await res.json()) as string[];
          if (Array.isArray(list) && list.length > 0 && alive) {
            const mapped = list.map((f) => ({ name: f.replace(/\.[^/.]+$/, ""), url: `/audio/${f}` }));
            setTracks(mapped);
          }
        }
      } catch {
        // ignore; fallback remains
      }
    })();
    return () => { alive = false; };
  }, []);
  return tracks;
}

export default function Ambience() {
  if (Platform.OS !== "web") return null;

  const { state, updateConfig } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const isDefaultFluid = activeExperience?.id === "default-fluid";

  const s = (experienceConfig.specific as Record<string, unknown>) || {};
  const enabled = Boolean((s.ambienceEnabled as boolean) ?? false);
  const chosen = String((s.ambienceFile as string) || "ambience.mp3");

  const tracks = useTracks();
  const current = useMemo<Track>(() => {
    const found = tracks.find((t) => t.url.endsWith(`/${chosen}`));
    return found ?? { name: "ambience", url: "/audio/ambience.mp3" };
  }, [tracks, chosen]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // mount / cleanup
  useEffect(() => {
    if (!isDefaultFluid) return;
    const el = new Audio();
    el.src = current.url;
    el.loop = false; // custom loop to fade
    el.preload = "auto";
    el.volume = 0; // ramp in
    audioRef.current = el;
    let mounted = true;

    const start = async () => {
      try {
        if (!mounted) return;
        if (enabled) {
          await el.play().catch(() => {});
        }
        const loop = () => {
          if (!audioRef.current) return;
          const a = audioRef.current;
          const maxVol = 0.72;
          // Ramp up toward cap if playing and enabled
          if (enabled) {
            a.volume = Math.min(maxVol, a.volume + 0.01);
          } else {
            a.volume = Math.max(0, a.volume - 0.02);
            if (a.volume === 0 && !a.paused) a.pause();
          }

          // Fade near end (last 1.5s), then restart and ramp up again
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
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch {}
        audioRef.current.src = "";
      }
      audioRef.current = null;
    };
  }, [isDefaultFluid, current.url, enabled]);

  // React to track change
  useEffect(() => {
    if (!audioRef.current) return;
    const a = audioRef.current;
    if (a.src.endsWith(current.url)) return;
    const wasPlaying = !a.paused;
    a.pause();
    a.src = current.url;
    a.currentTime = 0;
    a.volume = 0;
    if (enabled && wasPlaying) void a.play().catch(() => {});
  }, [current.url, enabled]);

  return null;
}