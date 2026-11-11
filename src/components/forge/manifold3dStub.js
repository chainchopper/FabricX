/**
 * manifold3dStub — the Metro resolution for 67js's OPTIONAL
 * peer `manifold-3d` when the real package is not installed
 * (Slice A, the Forge fabric).
 *
 * Why this exists: 67js loads manifold-3d ONLY through a
 * dynamic import inside its mesh-booleans path, and the engine
 * itself treats a missing peer as a supported state — it
 * throws its own descriptive "Mesh booleans need the optional
 * peer dependency manifold-3d" error when a recipe actually
 * asks for booleans. Metro, unlike Node, resolves every
 * dynamic-import specifier while bundling and hard-fails the
 * whole bundle on one it cannot find. metro.config.js maps
 * the specifier here ONLY when the real package fails to
 * resolve, so installing manifold-3d later makes this file
 * dead code with no further change.
 *
 * The stub is never imported by any code path the Forge runs
 * (the starter scene is primitives). If a future recipe does
 * reach for mesh booleans without the peer installed, the
 * dynamic import lands here and the first property read
 * throws an error that names the missing package plainly —
 * the same honesty the engine's own message has, one frame
 * earlier.
 */
module.exports = new Proxy(
  {},
  {
    get(_target, prop) {
      throw new Error(
        `manifold-3d is not installed (optional 67js peer, needed for mesh booleans); ` +
          `attempted to read ${String(prop)} from the stub`
      );
    },
  }
);
