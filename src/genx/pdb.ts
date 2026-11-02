/**
 * pdb — a PDB-format parser for The Fold's molecular data
 * (Slice 39, Track A).
 *
 * Real 3D structures are The Fold's centerpiece data: RCSB
 * experimental structures, AlphaFold DB predictions, and the
 * .pdb results a GenX node's compute engines (ESMFold /
 * ColabFold) write to disk. All three arrive as PDB-format
 * text — fixed-column atomic coordinates — and this module is
 * the one reader for all of them: the bundled seeds are parsed
 * with it at build time (their INDEX provenance counts are
 * this parser's output, not any website's claims), and the
 * renderer track parses node-output PDB text with it at
 * runtime.
 *
 * What it extracts is the shared contract the renderer builds
 * against — Cα backbone traces only:
 *
 *   { id, name, source, chains: [{ id, residues, ca }], totalResidues }
 *
 * Rules, all from the PDB format itself:
 * - ATOM records only for the trace; the atom whose name field
 *   trims to "CA" is the residue's alpha carbon. One Cα per
 *   residue: alternate locations other than blank/"A" are
 *   skipped, and a residue key (chain + seq + insertion code)
 *   is counted once, first accepted Cα wins.
 * - Chains group by chain ID in first-appearance order;
 *   residues keep file order within their chain.
 * - Multi-model files (MODEL/ENDMDL — NMR ensembles, AlphaFold
 *   files): model 1 only. The first ENDMDL ends the parse.
 * - HETATM is ignored for the trace EXCEPT heme groups
 *   (resName HEM/HEC): distinct heme residue keys are counted
 *   into `ligands` — hemoglobin's four hemes are the talking
 *   point, and they are a count of real file content.
 * - A Cα with non-finite coordinates is not a coordinate; the
 *   record is skipped rather than poisoning the trace.
 *
 * Pure: text in, structure out. No fetches, no storage, no deps.
 *
 * Powered by Nirvana
 */

/** Where a structure came from — stated, never implied. */
export type GenxStructureSource = "rcsb" | "alphafold" | "node";

export interface GenxStructureChain {
  /** Chain ID exactly as the file carries it ("A", "B", …). */
  id: string;
  /** Residue count — always === ca.length. */
  residues: number;
  /** Cα coordinates in residue (file) order, Ångströms. */
  ca: [number, number, number][];
}

export interface GenxStructure {
  id: string;
  name: string;
  source: GenxStructureSource;
  chains: GenxStructureChain[];
  totalResidues: number;
  /** Distinct heme groups (HETATM resName HEM/HEC) in the file. */
  ligands: number;
}

export interface GenxStructureMeta {
  id: string;
  name: string;
  source: GenxStructureSource;
}

const HEME_RESNAMES = new Set(["HEM", "HEC"]);

/**
 * Parse PDB-format text into the shared structure contract.
 * `meta` names the structure — the parser reads coordinates,
 * not titles, so identity comes from the caller (the INDEX for
 * bundled seeds, the node job for runtime outputs).
 */
export function parsePdb(text: string, meta: GenxStructureMeta): GenxStructure {
  const chains: GenxStructureChain[] = [];
  const chainById = new Map<string, GenxStructureChain>();
  const seenResidues = new Set<string>();
  const hemeKeys = new Set<string>();

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const record = line.slice(0, 6).trim();
    if (record === "ENDMDL") break; // model 1 only — see header
    if (record !== "ATOM" && record !== "HETATM") continue;

    const resName = line.slice(17, 20).trim();
    const chainId = line.slice(21, 22).trim() || "_";
    const resKey = `${chainId}|${line.slice(22, 26).trim()}|${line.charAt(26)}`;

    if (record === "HETATM") {
      if (HEME_RESNAMES.has(resName)) hemeKeys.add(resKey);
      continue;
    }

    // ATOM: the alpha carbon only, one per residue.
    if (line.slice(12, 16).trim() !== "CA") continue;
    const altLoc = line.charAt(16);
    if (altLoc !== " " && altLoc !== "A") continue;
    if (seenResidues.has(resKey)) continue;

    const x = parseFloat(line.slice(30, 38));
    const y = parseFloat(line.slice(38, 46));
    const z = parseFloat(line.slice(46, 54));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }
    seenResidues.add(resKey);

    let chain = chainById.get(chainId);
    if (!chain) {
      chain = { id: chainId, residues: 0, ca: [] };
      chainById.set(chainId, chain);
      chains.push(chain);
    }
    chain.ca.push([x, y, z]);
    chain.residues = chain.ca.length;
  }

  return {
    id: meta.id,
    name: meta.name,
    source: meta.source,
    chains,
    totalResidues: chains.reduce((a, c) => a + c.residues, 0),
    ligands: hemeKeys.size,
  };
}
