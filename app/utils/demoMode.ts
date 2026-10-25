import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { getJSON, setJSON } from "./storage";

/**
 * Demo-data flag.
 *
 * When OFF (the default), drawers render their clean, real empty states —
 * no sample contacts, shop items, wallet balances, or canned suggestions.
 * When ON, the bundled sample data is shown, which is handy for demos and
 * screenshots. Nothing is deleted either way; this only gates rendering.
 *
 * Enable it by either:
 *  - opening the web app with ?demo=1 in the URL, or
 *  - persisting the flag (AsyncStorage key "fabric_demo_data_v1") via
 *    setDemoDataEnabled(true) — e.g. from a settings toggle.
 *
 * Powered by Nirvana
 */

export const DEMO_DATA_KEY = "fabric_demo_data_v1";

let cached: boolean | null = null;
const listeners = new Set<(enabled: boolean) => void>();

function urlRequestsDemo(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  try {
    const search = new URLSearchParams(window.location.search || "");
    if (search.get("demo") === "1") return true;
    const hashQuery = window.location.hash.replace(/^#\?/, "");
    if (hashQuery.includes("?") || hashQuery.includes("=")) {
      const fromHash = new URLSearchParams(hashQuery.slice(hashQuery.indexOf("?") + 1 || 0));
      if (fromHash.get("demo") === "1") return true;
    }
  } catch {
    // Malformed URL — ignore, fall through to the stored flag.
  }
  return false;
}

export async function loadDemoDataFlag(): Promise<boolean> {
  let enabled = urlRequestsDemo();
  if (!enabled) {
    const stored = await getJSON<{ enabled?: boolean } | null>(DEMO_DATA_KEY, null);
    enabled = !!stored?.enabled;
  }
  cached = enabled;
  listeners.forEach((fn) => fn(enabled));
  return enabled;
}

export async function setDemoDataEnabled(enabled: boolean): Promise<void> {
  cached = enabled;
  await setJSON(DEMO_DATA_KEY, { enabled });
  listeners.forEach((fn) => fn(enabled));
}

export function subscribeDemoData(fn: (enabled: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** React hook: current demo-data flag (loads it on first use). */
export function useDemoData(): boolean {
  const [enabled, setEnabled] = useState<boolean>(cached ?? false);

  useEffect(() => {
    let mounted = true;
    const unsub = subscribeDemoData((v) => {
      if (mounted) setEnabled(v);
    });
    if (cached === null) {
      void loadDemoDataFlag();
    } else {
      setEnabled(cached);
    }
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return enabled;
}
