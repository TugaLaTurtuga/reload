const path = require("path");
const fs = require("fs");
const os = require("os");

function createMockWebContents() {
  const sentMessages = [];
  const listeners = new Map();
  return {
    send: (channel, ...args) => {
      sentMessages.push({ channel, args });
    },
    executeJavaScript: async (code) => {
      if (code.includes("outerHTML")) {
        return '<div id="app"><div id="library-container"></div><div id="player-container" style="color: red;"></div></div>';
      }
      return "";
    },
    toggleDevTools: () => {},
    on: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    emit: (event, ...args) => {
      const handlers = listeners.get(event) || [];
      handlers.forEach((h) => h(...args));
    },
    _getSentMessages: () => sentMessages,
    _listeners: listeners,
  };
}

class MockBrowserWindow {
  constructor(options = {}) {
    this.options = options;
    this.webContents = createMockWebContents();
    this.events = new Map();
    this.visible = true;
    this.destroyed = false;
    this.maximized = false;
    this.bounds = { x: 100, y: 100, width: options.width || 1200, height: options.height || 800 };
    this.loadedFile = null;
    MockBrowserWindow.instances.push(this);
  }

  loadFile(filePath) {
    this.loadedFile = filePath;
    return Promise.resolve();
  }

  on(event, handler) {
    if (!this.events.has(event)) this.events.set(event, []);
    this.events.get(event).push(handler);
    return this;
  }

  emit(event, ...args) {
    const handlers = this.events.get(event) || [];
    handlers.forEach((h) => h(...args));
  }

  hide() {
    this.visible = false;
  }

  show() {
    this.visible = true;
  }

  focus() {
    this.focused = true;
  }

  close() {
    this.emit("close", { preventDefault: () => {} });
    this.destroyed = true;
    this.visible = false;
    this.emit("closed");
  }

  reload() {
    this.reloaded = true;
  }

  isMaximized() {
    return this.maximized;
  }

  maximize() {
    this.maximized = true;
  }

  unmaximize() {
    this.maximized = false;
  }

  isDestroyed() {
    return this.destroyed;
  }

  isVisible() {
    return this.visible;
  }

  getBounds() {
    return { ...this.bounds };
  }

  static fromWebContents(webContents) {
    return (
      MockBrowserWindow.instances.find((w) => w.webContents === webContents) ||
      MockBrowserWindow.instances[0] ||
      new MockBrowserWindow()
    );
  }

  static getFocusedWindow() {
    return MockBrowserWindow.instances.find((w) => w.focused) || MockBrowserWindow.instances[0] || null;
  }

  static getAllWindows() {
    return MockBrowserWindow.instances.filter((w) => !w.destroyed);
  }

  static reset() {
    MockBrowserWindow.instances = [];
  }
}
MockBrowserWindow.instances = [];

function createMockApp(tmpDir) {
  const events = new Map();
  return {
    isQuiting: false,
    setName: (name) => {
      this.name = name;
    },
    getPath: (name) => {
      return path.join(tmpDir, name || "userData");
    },
    on: (event, handler) => {
      if (!events.has(event)) events.set(event, []);
      events.get(event).push(handler);
    },
    emit: (event, ...args) => {
      const handlers = events.get(event) || [];
      handlers.forEach((h) => h(...args));
    },
    whenReady: () => Promise.resolve(),
    quit: () => {
      this.isQuiting = true;
    },
    dock: {
      setIcon: (icon) => {
        this.dockIcon = icon;
      },
    },
  };
}

module.exports = {
  createMockWebContents,
  MockBrowserWindow,
  createMockApp,
};
