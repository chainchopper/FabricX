/**
 * stageCharacter — the Dancer Stage's character slot.
 *
 * A tiny device-local store (same pub/sub shape as the ghost /
 * session stores) holding the user's loaded glTF character:
 *
 * - FabricMenu's THIS LAYER block for the stage offers "Load
 *   character (glTF)"; picking a file mints an object URL and lands
 *   here as status "loading". The built-in character (Trauma,
 *   traumaCharacter.ts) binds the same way from a same-origin URL
 *   via setStageCharacterRemote — one slot, two doors.
 * - DancerRig (inside the stage canvas) subscribes, loads the
 *   model with GLTFLoader, and reports "ready" (it replaces the
 *   procedural mannequin) or "failed" (the mannequin stays — a bad
 *   file never empties the stage).
 * - "Restore mannequin" clears the URL.
 *
 * The bone contract the model must expose is docs/DANCER.md: UE5
 * Mannequin bone names, bound by NAME (Mixamo skeletons resolve
 * through mixamoBones.ts); missing bones are skipped silently.
 * Nothing is bundled; a picked file never leaves the device — it
 * is read through a local object URL only.
 */

export type StageCharacterStatus = "mannequin" | "loading" | "ready" | "failed";

export interface StageCharacterState {
  url: string | null;
  name: string | null;
  status: StageCharacterStatus;
  /** True when the bound URL is a same-origin built-in asset
   *  (Trauma) rather than a device-local picked file. */
  builtin: boolean;
}

let state: StageCharacterState = {
  url: null,
  name: null,
  status: "mannequin",
  builtin: false,
};
const listeners = new Set<(s: StageCharacterState) => void>();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      // A broken subscriber must not break the slot.
    }
  });
}

export function getStageCharacterState(): StageCharacterState {
  return state;
}

export function subscribeStageCharacter(
  fn: (s: StageCharacterState) => void
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setStageCharacterLoading(url: string, name: string) {
  state = { url, name, status: "loading", builtin: false };
  emit();
}

/**
 * Bind a character from a same-origin URL (the built-in Trauma
 * idles, traumaCharacter.ts). Same slot, same load/report flow as
 * a picked file; the difference is lifecycle — the URL is not an
 * object URL, so clearing the slot must not revoke it.
 */
export function setStageCharacterRemote(url: string, name: string) {
  state = { url, name, status: "loading", builtin: true };
  emit();
}

export function setStageCharacterStatus(status: StageCharacterStatus) {
  if (state.status === status) return;
  state = { ...state, status };
  emit();
}

export function clearStageCharacter() {
  // Only picked files hold object URLs; a built-in's same-origin
  // URL is shared and must survive the slot being cleared.
  if (state.url && state.url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(state.url);
    } catch {
      // Object URLs are best-effort to revoke.
    }
  }
  state = { url: null, name: null, status: "mannequin", builtin: false };
  emit();
}

/**
 * Open the file picker for a .glb/.gltf character (web only — the
 * stage itself is a web canvas). Called from the stage's FabricMenu
 * settings block, i.e. inside a user gesture, which is what file
 * inputs require.
 */
export function requestCharacterPick() {
  if (typeof document === "undefined") return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".glb,.gltf,model/gltf-binary,model/gltf+json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setStageCharacterLoading(url, file.name);
  };
  input.click();
}
