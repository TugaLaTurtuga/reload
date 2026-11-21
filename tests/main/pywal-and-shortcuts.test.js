const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { createTempDir, cleanupTempDir, writeJson } = require("../helpers/fixtures");
const {
  loadPywalTheme,
  watchPywalTheme,
  transformPywalTheme,
  _state,
} = require("../../electron/main");

describe("Main Process - Pywal & Theme Integration", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir("main-pywal-test-");
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test("loadPywalTheme returns parsed colors or null if missing", () => {
    const pywal = loadPywalTheme();
    // In typical test environment without pywal installed, returns null or parsed json
    assert.ok(pywal === null || typeof pywal === "object");
  });

  test("transformPywalTheme injects pywal theme block into themes.css", async () => {
    const themesFile = _state.getThemesFile();
    fs.mkdirSync(path.dirname(themesFile), { recursive: true });

    // Write existing CSS with an older pywal block
    const initialCSS = `
/* Light Theme */
[theme="light"] {
  --activeColor: #000;
}

/* Pywal mode */
[theme="pywal"] {
  --colorBlend: 0.8;
  --font: 'CustomFont, sans-serif';
  --activeColor: #old;
}
`;
    fs.writeFileSync(themesFile, initialCSS, "utf8");

    const mockPywalTheme = {
      colors: {
        color0: "#101010",
        color1: "#202020",
        color2: "#303030",
        color3: "#404040",
        color4: "#505050",
        color7: "#707070",
        color15: "#ffffff",
      },
    };

    transformPywalTheme(mockPywalTheme);

    // Give fs.writeFile a brief moment to finish
    await new Promise((resolve) => setTimeout(resolve, 50));

    const updatedCSS = fs.readFileSync(themesFile, "utf8");
    assert.ok(updatedCSS.includes('[theme="pywal"]'));
    assert.ok(updatedCSS.includes("--activeColor: #202020;"));
    assert.ok(updatedCSS.includes("--bg-2: #101010;"));
    // Should preserve previously extracted --colorBlend and --font
    assert.ok(updatedCSS.includes("--colorBlend: 0.8;"));
    assert.ok(updatedCSS.includes("--font: 'CustomFont, sans-serif';"));
  });

  test("watchPywalTheme does not throw when pywal theme does not exist", () => {
    assert.doesNotThrow(() => {
      watchPywalTheme();
    });
  });
});
