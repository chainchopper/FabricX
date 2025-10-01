import { useEffect, useMemo, useRef, useState } from "react";

type MessageHandler = (data: unknown, from: string) => void;

type Peer = {
  id: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  ready: boolean;
};

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function useWebRTC(roomId: string) {
  const peerId = useMemo(() => `peer-${randomId()}`, []);
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const msgHandlers = useRef<Set<MessageHandler>>(new Set());
  const signalRef = useRef<BroadcastChannel | null>(null);

  const peersCount = Object.values(peers).filter((p) => p.ready).length;
  const active = peersCount > 0;

  const notifyMessage = (payload: unknown, from: string) => {
    msgHandlers.current.forEach((h) => h(payload, from));
  };

  const removePeer = (id: string) => {
    setPeers((prev) => {
      const p = prev[id];
      if (p) {
        try { p.dc?.close(); } catch {}
        try { p.pc.close(); } catch {}
      }
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const createPeer = (otherId: string, asCaller: boolean) => {
    if (peers[otherId]) return peers[otherId];

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      iceCandidatePoolSize: 2,
    });

    const peer: Peer = { id: otherId, pc, dc: null, ready: false };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && signalRef.current) {
        signalRef.current.postMessage({
          t: "candidate",
          roomId,
          from: peerId,
          to: otherId,
          candidate: ev.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        removePeer(otherId);
      }
    };

    pc.ondatachannel = (ev) => {
      peer.dc = ev.channel;
      wireChannel(peer);
    };

    if (asCaller) {
      const dc = pc.createDataChannel("fabric");
      peer.dc = dc;
      wireChannel(peer);
      (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signalRef.current?.postMessage({
          t: "offer",
          roomId,
          from: peerId,
          to: otherId,
          sdp: offer,
        });
      })();
    }

    setPeers((prev) => ({ ...prev, [otherId]: peer }));
    return peer;
  };

  const wireChannel = (peer: Peer) => {
    if (!peer.dc) return;
    peer.dc.onopen = () => {
      peer.ready = true;
      setPeers((prev) => ({ ...prev, [peer.id]: { ...peer } }));
    };
    peer.dc.onclose = () => {
      peer.ready = false;
      setPeers((prev) => ({ ...prev, [peer.id]: { ...peer } }));
    };
    peer.dc.onmessage = (ev) => {
      let data: unknown = ev.data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        // keep as raw if not JSON
      }
      notifyMessage(data, peer.id);
    };
  };

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;

    const signal = new BroadcastChannel(`fabric-signal-${roomId}`);
    signalRef.current = signal;

    const onSignal = async (ev: MessageEvent) => {
      const msg = ev.data as any;
      if (!msg || msg.roomId !== roomId || msg.from === peerId) return;

      if (msg.t === "hello") {
        const weAreCaller = peerId > msg.from;
        createPeer(msg.from, weAreCaller);
      } else if (msg.t === "offer" && msg.to === peerId) {
        let peer = peers[msg.from];
        if (!peer) peer = createPeer(msg.from, false);
        await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        signal.postMessage({
          t: "answer",
          roomId,
          from: peerId,
          to: msg.from,
          sdp: answer,
        });
      } else if (msg.t === "answer" && msg.to === peerId) {
        const peer = peers[msg.from];
        if (peer) {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        }
      } else if (msg.t === "candidate" && msg.to === peerId) {
        const peer = peers[msg.from];
        if (peer) {
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch {
            // ignore invalid candidate
          }
        }
      }
    };

    signal.onmessage = onSignal;

    // announce presence
    signal.postMessage({ t: "hello", roomId, from: peerId });

    // Re-announce listener
    const onReannounce = (e: Event) => {
      const wanted = (e as CustomEvent).detail as string | undefined;
      if (wanted && wanted !== roomId) return;
      signalRef.current?.postMessage({ t: "hello", roomId, from: peerId });
    };
    window.addEventListener("fabric:webrtc-reannounce", onReannounce as EventListener);

    return () => {
      window.removeEventListener("fabric:webrtc-reannounce", onReannounce as EventListener);
      signal.close();
      Object.values(peers).forEach((p) => {
        try { p.dc?.close(); } catch {}
        try { p.pc.close(); } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, peerId]);

  const send = (payload: unknown) => {
    const str = typeof payload === "string" ? payload : JSON.stringify(payload);
    Object.values(peers).forEach((p) => {
      if (p.ready && p.dc?.readyState === "open") {
        try { p.dc.send(str); } catch {}
      }
    });
  };

  const onMessage = (handler: MessageHandler): (() => void) => {
    msgHandlers.current.add(handler);
    return () => {
      msgHandlers.current.delete(handler);
    };
  };

  return { peerId, active, peersCount, send, onMessage };
}