const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const { MockBrowserWindow } = require("../helpers/mock-electron");
const {
  createAppMenu,
  createWindow,
  sendPlayerCommand,
  openExternal,
  getSubsonicBackend,
  _state,
} = require("../../electron/main");

describe("Main Process - Window Management & Commands", () => {
  beforeEach(() => {
    MockBrowserWindow.reset();
  });

  afterEach(() => {
    _state.setMainWindow(null);
  });

  test("createAppMenu executes without throwing", () => {
    assert.doesNotThrow(() => {
      createAppMenu();
    });
  });

  test("createWindow creates and configures main window instance", () => {
    assert.doesNotThrow(() => {
      createWindow();
    });
    const mainWin = _state.getMainWindow();
    assert.ok(mainWin);
  });

  test("sendPlayerCommand forwards command to main window webContents", () => {
    const mockWin = new MockBrowserWindow();
    _state.setMainWindow(mockWin);

    const result = sendPlayerCommand("play-next");
    assert.strictEqual(result, true);

    const messages = mockWin.webContents._getSentMessages();
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].channel, "player-command");
    assert.strictEqual(messages[0].args[0], "play-next");
  });

  test("sendPlayerCommand throws when main window is destroyed or missing", () => {
    _state.setMainWindow(null);

    assert.throws(
      () => sendPlayerCommand("play-next"),
      /Main player window is not available/,
    );
  });

  test("openExternal creates new window or focuses existing if onlyOpenOnce is true", () => {
    const sampleHtml = path.resolve(__dirname, "../../app/html/settings.html");

    // First open
    openExternal(sampleHtml, true);
    const openedWindows = _state.getOpenedWindows();
    assert.strictEqual(openedWindows.has(sampleHtml), true);

    const winInstance = openedWindows.get(sampleHtml);

    // Second open with onlyOpenOnce=true focuses existing window
    openExternal(sampleHtml, true);
    assert.strictEqual(winInstance.focused, true);

    // Close window cleans up from openedWindows
    winInstance.emit("closed");
    assert.strictEqual(openedWindows.has(sampleHtml), false);
  });

  test("getSubsonicBackend starts and caches the subsonic backend server", async () => {
    const backend = await getSubsonicBackend();
    assert.ok(backend);

    // Calling again returns cached instance
    const cachedBackend = await getSubsonicBackend();
    assert.strictEqual(cachedBackend, backend);

    // Close backend to free port
    if (backend && typeof backend.close === "function") {
      await new Promise((resolve) => backend.close(resolve));
    }
  });
});
