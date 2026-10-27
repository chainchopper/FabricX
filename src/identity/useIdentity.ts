/**
 * useIdentity — React bindings for the Slice 6 identity store.
 *
 * useLocalIdentity ensures the persisted participant identity exists
 * (generating it on first run) and exposes the menu's edit actions.
 * useIdentitySnapshot subscribes a component to the whole store —
 * local identity plus every learned peer identity — so the roster
 * and name labels re-render the moment an announce lands.
 *
 * Powered by Nirvana
 */

import { useEffect, useState } from "react";
import {
  ensureLocalIdentity,
  getIdentitySnapshot,
  setLocalIdentityHue,
  setLocalIdentityName,
  subscribeIdentity,
  type IdentitySnapshot,
  type ParticipantIdentity,
} from "./identityStore";

export function useIdentitySnapshot(): IdentitySnapshot {
  const [snap, setSnap] = useState<IdentitySnapshot>(() =>
    getIdentitySnapshot()
  );
  useEffect(() => subscribeIdentity(setSnap), []);
  return snap;
}

export function useLocalIdentity(): {
  identity: ParticipantIdentity | null;
  setName: (name: string) => void;
  setHue: (hue: number) => void;
  shuffleHue: () => void;
} {
  const snap = useIdentitySnapshot();

  useEffect(() => {
    void ensureLocalIdentity();
  }, []);

  return {
    identity: snap.self,
    setName: setLocalIdentityName,
    setHue: setLocalIdentityHue,
    shuffleHue: () => {
      if (!snap.self) return;
      // Golden-angle hop: a new hue guaranteed far from the old one,
      // so a shuffle never lands on a near-duplicate of your color.
      setLocalIdentityHue(snap.self.hue + 137.5);
    },
  };
}
