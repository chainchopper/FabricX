/**
 * Compositions store — Slice 8 "Studio is real".
 *
 * Real on-device persistence for composed patterns, replacing
 * Studio's former demo list. A SavedComposition is the validated
 * PatternComposer payload plus the human context around it — the
 * prompt that produced it, a name the user can edit, and when it was
 * made — kept under fabric_compositions_v1 via the codebase's
 * getJSON/setJSON storage (app/utils/storage), in the module pub/sub
 * shape of src/identity/identityStore and src/session/sessionStore:
 * the chrome (Studio, FabricMenu, ComposeBar) reads and writes here;
 * nothing prop-drills across the canvas.
 *
 * Honesty rules baked in:
 * - Every entry is re-validated through PatternComposer's
 *   validatePattern on load AND on save. A corrupt, stale, or
 *   hand-edited entry is dropped silently rather than breaking the
 *   list or reaching the player — the composer contract is the only
 *   way a pattern exists in this app.
 * - The list is capped at MAX_COMPOSITIONS; saving beyond the cap
 *   evicts the oldest entries. The cap is surfaced in Studio's UI,
 *   not discovered by losing something silently.
 * - Playback is NOT this module's job: callers hand the stored
 *   Pattern to the existing playback path (FABRIC_PLAY_PATTERN_EVENT
 *   -> LegacyFluid's dispatchStep -> sendInteraction), so Slice 5
 *   session-mode enforcement applies to a saved composition exactly
 *   as it does to live input. A view-mode guest's playback renders
 *   locally and transmits nothing.
 *
 * Slice 15 ("Agent Shapes"): entries are now a discriminated union
 * on `kind`. Pattern entries are exactly what Slice 8 shipped —
 * entries persisted before this slice carry no `kind` field and
 * normalize as patterns, untouched. Recipe entries carry the
 * validated Recipe payload instead and play through
 * FABRIC_PLAY_RECIPE_EVENT; they are re-validated through
 * validateRecipe on load AND on save, under the same honesty rules.
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";
import { recordCompositionSaved } from "../rewards/rewardsStore";
import {
  validatePattern,
  type Pattern,
} from "./PatternComposer";
import {
  validateRecipe,
  type Recipe,
} from "./RecipeCore";

export const COMPOSITIONS_KEY = "fabric_compositions_v1";

/** Hard cap on saved compositions; the oldest are evicted past it. */
export const MAX_COMPOSITIONS = 50;

const MAX_NAME = 60;

interface SavedCompositionBase {
  id: string;
  /** Display name — starts as the artifact's name, user-editable. */
  name: string;
  /** The plain-language prompt that produced it ("" if none). */
  prompt: string;
  createdAt: number;
}

export interface SavedPatternComposition extends SavedCompositionBase {
  kind: "pattern";
  /** The validated PatternComposer payload — the playable artifact. */
  pattern: Pattern;
}

export interface SavedRecipeComposition extends SavedCompositionBase {
  kind: "recipe";
  /** The validated Recipe payload — the playable artifact. */
  recipe: Recipe;
}

export type SavedComposition =
  | SavedPatternComposition
  | SavedRecipeComposition;

export interface CompositionsSnapshot {
  /** False until the persisted list has been read once. */
  loaded: boolean;
  /** Newest first. */
  items: SavedComposition[];
}

let items: SavedComposition[] = [];
let loaded = false;
let loadPromise: Promise<void> | null = null;
let idCounter = 0;
const listeners = new Set<(s: CompositionsSnapshot) => void>();

export function getCompositionsSnapshot(): CompositionsSnapshot {
  return { loaded, items: items.slice() };
}

function emit(): void {
  const snap = getCompositionsSnapshot();
  listeners.forEach((l) => l(snap));
}

export function subscribeCompositions(
  fn: (s: CompositionsSnapshot) => void
): () => void {
  listeners.add(fn);
  fn(getCompositionsSnapshot());
  return () => {
    listeners.delete(fn);
  };
}

function persist(): void {
  void setJSON(COMPOSITIONS_KEY, items).catch(() => undefined);
}

function newId(): string {
  idCounter += 1;
  return (
    `comp-${Date.now().toString(36)}-` +
    `${idCounter.toString(36)}${Math.floor(Math.random() * 0xffffff).toString(36)}`
  );
}

function cleanName(raw: unknown, fallback: string): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, MAX_NAME) : "";
  return name || fallback;
}

/**
 * Normalize one persisted entry, or return null to drop it. The
 * payload goes through its own validator (with its stored source),
 * so what loads is exactly what the players may ever see. Entries
 * with no `kind` are Slice 8 patterns — the original shape, kept.
 */
function normalizeEntry(raw: unknown): SavedComposition | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== "string" || !e.id) return null;
  if (typeof e.createdAt !== "number" || !Number.isFinite(e.createdAt)) {
    return null;
  }
  const prompt = typeof e.prompt === "string" ? e.prompt.slice(0, 280) : "";
  if (e.kind === "recipe") {
    const rawRecipe = e.recipe as Record<string, unknown> | null;
    if (!rawRecipe || typeof rawRecipe !== "object") return null;
    const source = rawRecipe.source === "builtin" ? "builtin" : "llm";
    const recipe = validateRecipe(rawRecipe, source);
    if (!recipe) return null;
    return {
      id: e.id,
      kind: "recipe",
      name: cleanName(e.name, recipe.name),
      prompt,
      recipe,
      createdAt: e.createdAt,
    };
  }
  const rawPattern = e.pattern as Record<string, unknown> | null;
  if (!rawPattern || typeof rawPattern !== "object") return null;
  const source = rawPattern.source === "builtin" ? "builtin" : "llm";
  const pattern = validatePattern(rawPattern, source);
  if (!pattern) return null;
  return {
    id: e.id,
    kind: "pattern",
    name: cleanName(e.name, pattern.name),
    prompt,
    pattern,
    createdAt: e.createdAt,
  };
}

/**
 * Load the persisted list once (shared promise; safe to call from
 * many components). Invalid entries are dropped and the cap is
 * re-applied, so storage can never grow teeth between versions.
 */
export function ensureCompositionsLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = (async () => {
      let raw: unknown = null;
      try {
        raw = await getJSON<unknown>(COMPOSITIONS_KEY, null);
      } catch {
        raw = null;
      }
      const list = Array.isArray(raw) ? raw : [];
      items = list
        .map(normalizeEntry)
        .filter((c): c is SavedComposition => c !== null)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_COMPOSITIONS);
      loaded = true;
      emit();
    })();
  }
  return loadPromise;
}

export function getCompositionById(
  id: string | undefined | null
): SavedComposition | null {
  if (!id) return null;
  return items.find((c) => c.id === id) ?? null;
}

/**
 * Save a freshly composed pattern. The name defaults to the
 * pattern's own name (itself derived from the prompt by the
 * composer), then the prompt's opening words. Past the cap, the
 * oldest compositions are evicted. Resolves to the saved record, or
 * null if the pattern somehow fails validation.
 */
export async function saveComposition(input: {
  name?: string;
  prompt: string;
  pattern: Pattern;
}): Promise<SavedComposition | null> {
  await ensureCompositionsLoaded();
  const pattern = validatePattern(
    input.pattern,
    input.pattern?.source === "builtin" ? "builtin" : "llm"
  );
  if (!pattern) return null;
  const prompt = (input.prompt || "").trim().slice(0, 280);
  const fallback =
    pattern.name || (prompt ? prompt.slice(0, MAX_NAME) : "Untitled pattern");
  const record: SavedPatternComposition = {
    id: newId(),
    kind: "pattern",
    name: cleanName(input.name, fallback),
    prompt,
    pattern,
    createdAt: Date.now(),
  };
  items = [record, ...items].slice(0, MAX_COMPOSITIONS);
  persist();
  emit();
  // Slice 24 (Composer): a save that landed is a badge fact.
  recordCompositionSaved();
  return record;
}

/**
 * Save a recipe (Slice 15) into the same list, as a `kind:"recipe"`
 * entry. Same contract as saveComposition: validated at the door,
 * newest first, the cap evicts the oldest of either kind.
 */
export async function saveRecipeComposition(input: {
  name?: string;
  prompt: string;
  recipe: Recipe;
}): Promise<SavedComposition | null> {
  await ensureCompositionsLoaded();
  const recipe = validateRecipe(
    input.recipe,
    input.recipe?.source === "builtin" ? "builtin" : "llm"
  );
  if (!recipe) return null;
  const prompt = (input.prompt || "").trim().slice(0, 280);
  const fallback =
    recipe.name || (prompt ? prompt.slice(0, MAX_NAME) : "Untitled recipe");
  const record: SavedRecipeComposition = {
    id: newId(),
    kind: "recipe",
    name: cleanName(input.name, fallback),
    prompt,
    recipe,
    createdAt: Date.now(),
  };
  items = [record, ...items].slice(0, MAX_COMPOSITIONS);
  persist();
  emit();
  // Slice 24 (Composer): a recipe saved is a composition saved.
  recordCompositionSaved();
  return record;
}

/** Rename in place; empty names are refused (a composition keeps a name). */
export async function renameComposition(
  id: string,
  name: string
): Promise<void> {
  await ensureCompositionsLoaded();
  const clean = name.trim().slice(0, MAX_NAME);
  if (!clean) return;
  let changed = false;
  items = items.map((c) => {
    if (c.id !== id || c.name === clean) return c;
    changed = true;
    return { ...c, name: clean };
  });
  if (changed) {
    persist();
    emit();
  }
}

export async function deleteComposition(id: string): Promise<void> {
  await ensureCompositionsLoaded();
  const next = items.filter((c) => c.id !== id);
  if (next.length === items.length) return;
  items = next;
  persist();
  emit();
}
