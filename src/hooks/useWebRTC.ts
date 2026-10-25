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

    // Update state when peers change
    const updatePeers = () => {
      setPeersCount(manager.getPeerCount());
      setPeerIds(manager.getPeerIds());
    };
    updatePeers();

    // Poll for peer updates (in production, manager could emit events)
    const interval = setInterval(updatePeers, 500);

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

  const onMessage = (handler: MessageHandler): (() => void) => {
    msgHandlers.current.add(handler);
    return () => {
      msgHandlers.current.delete(handler);
    };
  };

  return { peerId, active, peersCount, peerIds, send, onMessage, connectionState };
}
