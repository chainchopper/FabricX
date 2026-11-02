/**
 * molview-fixture — the only fixture Slice 40's headless checks need.
 *
 * Everything else runs on the REAL modules and the REAL bundled
 * files (src/genx/pdb.ts, src/genx/structures.ts, public/structures/).
 * This tiny hand-made PDB text exists for the node-intake tests: a
 * stand-in for a GenX node's results payload, shaped like what an
 * ESMFold/ColabFold engine writes — ATOM records with Cα lines in
 * exact PDB columns (two chains, five residues; consecutive Cα
 * ~3.8 Å apart). The molview check parses it with the real parser
 * and pins the result, so a column slip here fails loudly.
 */
export const TINY_PDB = [
  "HEADER    FIXTURE",
  "ATOM      1  CA  ALA A   1      10.000  10.000  10.000  1.00 10.00           C",
  "ATOM      2  CA  GLY A   2      13.800  10.200  10.100  1.00 10.00           C",
  "ATOM      3  CA  SER A   3      17.500  10.100  10.300  1.00 10.00           C",
  "ATOM      4  CA  ALA B   1      30.000  20.000  20.000  1.00 10.00           C",
  "ATOM      5  CA  GLY B   2      33.800  20.300  20.100  1.00 10.00           C",
  "TER",
  "END",
  "",
].join("\n");
