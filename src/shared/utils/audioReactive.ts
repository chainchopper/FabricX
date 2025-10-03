export type AudioReactiveState = {
  enabled: boolean;
  status: "idle" | "listening" | "blocked" | "error";
  energy: number; // 0..1 overall
  bass: number;   // 0..1
  mid: number;    // 0..1
  treble: number; // 0..1
  beat: number;   // 0..1 pulse
};

type Listener = (s: AudioReactiveState) => void;

const state: AudioReactiveState = {
  enabled: false,
  status: "idle",
  energy: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  beat: 0,
};

const listeners = new Set<Listener>();

export function getAudioReactive(): AudioReactiveState {
  return { ...state };
}

export function setAudioReactive(next: Partial<AudioReactiveState>) {
  if (typeof next.enabled === "boolean") state.enabled = next.enabled;
  if (typeof next.status === "string") state.status = next.status as AudioReactiveState["status"];
  if (typeof next.energy === "number") state.energy = clamp01(next.energy);
  if (typeof next.bass === "number") state.bass = clamp01(next.bass);
  if (typeof next.mid === "number") state.mid = clamp01(next.mid);
  if (typeof next.treble === "number") state.treble = clamp01(next.treble);
  if (typeof next.beat === "number") state.beat = clamp01(next.beat);
  listeners.forEach((l) => l({ ...state }));
}

export function subscribeAudioReactive(fn: Listener): () => void {
  listeners.add(fn);
  fn({ ...state });
  return () => {
    listeners.delete(fn);
  };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}