/**
 * useCompositions — React bindings for the Slice 8 compositions
 * store, mirroring src/identity/useIdentity: subscribing ensures the
 * persisted list is loaded, and the snapshot re-renders the moment a
 * save / rename / delete lands, wherever it came from (ComposeBar,
 * Studio, or the Fabric menu).
 *
 * Powered by Nirvana
 */

import { useEffect, useState } from "react";
import {
  ensureCompositionsLoaded,
  getCompositionsSnapshot,
  subscribeCompositions,
  type CompositionsSnapshot,
} from "./compositionsStore";

export function useCompositions(): CompositionsSnapshot {
  const [snap, setSnap] = useState<CompositionsSnapshot>(() =>
    getCompositionsSnapshot()
  );
  useEffect(() => {
    void ensureCompositionsLoaded();
    return subscribeCompositions(setSnap);
  }, []);
  return snap;
}
