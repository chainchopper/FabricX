export type Transport = "webrtc" | "broadcast";
export type RealtimeStatus = { transport: Transport; peers: number; latencyMs?: number; peerIds?: string[] };

type Listener = (s: RealtimeStatus) => void;

const state: RealtimeStatus = { transport: "broadcast", peers: 0, latencyMs: undefined, peerIds: [] };
const listeners = new Set<Listener>();

export function getRealtimeStatus(): RealtimeStatus {
  return { ...state, peerIds: state.peerIds ? [...state.peerIds] : [] };
}

export function setRealtimeStatus(next: RealtimeStatus): void {
  state.transport = next.transport;
  state.peers = next.peers;
  state.latencyMs = next.latencyMs;
  state.peerIds = next.peerIds ? [...next.peerIds] : [];
  listeners.forEach((l) => l({ ...state, peerIds: state.peerIds ? [...state.peerIds] : [] }));
}

export function subscribeRealtimeStatus(fn: Listener): () => void {
  listeners.add(fn);
  fn({ ...state, peerIds: state.peerIds ? [...state.peerIds] : [] });
  return () => {
    listeners.delete(fn);
  };
}