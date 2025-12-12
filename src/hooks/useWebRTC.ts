import { useEffect, useMemo, useRef, useState } from "react";
import { WebRTCManager, MessageHandler } from '../services/WebRTCManager';
import { getSignalingService } from '../services/SignalingService';

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function useWebRTC(roomId: string) {
  const peerId = useMemo(() => `peer-${randomId()}`, []);
  const managerRef = useRef<WebRTCManager | null>(null);
  const [peersCount, setPeersCount] = useState(0);
  const [peerIds, setPeerIds] = useState<string[]>([]);
  const msgHandlers = useRef<Set<MessageHandler>>(new Set());

  const active = peersCount > 0;

  // Initialize WebRTCManager
  useEffect(() => {
    // Try to get signaling service, but don't require it (fallback to BroadcastChannel)
    let signaling = null;
    try {
      signaling = getSignalingService();
      // Try to connect, but don't block on it
      signaling.connect().catch(() => {
        console.log('[useWebRTC] Signaling server not available, using fallback');
      });
    } catch {
      console.log('[useWebRTC] Signaling service not available, using fallback');
    }

    const manager = new WebRTCManager(roomId, peerId, signaling);
    managerRef.current = manager;

    // Update state when peers change
    const updatePeers = () => {
      setPeersCount(manager.getPeerCount());
      setPeerIds(manager.getPeerIds());
    };

    // Poll for peer updates (in production, manager could emit events)
    const interval = setInterval(updatePeers, 500);

    // Wire up message handlers
    const unsubscribe = manager.onMessage((data, from) => {
      msgHandlers.current.forEach((h) => h(data, from));
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
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

  return { peerId, active, peersCount, peerIds, send, onMessage };
}