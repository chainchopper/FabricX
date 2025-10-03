const { getDefaultConfig } = require("@expo/metro-config");
const { parse } = require("url");

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
        const urlObj = parse(String(req.url || ""), true);
        const pathname = String(urlObj.pathname || "");
        if (req.method === "POST" && pathname.endsWith("/symbolicate")) {
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
                  const safe = { ...f };
                  if (typeof safe.file === "string") safe.file = safe.file.replace(/<anonymous>/g, "anonymous");
                  if (typeof safe.fileName === "string") safe.fileName = safe.fileName.replace(/<anonymous>/g, "anonymous");
                  if (typeof safe.methodName === "string") safe.methodName = safe.methodName.replace(/<anonymous>/g, "anonymous");
                  if (typeof safe.stack === "string") safe.stack = safe.stack.replace(/<anonymous>/g, "anonymous");
                  if (typeof safe.message === "string") safe.message = safe.message.replace(/<anonymous>/g, "anonymous");
                  safe.lineNumber = typeof safe.lineNumber === "number" && isFinite(safe.lineNumber) ? safe.lineNumber : 0;
                  safe.column = typeof safe.column === "number" && isFinite(safe.column) ? safe.column : 0;
                  return safe;
                });

              // Return a minimal valid response; no code frames to force Metro to avoid fs reads
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