/**
 * Slice 40 — bundled-structure loading for The Fold's molecular view.
 *
 * The registry itself is the data pipeline's (src/genx/structures.ts,
 * Slice 39): metadata + provenance for the bundled seeds (RCSB 4HHB
 * hemoglobin, AlphaFold AF-P01308 insulin) live in structureIndex.ts,
 * and the .pdb texts ship as static assets under public/structures/.
 * This module is only the runtime half the registry deliberately
 * leaves to the renderer: fetch the asset text, parse it with the
 * real parser (src/genx/pdb.ts), cache the result.
 *
 * A failed fetch or an unparseable file resolves to null — the view
 * says so honestly instead of inventing a structure.
 */
import { parsePdb } from "./pdb";
import { bundledStructureMeta } from "./structures";
import type { MolStructure } from "./molMath";

const cache = new Map<string, MolStructure>();
const inflight = new Map<string, Promise<MolStructure | null>>();

/** True when the id names a bundled structure in the registry. */
export function isBundledStructure(id: string | null | undefined): boolean {
  return bundledStructureMeta(id) !== null;
}

/**
 * Load + parse a bundled structure by id (e.g. "4HHB"). Concurrent
 * calls share one fetch; successes are cached for the session.
 */
export function loadBundledStructure(
  id: string | null | undefined,
): Promise<MolStructure | null> {
  const meta = bundledStructureMeta(id);
  if (!meta) return Promise.resolve(null);
  const hit = cache.get(meta.id);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(meta.id);
  if (pending) return pending;
  const promise = (async (): Promise<MolStructure | null> => {
    try {
      const res = await fetch(`/${meta.file}`);
      if (!res.ok) return null;
      const text = await res.text();
      const structure = parsePdb(text, {
        id: meta.id,
        name: meta.name,
        source: meta.source,
      }) as MolStructure;
      if (!structure || structure.totalResidues === 0) return null;
      cache.set(meta.id, structure);
      return structure;
    } catch {
      return null;
    } finally {
      inflight.delete(meta.id);
    }
  })();
  inflight.set(meta.id, promise);
  return promise;
}
