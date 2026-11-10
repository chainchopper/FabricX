// Inline Babel plugin (Slice A, the Forge): rewrite the
// `import.meta` expression for Metro's bundles.
//
// Why: Metro emits classic scripts (and Hermes bytecode on
// native) — neither can parse `import.meta`, and a single
// surviving occurrence is a parse error for the WHOLE bundle.
// Exactly one module in the app's graph uses it: 67js's
// kernel-offload chunk, whose worker factory reads
// `import.meta.url` to locate its kernel worker. That worker
// path cannot work under Metro bundling in any case (Metro
// does not emit the worker as a separate asset), and nothing
// on the Forge path calls it — GPU offload serves 67js's
// bake/cloth/pattern extras, not scene authoring or rendering.
// The rewrite makes the expression inert ({ url: undefined })
// instead of fatal; if the worker factory is ever invoked, its
// URL construction throws an ordinary, visible TypeError
// rather than the feature silently misbehaving. No app source
// uses `import.meta` (grep: zero hits outside 67js), so the
// rewrite is behavior-neutral for everything that exists
// today. This is the same transform the ecosystem's
// babel-plugin-transform-import-meta performs, inlined so the
// slice adds no dependency.
function importMetaForMetroBabelPlugin() {
  return {
    name: "import-meta-for-metro",
    visitor: {
      MetaProperty(path) {
        if (
          path.node.meta.name === "import" &&
          path.node.property.name === "meta"
        ) {
          path.replaceWithSourceString("({ url: undefined })");
        }
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [importMetaForMetroBabelPlugin],
  };
};
