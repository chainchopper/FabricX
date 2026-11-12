/**
 * forgePhoto — a photograph enters the Forge scene (Slice E).
 *
 * Terrell's direction (Nov 10): "Both — checkers, then photo."
 * A photo the user picks becomes REAL scene content here, two
 * ways, both built from agent-scene ops and performed through
 * the performer's revision-checked path (forgePerformer), so a
 * print or a mosaic is scene data like everything else on the
 * Forge: the ghost's tools can move it, the scene sense can see
 * it, and Clear removes exactly it.
 *
 * THE PRINT — the photo as a material map. 67js recipes carry
 * no still-image map; the engine's one image route is the
 * sequence map (docs/agent-scene.md, "Image sequence maps"):
 * frames named by catalog asset id, decoded by the HOST before
 * the edit. The host contract is the agent-scene session's
 * third argument — createAgentScene(recipe, limits,
 * { sequenceFrames }) — a live Map from asset id to decoded
 * image that the session reads at every compile, so an image
 * registered after the scene exists is found by the apply that
 * names it (probed against the real module before this slice
 * was written; forge-photo-check re-pins it). A still photo is
 * a two-frame sequence of the same image at 1 fps: whichever
 * frame the scene clock selects, the print shows the photo.
 * The descriptor the engine builds from it is the documented
 * material-map shape ({ image, colorSpace: "srgb" } —
 * docs/material-maps.md): the photo is sampled as sRGB color,
 * NOT pushed through the linear-RGB material-color path the
 * solid colors use. The print wears that material on a plane
 * sheet (FORGE_PHOTO_SHEET_GEOMETRY_ID — the recipe box
 * compiles without UVs and the renderer's textured sync
 * refuses it, in the engine's own words; the plane carries
 * real UVs), tinted white so the map reads true, standing in
 * front of a walnut frame box that gives the print its body.
 *
 * THE MOSAIC — the photo rebuilt from blocks. The decoded
 * image is downsampled in-page (box averages over a cover-fit
 * crop), quantized to a bounded palette, and summoned as a
 * grid of small cubes in those colors (through hexToLinear —
 * mosaic blocks are ordinary colored materials, so the ACES
 * law applies to them) standing on a backing slab. Sizing is
 * dictated by the engine's own limits, not taste: one apply
 * carries at most 256 operations and a scene at most 256
 * materials, so the grid targets ~180 cells (hard cap 192)
 * and the palette caps at 48 — one print batch is ~245 ops
 * worst case, one mosaic batch ~245, both a single
 * revision-checked apply through performForgeOps.
 *
 * Ownership: photo creations wear photo-* ids (legal under
 * the ghost's node-id law, so forge-move/banish/recolor can
 * name them). The registry below is the layer's half of the
 * host contract: ForgeLayer creates its scene with
 * getForgePhotoSequenceFrames() as the session's host map and
 * registers each picked photo's decoded pixels here, under
 * the SHA-256 of those pixels — the catalog's own id shape
 * (64 lowercase hex), content-bound like the engine's
 * catalog. Registrations live for the layer's page session;
 * the scene's recipe names ids, and a scene whose image was
 * never registered refuses honestly at apply time (the
 * engine's own "image was not loaded"), never renders a
 * substitute.
 *
 * This module is pure (the registry is a Map; everything else
 * is data in, ops out) and names no engine loader — loading
 * the assets module before a print apply is the layer's job,
 * in the photo flow only (the Slice A load-order discipline:
 * on-demand modules load lazily, for the act that needs them,
 * never at scene creation). The same flow imports the
 * renderer's replace-textured-parts addon: the part sync
 * refuses textured parts until it is in, in the engine's own
 * words — a fact the browser proof's first run surfaced
 * through the performer's honest sync-failure report.
 */
import type { AgentScene } from "./forge67";
import { hexToLinear } from "./forgeScene";

/**
 * A decoded photo: the ImageData shape (width, height, RGBA
 * bytes, top row first). The layer produces it from the picked
 * file (canvas 2D at the texture cap below); the check builds
 * it synthetically. The engine's texture upload consumes this
 * shape directly as the sequence descriptor's image.
 */
export interface ForgePhotoImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * The print texture's size cap: the picked photo is decoded
 * at most this many pixels on its long edge. The engine caps
 * sequence frames at 1024 a side; a phone photo is far larger
 * and its full decode would be pure texture memory for no
 * visible gain on a 3-unit slab.
 */
export const FORGE_PHOTO_TEXTURE_MAX_EDGE = 1024;

/** The still-photo sequence rate (see the header: any frame is the photo). */
export const FORGE_PHOTO_SEQUENCE_FPS = 1;

/* ---- the host registry (the session's sequenceFrames map) -------- */

const sequenceFrames = new Map<string, ForgePhotoImage>();

/**
 * The live map ForgeLayer hands createAgentScene as its host
 * context. The session reads THIS map at compile time, so
 * registering an image after the scene exists is exactly how
 * a later print apply finds it.
 */
export function getForgePhotoSequenceFrames(): Map<string, ForgePhotoImage> {
  return sequenceFrames;
}

/** Register a decoded photo under its content id (64 lowercase hex). */
export function registerForgePhotoImage(
  assetId: string,
  image: ForgePhotoImage
): void {
  sequenceFrames.set(assetId, image);
}

export function hasForgePhotoImage(assetId: string): boolean {
  return sequenceFrames.has(assetId);
}

/** Test hook — checks reset the registry between scenarios. */
export function __resetForgePhotoRegistryForTests(): void {
  sequenceFrames.clear();
}

/* ---- shared layout ------------------------------------------------ */

/**
 * Where creations stand: facing the authored camera, on the
 * floor — FORWARD of the starter cluster (Slice G). The old
 * −2.0 put a new photo behind the starter shapes, half-hidden
 * by the ball and the post on arrival; +2.2 stands it in
 * front of the cluster (whose nearest extent is the ball's
 * front at z ≈ 1.33), on a clear sightline from the authored
 * camera — the thing the user just added arrives visible.
 */
export const FORGE_PHOTO_ANCHOR_Z = 2.2;
/** Anchor slots alternate left / right of the scene's center. */
export const FORGE_PHOTO_ANCHOR_X: readonly number[] = [-1.85, 1.85];

const FRAME_HEX = "#3a2a1c";
const BACKING_HEX = "#17181c";
export const FORGE_PHOTO_FRAME_MATERIAL_ID = "photo-frame-mat";
export const FORGE_PHOTO_BACKING_MATERIAL_ID = "photo-backing-mat";
/**
 * The print's surface geometry: a unit plane. Probed against
 * the engine (Slice E browser-proof iterations): the recipe
 * `box` generator compiles WITHOUT a UV channel, and the
 * renderer's textured sync refuses it ("Textured geometry
 * requires UV channel 0"); `plane` compiles with UVs (unit
 * square, +z facing, v = 0 at the top edge). One shared sheet
 * geometry serves every print; the walnut frame box behind it
 * carries the body's thickness.
 */
export const FORGE_PHOTO_SHEET_GEOMETRY_ID = "photo-sheet";

interface RecipeShape {
  nodes?: Array<{ id?: unknown; material?: unknown }>;
  materials?: Array<{ id?: unknown }>;
  geometries?: Array<{ id?: unknown }>;
}

function recipeOf(scene: AgentScene): RecipeShape {
  try {
    return scene.exportRecipe() as RecipeShape;
  } catch {
    return {};
  }
}

function nodeIdsOf(recipe: RecipeShape): string[] {
  if (!Array.isArray(recipe.nodes)) return [];
  return recipe.nodes
    .map((n) => (typeof n?.id === "string" ? n.id : null))
    .filter((id): id is string => id !== null);
}

function materialIdsOf(recipe: RecipeShape): Set<string> {
  const ids = new Set<string>();
  if (Array.isArray(recipe.materials)) {
    for (const m of recipe.materials) {
      if (m && typeof m.id === "string") ids.add(m.id);
    }
  }
  return ids;
}

function geometryIdsOf(recipe: RecipeShape): Set<string> {
  const ids = new Set<string>();
  if (Array.isArray(recipe.geometries)) {
    for (const g of recipe.geometries) {
      if (g && typeof g.id === "string") ids.add(g.id);
    }
  }
  return ids;
}

/** Distinct creation indices of one kind ("print" | "mosaic") in a recipe. */
function creationIndices(recipe: RecipeShape, kind: "print" | "mosaic"): number[] {
  const re =
    kind === "print" ? /^photo-print-(\d+)$/ : /^photo-mosaic-(\d+)-back$/;
  const found = new Set<number>();
  for (const id of nodeIdsOf(recipe)) {
    const m = re.exec(id);
    if (m) found.add(parseInt(m[1], 10));
  }
  return [...found].sort((a, b) => a - b);
}

function nextIndex(recipe: RecipeShape, kind: "print" | "mosaic"): number {
  const existing = creationIndices(recipe, kind);
  return existing.length === 0 ? 1 : existing[existing.length - 1] + 1;
}

/** The anchor slot for the NEXT creation: creations alternate sides. */
function nextSlot(recipe: RecipeShape): number {
  const total =
    creationIndices(recipe, "print").length +
    creationIndices(recipe, "mosaic").length;
  return total % FORGE_PHOTO_ANCHOR_X.length;
}

/**
 * Every photo-owned node id in the scene — prints, their
 * frames, mosaic blocks and backings — in creation order.
 * This is Clear's census and the chrome's count source.
 */
export function forgePhotoCreations(recipe: RecipeShape): {
  prints: number[];
  mosaics: number[];
  nodeIds: string[];
} {
  const prints = creationIndices(recipe, "print");
  const mosaics = creationIndices(recipe, "mosaic");
  const nodeIds = nodeIdsOf(recipe).filter(
    (id) => id.startsWith("photo-print-") || id.startsWith("photo-mosaic-")
  );
  return { prints, mosaics, nodeIds };
}

/* ---- the print ---------------------------------------------------- */

/**
 * The print slab's size for a photo of width x height pixels:
 * height 1.7 units at the photo's aspect, clamped so neither
 * dimension runs away (a panorama flattens, a tall portrait
 * narrows). The slab's aspect ALWAYS equals the photo's —
 * the clamps rescale both dimensions together.
 */
export function forgePrintSizeFor(
  width: number,
  height: number
): { width: number; height: number } {
  const aspect = width / height;
  let h = 1.7;
  let w = h * aspect;
  if (w > 3.4) {
    w = 3.4;
    h = w / aspect;
  }
  if (h > 2.4) {
    h = 2.4;
    w = h * aspect;
  }
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return { width: round(w), height: round(h) };
}

export interface ForgePrintBuild {
  ops: unknown[];
  index: number;
  nodeId: string;
  frameNodeId: string;
  materialId: string;
  size: { width: number; height: number };
}

/**
 * The ops that stand a photo print in the scene: its mapped
 * material, a slim slab at the photo's true aspect, and a
 * frame slab behind it (one shared frame material — added
 * only when the scene doesn't carry it yet). The caller must
 * have registered the decoded image under assetId FIRST (the
 * registry above) and loaded the engine's assets module (the
 * layer's photo flow does both); an unregistered id is the
 * engine's refusal to make, not this builder's to hide.
 */
export function buildForgePrintOps(
  scene: AgentScene,
  input: { assetId: string; width: number; height: number }
): ForgePrintBuild {
  const recipe = recipeOf(scene);
  const index = nextIndex(recipe, "print");
  const slot = nextSlot(recipe);
  const x = FORGE_PHOTO_ANCHOR_X[slot];
  const size = forgePrintSizeFor(input.width, input.height);
  const nodeId = `photo-print-${index}`;
  const frameNodeId = `photo-print-frame-${index}`;
  const materialId = `photo-print-mat-${index}`;
  const centerY = size.height / 2 + 0.02;
  const ops: unknown[] = [];
  if (!geometryIdsOf(recipe).has(FORGE_PHOTO_SHEET_GEOMETRY_ID)) {
    ops.push({
      type: "add-geometry",
      geometry: { id: FORGE_PHOTO_SHEET_GEOMETRY_ID, type: "plane" },
    });
  }
  if (!materialIdsOf(recipe).has(FORGE_PHOTO_FRAME_MATERIAL_ID)) {
    ops.push({
      type: "add-material",
      material: {
        id: FORGE_PHOTO_FRAME_MATERIAL_ID,
        color: hexToLinear(FRAME_HEX),
        metallic: 0.15,
        roughness: 0.6,
      },
    });
  }
  ops.push(
    {
      type: "add-material",
      material: {
        id: materialId,
        color: [1, 1, 1],
        metallic: 0,
        roughness: 0.55,
        map: {
          sequence: {
            frames: [input.assetId, input.assetId],
            fps: FORGE_PHOTO_SEQUENCE_FPS,
            loop: true,
          },
        },
      },
    },
    {
      type: "add-node",
      node: {
        id: frameNodeId,
        geometry: "unit-box",
        material: FORGE_PHOTO_FRAME_MATERIAL_ID,
        translation: [x, centerY, FORGE_PHOTO_ANCHOR_Z - 0.055],
        scale: [size.width + 0.14, size.height + 0.14, 0.04],
      },
    },
    {
      type: "add-node",
      node: {
        id: nodeId,
        geometry: FORGE_PHOTO_SHEET_GEOMETRY_ID,
        material: materialId,
        translation: [x, centerY, FORGE_PHOTO_ANCHOR_Z],
        scale: [size.width, size.height, 1],
      },
    }
  );
  return { ops, index, nodeId, frameNodeId, materialId, size };
}

/* ---- the mosaic --------------------------------------------------- */

/** Grid bounds (see the header: the engine's op/material budgets). */
export const FORGE_MOSAIC_MAX_CELLS = 192;
export const FORGE_MOSAIC_PALETTE_CAP = 48;

/**
 * The mosaic grid for a photo's aspect: ~180 cells, bounded
 * by FORGE_MOSAIC_MAX_CELLS, at (nearly) the photo's own
 * aspect so the cover-fit crop below discards as little as
 * possible.
 */
export function forgeMosaicGridFor(
  width: number,
  height: number
): { cols: number; rows: number } {
  const aspect = width / height;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
  const cols = clamp(Math.round(Math.sqrt(180 * aspect)), 10, 20);
  let rows = clamp(Math.round(cols / aspect), 8, 18);
  while (cols * rows > FORGE_MOSAIC_MAX_CELLS && rows > 1) rows--;
  return { cols, rows };
}

function srgbHex(r: number, g: number, b: number): string {
  const byte = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/**
 * Downsample a decoded photo to a cols x rows grid of sRGB
 * hex colors, row-major, TOP row first. The sampling window
 * is a cover-fit crop (the largest centered rectangle of the
 * source at the grid's aspect), so a grid at the photo's
 * aspect loses almost nothing and a mismatched one crops
 * evenly at the edges instead of stretching. Each cell is the
 * AREA-WEIGHTED average of the source pixels under it (a
 * pixel the cell's window only half covers counts half) — a
 * flat-color region averages to exactly that color, which is
 * what the check's quadrant fixture pins.
 */
export function downsampleForgePhoto(
  image: ForgePhotoImage,
  cols: number,
  rows: number
): string[] {
  const { width: w, height: h, data } = image;
  const gridAspect = cols / rows;
  const srcAspect = w / h;
  let cropW = w;
  let cropH = h;
  let x0 = 0;
  let y0 = 0;
  if (srcAspect > gridAspect) {
    cropW = h * gridAspect;
    x0 = (w - cropW) / 2;
  } else if (srcAspect < gridAspect) {
    cropH = w / gridAspect;
    y0 = (h - cropH) / 2;
  }
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fx0 = x0 + (c * cropW) / cols;
      const fx1 = x0 + ((c + 1) * cropW) / cols;
      const fy0 = y0 + (r * cropH) / rows;
      const fy1 = y0 + ((r + 1) * cropH) / rows;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let weight = 0;
      const px0 = Math.max(0, Math.floor(fx0));
      const px1 = Math.min(w, Math.ceil(fx1));
      const py0 = Math.max(0, Math.floor(fy0));
      const py1 = Math.min(h, Math.ceil(fy1));
      for (let y = py0; y < py1; y++) {
        const wy = Math.min(fy1, y + 1) - Math.max(fy0, y);
        if (wy <= 0) continue;
        for (let x = px0; x < px1; x++) {
          const wx = Math.min(fx1, x + 1) - Math.max(fx0, x);
          if (wx <= 0) continue;
          const wgt = wx * wy;
          const i = (y * w + x) * 4;
          sr += data[i] * wgt;
          sg += data[i + 1] * wgt;
          sb += data[i + 2] * wgt;
          weight += wgt;
        }
      }
      cells.push(
        weight > 0
          ? srgbHex(sr / weight, sg / weight, sb / weight)
          : "#000000"
      );
    }
  }
  return cells;
}

/**
 * Quantize cell colors to a bounded shared palette: channels
 * snap to a step grid that coarsens (16, 32, 64, ...) until
 * the distinct count fits the cap. Deterministic — the same
 * photo always builds the same mosaic — and the palette a
 * cell lands in is the quantized color itself, never a
 * nearest-neighbor guess.
 */
export function quantizeForgePalette(
  hexes: string[],
  cap: number = FORGE_MOSAIC_PALETTE_CAP
): { palette: string[]; indices: number[] } {
  const parse = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace(/^#/, ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  for (const step of [16, 32, 64, 128, 256]) {
    const snap = (v: number) =>
      step >= 256 ? (v >= 128 ? 255 : 0) : Math.min(255, Math.round(v / step) * step);
    const palette: string[] = [];
    const indexByHex = new Map<string, number>();
    const indices: number[] = [];
    for (const hex of hexes) {
      const [r, g, b] = parse(hex);
      const q = srgbHex(snap(r), snap(g), snap(b));
      let idx = indexByHex.get(q);
      if (idx === undefined) {
        idx = palette.length;
        indexByHex.set(q, idx);
        palette.push(q);
      }
      indices.push(idx);
    }
    if (palette.length <= cap || step === 256) return { palette, indices };
  }
  // Unreachable (the loop returns at step 256 at the latest).
  return { palette: [], indices: hexes.map(() => 0) };
}

export interface ForgeMosaicBuild {
  ops: unknown[];
  index: number;
  cols: number;
  rows: number;
  blockCount: number;
  paletteCount: number;
  backingNodeId: string;
}

/**
 * The ops that rebuild a photo as a wall of colored blocks:
 * one backing slab (shared backing material, added when
 * absent), one material per palette color, one small cube
 * per cell — all in ONE ops array for one revision-checked
 * apply through the performer. No engine module is needed:
 * every op is core agent-scene, like the ghost's tools.
 */
export function buildForgeMosaicOps(
  scene: AgentScene,
  input: { image: ForgePhotoImage }
): ForgeMosaicBuild {
  const recipe = recipeOf(scene);
  const index = nextIndex(recipe, "mosaic");
  const slot = nextSlot(recipe);
  const anchorX = FORGE_PHOTO_ANCHOR_X[slot];
  const { cols, rows } = forgeMosaicGridFor(input.image.width, input.image.height);
  const cells = downsampleForgePhoto(input.image, cols, rows);
  const { palette, indices } = quantizeForgePalette(cells);
  const pitch = Math.min(3.3 / cols, 2.2 / rows);
  const totalW = pitch * cols;
  const totalH = pitch * rows;
  const backingNodeId = `photo-mosaic-${index}-back`;
  const ops: unknown[] = [];
  if (!materialIdsOf(recipe).has(FORGE_PHOTO_BACKING_MATERIAL_ID)) {
    ops.push({
      type: "add-material",
      material: {
        id: FORGE_PHOTO_BACKING_MATERIAL_ID,
        color: hexToLinear(BACKING_HEX),
        metallic: 0,
        roughness: 0.9,
      },
    });
  }
  palette.forEach((hex, j) => {
    ops.push({
      type: "add-material",
      material: {
        id: `photo-mosaic-${index}-mat-${j}`,
        color: hexToLinear(hex),
        metallic: 0,
        roughness: 0.55,
      },
    });
  });
  ops.push({
    type: "add-node",
    node: {
      id: backingNodeId,
      geometry: "unit-box",
      material: FORGE_PHOTO_BACKING_MATERIAL_ID,
      translation: [anchorX, totalH / 2 + 0.02, FORGE_PHOTO_ANCHOR_Z - 0.085],
      scale: [totalW + 0.16, totalH + 0.16, 0.05],
    },
  });
  cells.forEach((_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    ops.push({
      type: "add-node",
      node: {
        id: `photo-mosaic-${index}-b-${i}`,
        geometry: "unit-box",
        material: `photo-mosaic-${index}-mat-${indices[i]}`,
        translation: [
          anchorX + (c - (cols - 1) / 2) * pitch,
          0.02 + pitch / 2 + (rows - 1 - r) * pitch,
          FORGE_PHOTO_ANCHOR_Z,
        ],
        scale: [pitch * 0.92, pitch * 0.92, 0.12],
      },
    });
  });
  return {
    ops,
    index,
    cols,
    rows,
    blockCount: cells.length,
    paletteCount: palette.length,
    backingNodeId,
  };
}

/* ---- clear -------------------------------------------------------- */

/**
 * The ops that remove every photo creation from the scene —
 * one batch through the performer. Removal names nodes only:
 * other work in the scene (the starter, ghost summons, a
 * game in progress is the layer's concern) is untouched, and
 * the creations' materials leave with their last user in
 * spirit — the engine keeps orphaned material records, which
 * render nothing; the parts census returns to exactly what
 * it was before the creations. Returns null when the scene
 * holds no photo creations.
 */
export function buildForgeClearPhotoOps(scene: AgentScene): unknown[] | null {
  const { nodeIds } = forgePhotoCreations(recipeOf(scene));
  if (nodeIds.length === 0) return null;
  // Backings and frames go last (they are the creations'
  // supports); within one atomic apply the order is cosmetic.
  const supports = nodeIds.filter(
    (id) => id.endsWith("-back") || id.includes("-frame-")
  );
  const rest = nodeIds.filter((id) => !supports.includes(id));
  return [...rest, ...supports].map((id) => ({
    type: "remove-node",
    id,
    recursive: false,
  }));
}
