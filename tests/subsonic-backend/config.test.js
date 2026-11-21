const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { createTempDir, cleanupTempDir, writeJson } = require("../helpers/fixtures");
const {
  setUserDataPath,
  setSubsonicSettingsPath,
  resolveUserDataDir,
  resolveSubsonicSettingsPath,
  loadSubsonicSettings,
  getDownloadDestination,
} = require("../../electron/subsonic-backend");

describe("Subsonic Backend - Configuration & Paths", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir("subsonic-config-test-");
    setUserDataPath(null);
    setSubsonicSettingsPath(null);
  });

  afterEach(() => {
    setUserDataPath(null);
    setSubsonicSettingsPath(null);
    cleanupTempDir(tmpDir);
  });

  test("setUserDataPath sets and resolveUserDataDir returns configured directory", () => {
    const customUserDir = path.join(tmpDir, "custom-user-data");
    fs.mkdirSync(customUserDir, { recursive: true });
    setUserDataPath(customUserDir);

    assert.strictEqual(resolveUserDataDir(), customUserDir);
  });

  test("resolveUserDataDir falls back to default paths when not configured", () => {
    setUserDataPath(null);
    const resolved = resolveUserDataDir();
    assert.ok(typeof resolved === "string" && resolved.length > 0);
    // Should end with user-data
    assert.ok(resolved.endsWith("user-data"));
  });

  test("setSubsonicSettingsPath sets and resolveSubsonicSettingsPath returns configured path", () => {
    const customSettingsPath = path.join(tmpDir, "custom-settings.json");
    setSubsonicSettingsPath(customSettingsPath);

    assert.strictEqual(resolveSubsonicSettingsPath(), customSettingsPath);
  });

  test("resolveSubsonicSettingsPath uses configuredUserDataPath when set", () => {
    const customUserDir = path.join(tmpDir, "user-data");
    setUserDataPath(customUserDir);
    setSubsonicSettingsPath(null);

    const resolved = resolveSubsonicSettingsPath();
    assert.strictEqual(resolved, path.join(customUserDir, "subsonicSettings.json"));
  });

  test("loadSubsonicSettings throws if settings file does not exist", () => {
    const nonExistent = path.join(tmpDir, "missing.json");
    setSubsonicSettingsPath(nonExistent);

    assert.throws(
      () => loadSubsonicSettings(),
      /subsonicSettings\.json not found/,
    );
  });

  test("loadSubsonicSettings parses root settings and applies defaults", () => {
    const settingsPath = path.join(tmpDir, "subsonicSettings.json");
    writeJson(settingsPath, {
      ip: "192.168.1.100:4533",
      user: "musicuser",
      password: "secretpassword",
    });
    setSubsonicSettingsPath(settingsPath);

    const cfg = loadSubsonicSettings();
    assert.strictEqual(cfg.filePath, settingsPath);
    assert.strictEqual(cfg.serverUrl, "http://192.168.1.100:4533");
    assert.strictEqual(cfg.ip, "192.168.1.100:4533");
    assert.strictEqual(cfg.user, "musicuser");
    assert.strictEqual(cfg.password, "secretpassword");
    assert.strictEqual(cfg.clientName, "Reload");
    assert.strictEqual(cfg.apiVersion, "1.16.1");
    assert.strictEqual(cfg.downloadDir, null);
  });

  test("loadSubsonicSettings parses nested 'main' or 'server' entries", () => {
    const settingsPath = path.join(tmpDir, "subsonicSettings.json");
    writeJson(settingsPath, {
      main: {
        serverUrl: "https://music.example.com/",
        username: "adminuser",
        password: 12345,
        clientName: "MyReload",
        apiVersion: "1.15.0",
        downloadPath: "/downloads",
      },
    });
    setSubsonicSettingsPath(settingsPath);

    const cfg = loadSubsonicSettings();
    // Trailing slash should be stripped
    assert.strictEqual(cfg.serverUrl, "https://music.example.com");
    assert.strictEqual(cfg.user, "adminuser");
    assert.strictEqual(cfg.password, "12345");
    assert.strictEqual(cfg.clientName, "MyReload");
    assert.strictEqual(cfg.apiVersion, "1.15.0");
    assert.strictEqual(cfg.downloadDir, "/downloads");
  });

  test("getDownloadDestination returns overrideDir when provided", () => {
    const override = path.join(tmpDir, "my-music");
    const dest = getDownloadDestination(override);
    assert.strictEqual(dest, path.resolve(override));
  });

  test("getDownloadDestination expands tilde '~' in overrideDir", () => {
    const dest = getDownloadDestination("~/MyMusic");
    assert.strictEqual(dest, path.join(os.homedir(), "MyMusic"));
  });

  test("getDownloadDestination uses configured downloadDir from settings", () => {
    const settingsPath = path.join(tmpDir, "subsonicSettings.json");
    const downloadFolder = path.join(tmpDir, "download-folder");
    writeJson(settingsPath, {
      downloadDir: downloadFolder,
    });
    setSubsonicSettingsPath(settingsPath);

    const dest = getDownloadDestination();
    assert.strictEqual(dest, path.resolve(downloadFolder));
  });

  test("getDownloadDestination falls back to library.json if settings downloadDir is empty", () => {
    const settingsPath = path.join(tmpDir, "subsonicSettings.json");
    writeJson(settingsPath, {});
    setSubsonicSettingsPath(settingsPath);
    setUserDataPath(tmpDir);

    const libraryJsonPath = path.join(tmpDir, "library.json");
    const libraryTarget = path.join(tmpDir, "library-dir");
    writeJson(libraryJsonPath, [libraryTarget]);

    const dest = getDownloadDestination();
    assert.strictEqual(dest, path.resolve(libraryTarget));
  });

  test("getDownloadDestination falls back to Documents/reload when nothing else configured", () => {
    setSubsonicSettingsPath(path.join(tmpDir, "nonexistent.json"));
    setUserDataPath(path.join(tmpDir, "empty-user-data"));

    const dest = getDownloadDestination();
    assert.strictEqual(dest, path.join(os.homedir(), "Documents", "reload"));
  });
});
