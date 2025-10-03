import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { setAudioReactive, getAudioReactive } from "../shared/utils/audioReactive";

type Controller = {
  ctx: AudioContext | null;
  stream: MediaStream | null;
  src: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  raf: number | null;
  sensitivity: number; // scale 0.5..1.6
  lastBeatAt: number;
  beatPulse: number; // 0..1, decays
};

const ctrl: Controller = {
  ctx: null,
  stream: null,
  src: null,
  analyser: null,
  raf: null,
  sensitivity: 1,
  lastBeatAt: 0,
  beatPulse: 0,
};

function ensureCtx(): AudioContext | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctrl.ctx) ctrl.ctx = new AC();
  return ctrl.ctx;
}

function stopController() {
  if (ctrl.raf) {
    cancelAnimationFrame(ctrl.raf);
    ctrl.raf = null;
  }
  try { ctrl.src?.disconnect(); } catch {}
  ctrl.src = null;
  try { ctrl.stream?.getTracks().forEach((t) => t.stop()); } catch {}
  ctrl.stream = null;
  ctrl.analyser = null;
  setAudioReactive({ enabled: false, status: "idle", energy: 0, beat: 0, bass: 0, mid: 0, treble: 0 });
}

async function startController(): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  const ctx = ensureCtx();
  if (!ctx) {
    setAudioReactive({ enabled: false, status: "error" });
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    ctrl.stream = stream;
  } catch {
    setAudioReactive({ enabled: false, status: "blocked" });
    return false;
  }

  setAudioReactive({ enabled: true, status: "listening" });
  const src = (ctrl.src = ctrl.ctx!.createMediaStreamSource(ctrl.stream!));
  const analyser = (ctrl.analyser = ctrl.ctx!.createAnalyser());
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.7;

  src.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  const loop = () => {
    if (!ctrl.analyser) {
      ctrl.raf = requestAnimationFrame(loop);
      return;
    }
    ctrl.analyser.getByteFrequencyData(data);

    // Compute energies
    const sr = ctrl.ctx!.sampleRate;
    const binHz = sr / analyser.fftSize;

    let bassSum = 0, bassCount = 0;
    let midSum = 0, midCount = 0;
    let trebSum = 0, trebCount = 0;

    for (let i = 0; i < data.length; i++) {
      const hz = i * binHz;
      const v = data[i] / 255; // 0..1
      if (hz < 150) { bassSum += v; bassCount++; }
      else if (hz < 2000) { midSum += v; midCount++; }
      else if (hz < 8000) { trebSum += v; trebCount++; }
    }

    const bass = bassCount > 0 ? bassSum / bassCount : 0;
    const mid = midCount > 0 ? midSum / midCount : 0;
    const treble = trebCount > 0 ? trebSum / trebCount : 0;

    let energy = (bass * 0.5 + mid * 0.35 + treble * 0.15);
    energy = Math.min(1, Math.max(0, energy * ctrl.sensitivity));

    // Beat detection: threshold with refractory and decay
    const now = performance.now();
    const since = now - ctrl.lastBeatAt;
    const threshold = 0.35; // base
    const peaked = energy > threshold && since > 280; // ~fast human tempo gate

    if (peaked) {
      ctrl.lastBeatAt = now;
      ctrl.beatPulse = 1;
    } else {
      ctrl.beatPulse = Math.max(0, ctrl.beatPulse - 0.05);
    }

    setAudioReactive({
      energy,
      bass,
      mid,
      treble,
      beat: ctrl.beatPulse,
    });

    ctrl.raf = requestAnimationFrame(loop);
  };
  ctrl.raf = requestAnimationFrame(loop);
  return true;
}

export function useAudioReactive() {
  const [enabled, setEnabled] = useState<boolean>(() => getAudioReactive().enabled);
  const [status, setStatus] = useState<"idle" | "listening" | "blocked" | "error">(getAudioReactive().status);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const id = setInterval(() => {
      const s = getAudioReactive();
      if (s.enabled !== enabled) setEnabled(s.enabled);
      if (s.status !== status) setStatus(s.status);
    }, 200);
    return () => clearInterval(id);
  }, [enabled, status]);

  const enable = useCallback(async (sensitivity = 1) => {
    if (Platform.OS !== "web") return false;
    ctrl.sensitivity = Math.max(0.4, Math.min(1.8, sensitivity));
    const ok = await startController();
    setEnabled(ok);
    return ok;
  }, []);

  const disable = useCallback(() => {
    if (Platform.OS !== "web") return;
    stopController();
    setEnabled(false);
  }, []);

  const setSensitivity = useCallback((s: number) => {
    ctrl.sensitivity = Math.max(0.4, Math.min(1.8, s));
  }, []);

  return { enabled, status, enable, disable, setSensitivity };
}