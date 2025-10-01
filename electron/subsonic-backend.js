const { app, ipcMain } = require("electron");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { fetch } = require("undici");

const configPath = path.join(app.getPath("userData"), "subsonic-config.json");

// ---------- Config persistence ----------
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    // fallback default: one local demo server
    return {
      servers: [
        {
          id: "local",
          serverUrl: "http://192.168.1.123:4533",
          username: "root",
          password: "rootadmin",
          clientName: "Reload",
          apiVersion: "1.16.1",
          transcodeFormat: "mp3",
          maxBitRate: 320,
        },
      ],
      activeServerId: "local",
    };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 4), "utf-8");
}

let config = loadConfig();
console.log(config);

function getActiveServer() {
  return config.servers.find((s) => s.id === config.activeServerId);
}

// ---------- Helper: build Subsonic auth ----------
function authParams() {
  const c = getActiveServer();
  if (!c) throw new Error("No active Subsonic server selected");

  const salt = crypto.randomBytes(8).toString("hex");
  const token = crypto
    .createHash("md5")
    .update(c.password + salt)
    .digest("hex");

  return {
    u: c.username,
    t: token,
    s: salt,
    v: c.apiVersion || "1.16.1",
    c: c.clientName || "ElectronPlayer",
    f: "json",
  };
}

function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null) p.append(k, String(v));
  });
  return p.toString();
}

async function subsonicJson(path, params = {}) {
  const c = getActiveServer();
  if (!c) throw new Error("No active Subsonic server selected");

  const url = `${c.serverUrl}/rest/${path}.view?${qs({
    ...authParams(),
    ...params,
  })}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Subsonic error: ${res.status}`);
  return res.json();
}

// ---------- Backend server ----------
function startSubsonicBackend() {
  const appServer = express();
  appServer.use(cors());

  appServer.get("/api/library", async (req, res) => {
    try {
      const data = await subsonicJson("getAlbumList2", {
        type: "newest",
        size: 50,
      });
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // IPC: list all servers
  ipcMain.handle("list-subsonic-servers", () => {
    return config.servers;
  });

  // IPC: set active server
  ipcMain.handle("set-active-subsonic-server", (event, id) => {
    if (!config.servers.find((s) => s.id === id)) {
      throw new Error(`Server with id ${id} not found`);
    }
    config.activeServerId = id;
    saveConfig(config);
    return getActiveServer();
  });

  // IPC: add or update server
  ipcMain.handle("update-subsonic-server", (event, server) => {
    const idx = config.servers.findIndex((s) => s.id === server.id);
    if (idx >= 0) {
      config.servers[idx] = { ...config.servers[idx], ...server };
    } else {
      config.servers.push(server);
    }
    saveConfig(config);
    return server;
  });

  const server = appServer.listen(0, () => {
    console.log(
      `Subsonic backend listening on http://127.0.0.1:${server.address().port}`,
    );
  });

  ipcMain.handle("get-backend-origin", () => {
    return `http://127.0.0.1:${server.address().port}`;
  });

  return server;
}

module.exports = { startSubsonicBackend };
