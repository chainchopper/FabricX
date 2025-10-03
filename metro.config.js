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

  config.server = config.server || {};

  // Intercept /symbolicate to avoid Metro trying to open '<anonymous>' as a file path
  config.server.enhanceMiddleware = (middleware /* , server */) => {
    return (req, res, next) => {
      try {
        const url = (req.url || "").toString();
        if (req.method === "POST" && url.endsWith("/symbolicate")) {
          // Collect body
          let raw = "";
          req.on("data", (chunk) => {
            raw += chunk;
          });
          req.on("end", () => {
            try {
              let payload = {};
              try {
                payload = JSON.parse(raw || "{}");
              } catch {
                payload = {};
              }

              const stack = Array.isArray(payload.stack) ? payload.stack : [];
              const sanitized = stack
                .filter((f) => f && typeof f === "object")
                .map((f) => {
                  const file =
                    typeof f.file === "string"
                      ? f.file.replace(/<anonymous>/g, "anonymous")
                      : f.file;
                  const methodName =
                    typeof f.methodName === "string"
                      ? f.methodName.replace(/<anonymous>/g, "anonymous")
                      : f.methodName;
                  // Keep other fields, but ensure numbers are sane
                  const lineNumber =
                    typeof f.lineNumber === "number" && isFinite(f.lineNumber)
                      ? f.lineNumber
                      : 0;
                  const column =
                    typeof f.column === "number" && isFinite(f.column)
                      ? f.column
                      : 0;
                  return { ...f, file, methodName, lineNumber, column };
                });

              // Respond with a shape Metro clients accept, without code frames
              const response = { stack: sanitized, codeFrame: null };
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(response));
            } catch {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ stack: [], codeFrame: null }));
            }
          });
          return;
        }
      } catch {
        // fall through to default middleware on any unexpected error
      }
      return middleware(req, res, next);
    };
  };

  return config;
})();