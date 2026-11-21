const fs = require("fs");
const path = require("path");
const os = require("os");

function createTempDir(prefix = "reload-test-") {
  const tmpBase = os.tmpdir();
  const dirPath = fs.mkdtempSync(path.join(tmpBase, prefix));
  return dirPath;
}

function cleanupTempDir(dirPath) {
  if (dirPath && fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (err) {
      // ignore cleanup errors
    }
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function createDummyAudioFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Small valid-looking dummy buffer
  fs.writeFileSync(filePath, Buffer.from([0xff, 0xfb, 0x90, 0x44, 0x00, 0x00]));
}

module.exports = {
  createTempDir,
  cleanupTempDir,
  writeJson,
  readJson,
  createDummyAudioFile,
};
