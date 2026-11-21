const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const { createTempDir, cleanupTempDir, writeJson, readJson } = require("../helpers/fixtures");
const { MockBrowserWindow } = require("../helpers/mock-electron");
const { _ipcHandlers, _ipcListeners, _state } = require("../../electron/main");

describe("Main Process - IPC Handlers & Listeners", () => {
  let tmpDir;
  let mockEvent;

  beforeEach(() => {
    tmpDir = createTempDir("main-ipc-test-");
    const mockWin = new MockBrowserWindow();
    _state.setMainWindow(mockWin);

    mockEvent = {
      sender: mockWin.webContents,
    };
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
    _state.setMainWindow(null);
  });

  test("window-minimize, window-toggle-maximize, window-close listeners", () => {
    const minListener = _ipcListeners.get("window-minimize");
    assert.strictEqual(typeof minListener, "function");
    assert.doesNotThrow(() => minListener(mockEvent));

    const maxListener = _ipcListeners.get("window-toggle-maximize");
    assert.strictEqual(typeof maxListener, "function");
    assert.doesNotThrow(() => maxListener(mockEvent));

    const closeListener = _ipcListeners.get("window-close");
    assert.strictEqual(typeof closeListener, "function");
    assert.doesNotThrow(() => closeListener(mockEvent));
  });

  describe("Cursor IPC Handlers", () => {
    test("click-cursor handles button names and numeric strings", async () => {
      const handler = _ipcHandlers.get("click-cursor");
      assert.strictEqual(typeof handler, "function");

      // Valid string names
      const leftRes = await handler(mockEvent, "left");
      assert.strictEqual(typeof leftRes.ok, "boolean");

      const rightRes = await handler(mockEvent, "right");
      assert.strictEqual(typeof rightRes.ok, "boolean");

      const midRes = await handler(mockEvent, "middle");
      assert.strictEqual(typeof midRes.ok, "boolean");

      // Number button
      const numRes = await handler(mockEvent, 0);
      assert.strictEqual(typeof numRes.ok, "boolean");

      // Invalid button throws
      await assert.rejects(
        () => handler(mockEvent, "unknown_btn"),
        /Unknown button string: unknown_btn/,
      );

      await assert.rejects(
        () => handler(mockEvent, { invalid: true }),
        /Unsupported button type: object/,
      );
    });

    test("sticky-click-cursor handles press and release", async () => {
      const handler = _ipcHandlers.get("sticky-click-cursor");
      assert.strictEqual(typeof handler, "function");

      const pressRes = await handler(mockEvent, "left", true);
      assert.strictEqual(typeof pressRes.ok, "boolean");

      const releaseRes = await handler(mockEvent, "left", false);
      assert.strictEqual(typeof releaseRes.ok, "boolean");
    });

    test("scroll-cursor handles vertical and horizontal scroll", async () => {
      const handler = _ipcHandlers.get("scroll-cursor");
      assert.strictEqual(typeof handler, "function");

      const upRes = await handler(mockEvent, 0, 10);
      assert.strictEqual(upRes.ok, true);
      assert.strictEqual(upRes.action, "scrolled-up");

      const downRes = await handler(mockEvent, 0, -10);
      assert.strictEqual(downRes.ok, true);
      assert.strictEqual(downRes.action, "scrolled-down");

      const leftRes = await handler(mockEvent, 10, 0);
      assert.strictEqual(leftRes.ok, true);
      assert.strictEqual(leftRes.action, "scrolled-left");

      const rightRes = await handler(mockEvent, -10, 0);
      assert.strictEqual(rightRes.ok, true);
      assert.strictEqual(rightRes.action, "scrolled-right");
    });

    test("get-cursor-pos and set-cursor-pos handle coordinates", async () => {
      const getPosHandler = _ipcHandlers.get("get-cursor-pos");
      assert.strictEqual(typeof getPosHandler, "function");

      const pos = await getPosHandler(mockEvent);
      assert.strictEqual(typeof pos.x, "number");
      assert.strictEqual(typeof pos.y, "number");

      const setPosHandler = _ipcHandlers.get("set-cursor-pos");
      assert.strictEqual(typeof setPosHandler, "function");
      const setRes = await setPosHandler(mockEvent, 50, 50);
      assert.strictEqual(setRes.ok, true);
    });
  });

  describe("Player Command IPC Handlers", () => {
    test("player-toggle-playpause, player-next, player-prev send player commands", async () => {
      const toggle = _ipcHandlers.get("player-toggle-playpause");
      assert.strictEqual(await toggle(mockEvent), true);

      const next = _ipcHandlers.get("player-next");
      assert.strictEqual(await next(mockEvent), true);

      const prev = _ipcHandlers.get("player-prev");
      assert.strictEqual(await prev(mockEvent), true);
    });
  });

  describe("Settings & Configuration IPC Handlers", () => {
    test("get-settings and save-settings round-trip configuration", async () => {
      const getHandler = _ipcHandlers.get("get-settings");
      const saveHandler = _ipcHandlers.get("save-settings");

      const initial = await getHandler(mockEvent);
      assert.ok(typeof initial === "object");

      await saveHandler(mockEvent, { testKey: "testValue123" });
      const updated = await getHandler(mockEvent);
      assert.strictEqual(updated.testKey, "testValue123");
    });

    test("clean-new-settings empties the 'new' key in settings", async () => {
      const cleanHandler = _ipcHandlers.get("clean-new-settings");
      const getHandler = _ipcHandlers.get("get-settings");

      await cleanHandler(mockEvent);
      const settings = await getHandler(mockEvent);
      assert.deepStrictEqual(settings.new, {});
    });

    test("reset-settings and changed-json-data execute safely", async () => {
      const resetHandler = _ipcHandlers.get("reset-settings");
      assert.doesNotThrow(() => resetHandler(mockEvent));

      const changedJsonHandler = _ipcHandlers.get("changed-json-data");
      assert.doesNotThrow(() => changedJsonHandler(mockEvent));
    });
  });

  describe("File & Look Management IPC Handlers", () => {
    test("save-file writes data to target path", async () => {
      const saveFileHandler = _ipcHandlers.get("save-file");
      const targetPath = path.join(tmpDir, "saved-file.txt");

      const res = await saveFileHandler(mockEvent, targetPath, "Hello World");
      assert.strictEqual(res, true);
      assert.strictEqual(fs.readFileSync(targetPath, "utf8"), "Hello World");
    });

    test("get-all-user-looks returns array of css files", async () => {
      const looksHandler = _ipcHandlers.get("get-all-user-looks");
      const looks = await looksHandler(mockEvent);
      assert.ok(Array.isArray(looks));
    });

    test("get-look returns look file path", async () => {
      const getLookHandler = _ipcHandlers.get("get-look");
      const lookPath = await getLookHandler(mockEvent);
      assert.ok(typeof lookPath === "string");
      assert.ok(lookPath.endsWith("looks.css"));
    });

    test("open-looks-dir and open-shortcuts-dir return paths", async () => {
      const openLooks = _ipcHandlers.get("open-looks-dir");
      const looksDir = await openLooks(mockEvent);
      assert.ok(typeof looksDir === "string");

      const openShortcuts = _ipcHandlers.get("open-shortcuts-dir");
      const shortcutsDir = await openShortcuts(mockEvent);
      assert.ok(typeof shortcutsDir === "string");
    });

    test("get-theme-path and save-theme handle theme css", async () => {
      const getThemePath = _ipcHandlers.get("get-theme-path");
      const themePath = await getThemePath(mockEvent);
      assert.ok(themePath.endsWith("themes.css"));

      const saveTheme = _ipcHandlers.get("save-theme");
      const saveRes = await saveTheme(mockEvent, "/* Test Theme CSS */");
      assert.strictEqual(saveRes, true);
    });

    test("shortcuts CRUD: get-all-shortcuts, get-current-shortcut, set-current-shortcut, add-shortcut, remove-shortcut", async () => {
      const getAll = _ipcHandlers.get("get-all-shortcuts");
      const all = await getAll(mockEvent);
      assert.ok(Array.isArray(all));

      const getCurr = _ipcHandlers.get("get-current-shortcut");
      const curr = await getCurr(mockEvent);
      assert.ok(typeof curr === "string");

      const add = _ipcHandlers.get("add-shortcut");
      const added = await add(mockEvent, "test-shortcut-custom", { opts: {} });
      assert.strictEqual(added, true);

      const setCurr = _ipcHandlers.get("set-current-shortcut");
      const setRes = await setCurr(mockEvent, "test-shortcut-custom.json");
      assert.strictEqual(setRes, true);

      const remove = _ipcHandlers.get("remove-shortcut");
      const removed = await remove(mockEvent, "test-shortcut-custom");
      assert.strictEqual(removed, true);
    });
  });

  describe("Miscellaneous IPC Handlers", () => {
    test("get-change-logs returns changelogs object", async () => {
      const handler = _ipcHandlers.get("get-change-logs");
      const logs = await handler(mockEvent);
      assert.ok(typeof logs === "object");
    });

    test("get-system-fonts returns array of fonts", async () => {
      const handler = _ipcHandlers.get("get-system-fonts");
      const fonts = await handler(mockEvent);
      assert.ok(Array.isArray(fonts));
    });

    test("show-open-dialog invokes dialog.showOpenDialog", async () => {
      const handler = _ipcHandlers.get("show-open-dialog");
      const res = await handler(mockEvent, { title: "Open Music" });
      assert.ok(res);
    });

    test("get-library-paths and save-library-paths round-trip paths", async () => {
      const getHandler = _ipcHandlers.get("get-library-paths");
      const saveHandler = _ipcHandlers.get("save-library-paths");

      const paths = await getHandler(mockEvent);
      assert.ok(Array.isArray(paths));

      assert.doesNotThrow(() => {
        saveHandler(mockEvent, ["/music/library/1", "/music/library/2"]);
      });
    });

    test("get-git-info returns commitCount and shortHash", async () => {
      const handler = _ipcHandlers.get("get-git-info");
      const info = await handler(mockEvent);
      assert.ok(typeof info.commitCount === "string");
      assert.ok(typeof info.shortHash === "string");
    });

    test("reload-main-page reloads main window", async () => {
      const handler = _ipcHandlers.get("reload-main-page");
      const res = await handler(mockEvent);
      assert.strictEqual(res, true);
    });

    test("get-main-reload-html produces 2 distinct state representations", async () => {
      const handler = _ipcHandlers.get("get-main-reload-html");
      const states = await handler(mockEvent);
      assert.ok(Array.isArray(states));
      assert.strictEqual(states.length, 2);
      assert.ok(states[0].includes("library-container"));
      assert.ok(states[1].includes("player-container"));
    });
  });
});
