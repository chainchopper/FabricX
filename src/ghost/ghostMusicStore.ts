/**
 * Ghost Music Store (Slice 68) — the one-way bridge between the
 * ghost's PLAY-MUSIC performances and the layer's music
 * renderer.
 *
 * GhostPeer hands each brain-authored phrase to the host
 * (LegacyFluid), which publishes it here; the renderer
 * (AutoComposer) subscribes and sounds exactly what was
 * published. The store holds no phrases of its own and invents
 * nothing: if no phrase is published — the ghost is off, the
 * budget is spent, the toggle is off — the renderer hears
 * silence, which is the honest state of the feature.
 *
 * The fluidBackdropStore shape (Slice 62): a tiny module-level
 * pub/sub, no React state, safe to publish from peer callbacks.
 *
 * Powered by Nirvana
 */

import type { GhostMusicPhrase } from "./GhostBrain";

type Listener = (phrase: GhostMusicPhrase) => void;

const listeners = new Set<Listener>();
let lastPhrase: GhostMusicPhrase | null = null;

/** Publish one brain-authored phrase to the renderer. */
export function publishGhostMusicPhrase(phrase: GhostMusicPhrase): void {
  lastPhrase = phrase;
  listeners.forEach((fn) => {
    try {
      fn(phrase);
    } catch {
      // A renderer failure must never reach the peer.
    }
  });
}

/** Subscribe to authored phrases; returns the unsubscribe. */
export function subscribeGhostMusicPhrases(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The most recent authored phrase, if any (diagnostics/tests). */
export function lastGhostMusicPhrase(): GhostMusicPhrase | null {
  return lastPhrase;
}
