/**
 * specGlossMaterial — teach the character loader the one glTF
 * dialect it currently drops on the floor.
 *
 * THE PROBLEM (diagnosed in Slice 38, proven headlessly against
 * the repo's own three@0.180.0): Terrell's Trauma GLBs carry
 * their ONLY color texture inside the legacy extension
 * `KHR_materials_pbrSpecularGlossiness` — listed in
 * `extensionsRequired` — and their standard
 * `pbrMetallicRoughness` block is EMPTY. three r180's
 * GLTFLoader does not implement that extension at all (it logs
 * "Unknown extension" and drops it), so the material is
 * constructed from the empty block at the glTF spec defaults:
 * color #ffffff, metalness 1, roughness 1, NO map. The bytes
 * load, the bind reports ready, the skeleton and clip are
 * perfect — and Trauma stands on the stage as an untextured
 * pale figure lit mostly by his emissive map. "The app
 * supposedly loads models but does nothing" was this, exactly.
 *
 * THE FIX: a GLTFLoader plugin, registered on the character
 * loader, named after the extension (which also makes the
 * loader treat the extension as known — no more warning). It
 * implements the loader's own `extendMaterialParams` hook —
 * the same hook three's built-in material extensions use — so
 * the conversion happens INSIDE the loader's material
 * construction, through the loader's own texture pipeline
 * (`parser.assignTexture`, sRGB color slot, texCoord and
 * texture-transform handling included). The surviving
 * normalMap / emissiveMap are the loader's own work and are
 * not touched.
 *
 * SCOPE — STRICT, diffuse-only. A material converts ONLY when
 * its spec-gloss block is the exact shape these files carry:
 *
 *   - a `diffuseTexture` is present, AND
 *   - `specularFactor` is present and exactly [0, 0, 0]
 *     (absent would mean the spec default [1, 1, 1]), AND
 *   - there is NO `specularGlossinessTexture`, AND
 *   - `diffuseFactor` is absent or exactly [1, 1, 1, 1], AND
 *   - the metallic-roughness block carries no color of its
 *     own (no baseColorTexture / baseColorFactor to fight).
 *
 * For that shape the faithful metallic-roughness equivalent
 * is exact, not an approximation: the specular term is zero,
 * so nothing glossy exists to preserve — map = the diffuse
 * texture, color #ffffff, metalness 0, roughness 1.
 *
 * Anything else — real specular, a gloss map, a tinted
 * diffuse, color already living in the standard block — is
 * LEFT UNTOUCHED and NOTED (console warning + the report on
 * `gltf.userData.specGloss`), never approximated. Approximating
 * real gloss into metalness/roughness is how a converter
 * quietly lies about someone's model; this one would rather
 * say so.
 *
 * Coverage: the rig builds ONE GLTFLoader for every character
 * load (DancerRig) and registers this converter on it, and
 * `loadBuiltinCharacterGltf` registers it on any loader it is
 * handed — so both built-in Trauma idles (raw .glb or base64
 * transport) and any user-picked / remote glTF loaded for the
 * character slot pass through it. A spec-gloss file whose
 * materials are all out of scope loads exactly as it did
 * before this module existed.
 *
 * The clean long-term fix remains an asset re-export in a
 * metallic-roughness workflow (the extension then disappears
 * and this plugin finds nothing to do). Until then, the
 * current uploads render as authored — his files untouched.
 */

import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * three's SRGBColorSpace, spelled out instead of imported.
 * Since r152 the color-space constants ARE these strings
 * (SRGBColorSpace === "srgb"), and assignTexture only ever
 * assigns the value onto the texture. The import is avoided
 * on purpose: this module is pulled into the headless check
 * bundles through traumaCharacter, and those bundles run
 * without a three install to resolve (the same reason
 * traumaCharacter itself imports three type-only). The
 * equality with the real constant is not assumed —
 * matfix-check binds the converted map and asserts its
 * colorSpace equals three@0.180.0's own SRGBColorSpace.
 */
const SRGB_COLOR_SPACE = "srgb";

/** The legacy extension this plugin implements. */
export const SPEC_GLOSS_EXTENSION =
  "KHR_materials_pbrSpecularGlossiness";

/** A glTF textureInfo block, structurally (index + optional texCoord). */
export interface GlbTextureInfo {
  index: number;
  texCoord?: number;
  extensions?: Record<string, unknown>;
}

/** The slice of a glTF material definition this converter reads. */
export interface GlbMaterialDef {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    baseColorTexture?: GlbTextureInfo;
    metallicFactor?: number;
    roughnessFactor?: number;
    metallicRoughnessTexture?: GlbTextureInfo;
  };
  extensions?: {
    [SPEC_GLOSS_EXTENSION]?: {
      diffuseFactor?: number[];
      diffuseTexture?: GlbTextureInfo;
      specularFactor?: number[];
      glossinessFactor?: number;
      specularGlossinessTexture?: GlbTextureInfo;
    };
    [extensionName: string]: unknown;
  };
}

/** One material's outcome, recorded on the parse result. */
export interface SpecGlossNote {
  materialIndex: number;
  materialName: string | null;
  action: "converted" | "skipped";
  reason: string;
}

/** The converter's report for one parsed file. */
export interface SpecGlossReport {
  notes: SpecGlossNote[];
}

export interface SpecGlossVerdict {
  convert: boolean;
  reason: string;
}

function isExactly(values: unknown, expected: readonly number[]): boolean {
  return (
    Array.isArray(values) &&
    values.length === expected.length &&
    values.every((v, i) => v === expected[i])
  );
}

/**
 * THE SCOPE RULE, as one pure function — the loader plugin
 * consults it for every spec-gloss material, and the headless
 * check pins it directly. It answers for the material AS
 * AUTHORED (the glTF JSON definition), never for a constructed
 * THREE material.
 */
export function specGlossVerdict(
  materialDef: GlbMaterialDef | undefined
): SpecGlossVerdict {
  const sg = materialDef?.extensions?.[SPEC_GLOSS_EXTENSION];
  if (!sg) {
    return {
      convert: false,
      reason: `material does not use ${SPEC_GLOSS_EXTENSION}`,
    };
  }
  if (sg.specularGlossinessTexture !== undefined) {
    return {
      convert: false,
      reason:
        "carries a specularGlossinessTexture — real gloss is not approximated",
    };
  }
  if (!isExactly(sg.specularFactor, [0, 0, 0])) {
    return {
      convert: false,
      reason:
        "specularFactor is not [0,0,0] (absent means the spec default [1,1,1]) — real specular is not approximated",
    };
  }
  if (
    sg.diffuseFactor !== undefined &&
    !isExactly(sg.diffuseFactor, [1, 1, 1, 1])
  ) {
    return {
      convert: false,
      reason:
        "diffuseFactor is not [1,1,1,1] — a tinted diffuse is not approximated",
    };
  }
  if (
    sg.diffuseTexture === undefined ||
    typeof sg.diffuseTexture.index !== "number"
  ) {
    return { convert: false, reason: "has no diffuseTexture to convert" };
  }
  const mr = materialDef?.pbrMetallicRoughness;
  if (
    mr &&
    (mr.baseColorTexture !== undefined || mr.baseColorFactor !== undefined)
  ) {
    return {
      convert: false,
      reason:
        "pbrMetallicRoughness already carries color — the loader's own material stands",
    };
  }
  return {
    convert: true,
    reason:
      "diffuse-only spec-gloss (specularFactor [0,0,0], no gloss texture): diffuseTexture becomes the base-color map at metalness 0 / roughness 1",
  };
}

/**
 * The slice of GLTFParser the plugin touches — the parser is
 * not part of the typed surface the app imports elsewhere, so
 * it is described structurally here (exactly the members the
 * loader's own material extensions use).
 */
interface SpecGlossParser {
  json: { materials?: GlbMaterialDef[] };
  assignTexture: (
    materialParams: Record<string, unknown>,
    mapName: string,
    mapDef: GlbTextureInfo,
    colorSpace?: string
  ) => Promise<unknown>;
}

/**
 * The plugin factory GLTFLoader.register expects: one plugin
 * instance per parse, holding that parse's notes. Registered
 * under the extension's own name, the loader treats the
 * extension as known (no "Unknown extension" warning, no
 * required-extension complaint) and dispatches material
 * construction through the hook below.
 */
function specGlossPluginFactory(parser: SpecGlossParser) {
  const notes: SpecGlossNote[] = [];
  return {
    name: SPEC_GLOSS_EXTENSION,

    extendMaterialParams(
      materialIndex: number,
      materialParams: Record<string, unknown>
    ): Promise<unknown> | undefined {
      const materialDef = parser.json.materials?.[materialIndex];
      const sg = materialDef?.extensions?.[SPEC_GLOSS_EXTENSION];
      if (!sg) return undefined; // not a spec-gloss material — not ours
      const verdict = specGlossVerdict(materialDef);
      notes.push({
        materialIndex,
        materialName: materialDef?.name ?? null,
        action: verdict.convert ? "converted" : "skipped",
        reason: verdict.reason,
      });
      if (!verdict.convert) {
        // Left untouched, and said out loud — never approximated.
        console.warn(
          `specGlossMaterial: material ${materialIndex} left unconverted — ${verdict.reason}`
        );
        return undefined;
      }
      // The rebuild, into the loader's own params before the
      // material exists: white base color (the map carries the
      // color), no metal, full rough — and the diffuse texture
      // bound as the base-color map through assignTexture, the
      // loader's own pipeline (sRGB slot included).
      const color = materialParams.color as
        | { setRGB: (r: number, g: number, b: number) => void }
        | undefined;
      if (color) color.setRGB(1, 1, 1);
      materialParams.metalness = 0;
      materialParams.roughness = 1;
      return parser.assignTexture(
        materialParams,
        "map",
        sg.diffuseTexture!,
        SRGB_COLOR_SPACE
      );
    },

    afterRoot(result: { userData: Record<string, unknown> }): void {
      const report: SpecGlossReport = { notes };
      result.userData.specGloss = report;
    },
  };
}

/**
 * Register the converter on a character loader. The factory is
 * a single module-level function, and GLTFLoader.register
 * dedupes by callback identity — registering the same loader
 * twice (the rig does, and loadBuiltinCharacterGltf does) is a
 * no-op, never a double conversion. The one cast crosses from
 * the loader's own parser type to the structural slice above:
 * the only members the plugin touches are `json` and
 * `assignTexture`, the same members three's built-in material
 * extensions use.
 */
export function registerSpecGlossConverter(loader: GLTFLoader): void {
  loader.register(
    specGlossPluginFactory as unknown as Parameters<
      GLTFLoader["register"]
    >[0]
  );
}
