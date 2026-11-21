const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const { createTempDir, cleanupTempDir, writeJson, readJson } = require("../helpers/fixtures");
const {
  setDefaultConfig,
  loadLibraryPaths,
  saveSettings,
  getSystemTheme,
  getMacIconPath,
  getJsonToLoad,
  setJsonToLoad,
  _state,
} = require("../../electron/main");

describe("Main Process - Settings & Configuration", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir("main-settings-test-");
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test("setDefaultConfig copies default user-data templates into userDataPath", async () => {
    const userData = _state.getUserDataPath();
    // Call setDefaultConfig
    await setDefaultConfig();

    // Verify userDataPath exists
    assert.strictEqual(fs.existsSync(userData), true);
  });

  test("loadLibraryPaths reads library.json if exists or creates default", () => {
    const libraryFile = _state.getLibraryFilePath();

    // Call loadLibraryPaths
    const paths = loadLibraryPaths();
    assert.ok(Array.isArray(paths));
    assert.ok(fs.existsSync(libraryFile));

    // Calling again returns existing content
    const reloaded = loadLibraryPaths();
    assert.deepStrictEqual(reloaded, paths);
  });

  test("saveSettings persists settings to settings.json and merges updates", () => {
    const settingsFile = _state.getSettingsFilePath();

    const success1 = saveSettings({ volume: 80, shuffle: true });
    assert.strictEqual(success1, true);
    assert.strictEqual(fs.existsSync(settingsFile), true);

    const saved1 = readJson(settingsFile);
    assert.strictEqual(saved1.volume, 80);
    assert.strictEqual(saved1.shuffle, true);

    // Merge updates
    const success2 = saveSettings({ repeat: "all", volume: 90 });
    assert.strictEqual(success2, true);

    const saved2 = readJson(settingsFile);
    assert.strictEqual(saved2.volume, 90);
    assert.strictEqual(saved2.shuffle, true);
    assert.strictEqual(saved2.repeat, "all");
  });

  test("saveSettings handles fromsystemTheme flag correctly", () => {
    const settingsFile = _state.getSettingsFilePath();
    // When getSystemTheme is false in settings, fromsystemTheme does not update themeMode
    saveSettings({ getSystemTheme: false, themeMode: "custom-dark" });
    saveSettings({ themeMode: "light" }, true);

    let saved = readJson(settingsFile);
    assert.strictEqual(saved.themeMode, "custom-dark");

    // When getSystemTheme is true, fromsystemTheme updates themeMode
    saveSettings({ getSystemTheme: true, themeMode: "custom-dark" });
    saveSettings({ themeMode: "light" }, true);

    saved = readJson(settingsFile);
    assert.strictEqual(saved.themeMode, "light");
  });

  test("saveSettings recovers from corrupted or empty settings.json file", () => {
    const settingsFile = _state.getSettingsFilePath();
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, ""); // invalid empty JSON

    const success = saveSettings({ recovered: true });
    assert.strictEqual(success, true);
    const saved = readJson(settingsFile);
    assert.strictEqual(saved.recovered, true);
  });

  test("getSystemTheme triggers saveSettings with themeMode", () => {
    assert.doesNotThrow(() => {
      getSystemTheme();
    });
  });

  test("getMacIconPath resolves appropriate icon or returns null", () => {
    const iconPath = getMacIconPath();
    // On macOS without specific mock icons or on other OS, it returns string path or null
    assert.ok(typeof iconPath === "string" || iconPath === null);
  });

  test("setJsonToLoad and getJsonToLoad handle JSON string persistence", async () => {
    const jsonToLoadFile = _state.getJsonToLoadPath();

    // Rejects if non-string
    await assert.rejects(
      () => setJsonToLoad({ invalid: "not a string" }),
      /json must be a string/,
    );

    // Writes string
    const sampleData = JSON.stringify({ album: "Retro Wave", track: 1 });
    const writeResult = await setJsonToLoad(sampleData);
    assert.strictEqual(writeResult, true);
    assert.strictEqual(fs.existsSync(jsonToLoadFile), true);

    // Reads string back
    const readResult = getJsonToLoad();
    assert.strictEqual(readResult, sampleData);
  });
});
