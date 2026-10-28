import { useEffect, useMemo, useRef, useState } from "react";
import { WebRTCManager, MessageHandler } from '../services/WebRTCManager';
import {
  getSignalingService,
  type SignalingConnectionState,
} from '../services/SignalingService';

/**
 * UI-facing connection state:
 * - 'online':     signaling socket connected (peers counted separately)
 * - 'local':      local transports only — the designed offline mode
 * - 'connecting': a configured signaling server is being tried
 */
export type ConnectionState = SignalingConnectionState;

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function useWebRTC(roomId: string) {
  const peerId = useMemo(() => `peer-${randomId()}`, []);
  const managerRef = useRef<WebRTCManager | null>(null);
  const [peersCount, setPeersCount] = useState(0);
  const [peerIds, setPeerIds] = useState<string[]>([]);
  /**
   * Hotfix 2.0: the signaling socket is up and the room has known
   * members on it — so sends route through the manager (data channel
   * when open, signaling relay past the grace window) even while
   * `active` is still false, and relayed frames may arrive anytime.
   */
  const [hasSignalingPeers, setHasSignalingPeers] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('local');
  const msgHandlers = useRef<Set<MessageHandler>>(new Set());

  const active = peersCount > 0;

  // Initialize WebRTCManager
  useEffect(() => {
    // Offline-first: when no signaling URL is configured, connect() is a
    // no-op that never opens a socket, and the manager runs purely on the
    // local (BroadcastChannel) transport. When a URL is configured,
    // connect() is bounded-retry and the manager joins the room whenever
    // the socket comes up — construction order no longer matters.
    const signaling = getSignalingService();
    let unsubscribeState: (() => void) | undefined;
    try {
      unsubscribeState = signaling.onStateChange((state) => {
        setConnectionState(state);
      });
      void signaling.connect();
    } catch {
      setConnectionState('local');
    }

    const manager = new WebRTCManager(roomId, peerId, signaling);
    managerRef.current = manager;

    // Update state when peers change. Hotfix 1.9: the poll is
    // faster (150ms — a data channel opening used to wait up to
    // 500ms before postViaCurrent would even try it, dead time at
    // the start of every session) and change-guarded (the old
    // version set a fresh peerIds array every tick, re-rendering
    // consumers 2x/sec forever for no change).
    let lastCount = -1;
    let lastIds = "";
    let lastSigPeers = false;
    const updatePeers = () => {
      const count = manager.getPeerCount();
      const ids = manager.getPeerIds();
      const key = ids.join(",");
      if (count !== lastCount) {
        lastCount = count;
        setPeersCount(count);
      }
      if (key !== lastIds) {
        lastIds = key;
        setPeerIds(ids);
      }
      const sigPeers = manager.hasSignalingPeers();
      if (sigPeers !== lastSigPeers) {
        lastSigPeers = sigPeers;
        setHasSignalingPeers(sigPeers);
      }
    };
    updatePeers();

    // Poll for peer updates (in production, manager could emit events)
    const interval = setInterval(updatePeers, 150);

    // Wire up message handlers
    const unsubscribe = manager.onMessage((data, from) => {
      msgHandlers.current.forEach((h) => h(data, from));
    });

    // The UI (ConnectionBadge, FabricDiagnostics, ExperienceControls)
    // dispatches this event to re-announce presence; it previously had
    // no listener anywhere. Route it to the manager.
    const onReannounce = () => {
      manager.reannounce();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('fabric:webrtc-reannounce', onReannounce);
    }

    return () => {
      clearInterval(interval);
      unsubscribe();
      if (unsubscribeState) unsubscribeState();
      if (typeof window !== 'undefined') {
        window.removeEventListener('fabric:webrtc-reannounce', onReannounce);
      }
      manager.destroy();
      managerRef.current = null;
    };
  }, [roomId, peerId]);

  const send = (payload: unknown) => {
    if (managerRef.current) {
      managerRef.current.send(payload);
    }
  };

  /** Hotfix 1.9: the ephemeral stroke lane (see WebRTCManager.sendLive). */
  const sendLive = (payload: unknown) => {
    if (managerRef.current) {
      managerRef.current.sendLive(payload);
    }
  };

  const onMessage = (handler: MessageHandler): (() => void) => {
    msgHandlers.current.add(handler);
    return () => {
      msgHandlers.current.delete(handler);
    };
  };

  return { peerId, active, peersCount, peerIds, send, sendLive, onMessage, connectionState, hasSignalingPeers };
}
