export type Transport = "webrtc" | "broadcast";
export type RealtimeStatus = { transport: Transport; peers: number };

type Listener = (s: RealtimeStatus) => void;

const state: RealtimeStatus = { transport: "broadcast", peers: 0 };
const listeners = new Set<Listener>();

export function getRealtimeStatus(): RealtimeStatus {
  return { ...state };
}

export function setRealtimeStatus(next: RealtimeStatus): void {
  state.transport = next.transport;
  state.peers = next.peers;
  listeners.forEach((l) => l({ ...state }));
}

export function subscribeRealtimeStatus(fn: Listener): () => void {
  listeners.add(fn);
  fn({ ...state });
  return () => {
    listeners.delete(fn);
  };
}