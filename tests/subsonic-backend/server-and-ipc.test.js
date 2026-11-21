const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const { createTempDir, cleanupTempDir, writeJson } = require("../helpers/fixtures");
const { startSubsonicBackend } = require("../../electron/subsonic-backend");

describe("Subsonic Backend - HTTP Server & IPC Handlers", () => {
  let tmpDir;
  let server;
  let baseUrl;

  before(async () => {
    tmpDir = createTempDir("subsonic-server-test-");

    const settingsPath = path.join(tmpDir, "subsonicSettings.json");
    writeJson(settingsPath, {
      ip: "127.0.0.1:4533",
      user: "admin",
      password: "secretpassword",
      downloadDir: path.join(tmpDir, "downloads"),
    });

    server = startSubsonicBackend({
      port: 0, // OS assigns available ephemeral port
      userDataPath: tmpDir,
      subsonicSettingsPath: settingsPath,
    });

    await new Promise((resolve) => {
      if (server.listening) resolve();
      else server.once("listening", resolve);
    });

    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    cleanupTempDir(tmpDir);
  });

  test("GET /api/config returns sanitized configuration with masked password", async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.user, "admin");
    assert.strictEqual(data.passwordConfigured, true);
    assert.strictEqual(data.password, undefined); // Sensitive password is masked/omitted
    assert.ok(data.serverUrl.startsWith("http://127.0.0.1:4533"));
  });

  test("GET /api/ping returns 502 when Subsonic server is unreachable", async () => {
    const res = await fetch(`${baseUrl}/api/ping`);
    assert.strictEqual(res.status, 502);
    const data = await res.json();
    assert.ok(data.error);
  });

  test("GET /api/download/status returns downloadManager state", async () => {
    const res = await fetch(`${baseUrl}/api/download/status`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(typeof data.status, "string");
    assert.strictEqual(Array.isArray(data.log), true);
  });

  test("POST /api/download/cancel cancels current download task", async () => {
    const res = await fetch(`${baseUrl}/api/download/cancel`, {
      method: "POST",
    });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(typeof data.cancelled, "boolean");
    assert.ok(data.status);
  });

  test("POST /api/download/all starts background download task or reports status", async () => {
    const res = await fetch(`${baseUrl}/api/download/all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination: path.join(tmpDir, "music-out"),
        forceOverwrite: false,
      }),
    });

    // Should return 200 or 409 if already in progress
    assert.ok([200, 409].includes(res.status));
    const data = await res.json();
    assert.ok(data.status);
  });

  test("POST /api/download/album/:id handles invalid album gracefully", async () => {
    const res = await fetch(`${baseUrl}/api/download/album/nonexistent-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // Should return 500 because upstream server is unreachable/invalid
    assert.strictEqual(res.status, 500);
    const data = await res.json();
    assert.ok(data.error);
  });

  test("GET /api/albums returns 500 when upstream server is offline", async () => {
    const res = await fetch(`${baseUrl}/api/albums?filter=albums`);
    assert.strictEqual(res.status, 500);
    const data = await res.json();
    assert.ok(data.error);
  });

  test("GET /api/library returns 500 when upstream server is offline", async () => {
    const res = await fetch(`${baseUrl}/api/library?size=10`);
    assert.strictEqual(res.status, 500);
    const data = await res.json();
    assert.ok(data.error);
  });

  test("server object exposes downloadManager, loadSubsonicSettings, getDownloadDestination", () => {
    assert.ok(server.downloadManager);
    assert.strictEqual(typeof server.loadSubsonicSettings, "function");
    assert.strictEqual(typeof server.getDownloadDestination, "function");
  });
});
