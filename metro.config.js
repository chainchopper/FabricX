const { getDefaultConfig } = require("@expo/metro-config");

module.exports = (function () {
  const config = getDefaultConfig(__dirname);

  // Ensure 3D model assets are served by Metro
  config.resolver.assetExts = [
    ...(config.resolver.assetExts || []),
    "glb",
    "gltf",
    "bin",
  ];

  return config;
})();