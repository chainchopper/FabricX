/**
 * forgeSceneStore — the Forge's scene seam (Slice B).
 *
 * Slice A left the live 67js scene and its renderer private to
 * ForgeLayer: the layer owns the engine because the engine is a
 * view concern (canvas, WebGL2 context, frame loop). But the
 * ghost's scene tools need to reach that scene without reaching
 * INTO the component — so the layer PUBLISHES a small handle
 * here when it mounts, and clears it when it unmounts. Ghost-side
 * code (the forge performer) asks this store for the handle at
 * perform time and works through it; it never imports, queries
 * or renders the layer.
 *
 * The idiom is the codebase's own pub/sub one — the Hands store's
 * register/get for live elements (registerHandsVideo /
 * getHandsVideoElement) and the fluid backdrop store's snapshot +
 * listeners with change-dedup and listener try/catch. The handle
 * itself is a plain object owned by the layer:
 *
 *   scene         — the live AgentScene session object. The
 *                   performer applies agent-scene ops to it and
 *                   reads its CURRENT revision at apply time.
 *   renderer      — the live Renderer67. After an apply the
 *                   performer syncs it with the scene's parts
 *                   (replaceParts when the act changed the part
 *                   set, updateParts otherwise — the engine's
 *                   topology rule) and asks for one render.
 *   refreshCamera — after a forge-camera act the scene's authored
 *                   camera has moved; the layer's frame loop
 *                   orbits from camera state it captured at
 *                   mount, so it re-reads scene.camera through
 *                   this hook. Environment changes need no hook:
 *                   the loop reads scene.environment fresh every
 *                   frame already.
 *
 * The snapshot carries only { live } — subscribers learn that a
 * scene arrived or left, never the handle itself; the handle is
 * pulled through getForgeSceneHandle() at the moment of use, so
 * a stale registration can never be acted on after unmount (the
 * layer clears on unmount, and the performer re-reads per act).
 */
import type { Renderer67 } from "67js";
import type { AgentScene } from "67js/addons/agent-scene";

export interface ForgeSceneHandle {
  scene: AgentScene;
  renderer: Renderer67;
  refreshCamera: () => void;
}

export interface ForgeSceneSnapshot {
  live: boolean;
}

let handle: ForgeSceneHandle | null = null;
let snapshot: ForgeSceneSnapshot = { live: false };
const listeners = new Set<() => void>();

function publish(next: ForgeSceneSnapshot): void {
  if (snapshot.live === next.live) return;
  snapshot = next;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A listener's failure is never the store's.
    }
  }
}

/**
 * ForgeLayer calls this on mount with its live handle and on
 * unmount with null. Registering a second handle replaces the
 * first (a remount), clearing an absent one is a no-op.
 */
export function registerForgeScene(next: ForgeSceneHandle | null): void {
  handle = next;
  publish({ live: next !== null });
}

/** The live scene handle, or null when no Forge canvas is mounted. */
export function getForgeSceneHandle(): ForgeSceneHandle | null {
  return handle;
}

export function getForgeSceneSnapshot(): ForgeSceneSnapshot {
  return snapshot;
}

export function subscribeForgeScene(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook — checks reset the module between scenarios. */
export function __resetForgeSceneForTests(): void {
  handle = null;
  snapshot = { live: false };
  listeners.clear();
}
