import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { getJSON, setJSON } from "../../app/utils/storage";

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  t: number;
};

const NAME_KEY = "fabric_display_name_v1";

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function useFabricChat(roomId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [name, setName] = useState<string>("Weaver");
  const [enabled, setEnabled] = useState<boolean>(Platform.OS === "web" && "BroadcastChannel" in window);
  const [connected, setConnected] = useState<boolean>(false);
  const chanRef = useRef<BroadcastChannel | null>(null);
  const userId = useMemo(() => `u-${randomId()}`, []);

  // load name
  useEffect(() => {
    let mounted = true;
    getJSON<string | null>(NAME_KEY, null).then((n) => {
      if (!mounted) return;
      if (n && typeof n === "string" && n.trim().length >= 2) setName(n);
    });
    return () => { mounted = false; };
  }, []);

  // open channel
  useEffect(() => {
    if (!enabled) return;
    const key = `fabric-chat-${roomId}`;
    const bc = new BroadcastChannel(key);
    chanRef.current = bc;
    setConnected(true);

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as ChatMessage | null;
      if (!msg || typeof msg !== "object") return;
      if (!("text" in msg) || !("name" in msg) || !("userId" in msg)) return;
      setMessages((prev) => {
        const next = [...prev, msg];
        return next.slice(-80);
      });
    };
    bc.onmessage = onMessage;

    return () => {
      bc.close();
      chanRef.current = null;
      setConnected(false);
    };
  }, [roomId, enabled]);

  const send = (text: string) => {
    if (!enabled || !chanRef.current) return false;
    const cleaned = text.trim();
    if (cleaned.length === 0) return false;
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId,
      name: name.trim().slice(0, 32) || "Weaver",
      text: cleaned.slice(0, 400),
      t: Date.now(),
    };
    try {
      chanRef.current.postMessage(msg);
      // locally echo (in case the browser suppresses self-delivery)
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === msg.id);
        const next = exists ? prev : [...prev, msg];
        return next.slice(-80);
      });
      return true;
    } catch {
      return false;
    }
  };

  const updateName = (next: string) => {
    const cleaned = next.replace(/\s+/g, " ").trim().slice(0, 32);
    setName(cleaned || "Weaver");
    void setJSON(NAME_KEY, cleaned || "Weaver");
  };

  return { messages, send, name, updateName, enabled, connected, userId };
}