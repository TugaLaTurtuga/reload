// Compatibility entry point for CommonJS consumers.
const path = require("path");
const backendPath = path.join(__dirname, "../dist/electron/subsonic-backend.js");

module.exports = require(backendPath);

// Keep `node electron/subsonic-backend.js` working after moving its implementation.
if (require.main === module) {
  const { spawnSync } = require("child_process");
  const result = spawnSync(process.execPath, [backendPath, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
}
