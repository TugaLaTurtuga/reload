// @ts-nocheck
// CommonJS is retained for the public backend API while TypeScript owns build output.
const { fetch } = require("undici");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { pipeline } = require("stream/promises");
// TypeScript is emitted to dist/electron; bundled defaults remain in electron/.
const electronSourceDir = path.resolve(__dirname, "../../electron");

// Safely obtain Electron modules if running inside Electron's main process
let electronApp = null;
let ipcMain = null;
try {
  const electron = require("electron");
  if (typeof electron === "object" && electron !== null && electron.app) {
    electronApp = electron.app;
    ipcMain = electron.ipcMain;
  }
} catch {
  // Running standalone in Node.js
}

// -------------------------------------------------------------
// 1. Configuration & User-Data Resolution
// -------------------------------------------------------------

let configuredUserDataPath = null;
let configuredSubsonicSettingsPath = null;

function setUserDataPath(dirPath) {
  configuredUserDataPath = dirPath;
}

function setSubsonicSettingsPath(filePath) {
  configuredSubsonicSettingsPath = filePath;
}

function resolveUserDataDir() {
  if (configuredUserDataPath) {
    return configuredUserDataPath;
  }

  // Exactly matching main.js: const userDataPath = path.join(app.getPath("userData"), "user-data");
  if (electronApp && typeof electronApp.getPath === "function") {
    return path.join(electronApp.getPath("userData"), "user-data");
  }

  const localUserData = path.join(electronSourceDir, "user-data");
  if (fs.existsSync(localUserData)) return localUserData;

  const cwdUserData = path.join(process.cwd(), "electron", "user-data");
  if (fs.existsSync(cwdUserData)) return cwdUserData;

  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "TugaLaTurtuga", "reload", "user-data");
  } else if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "TugaLaTurtuga", "reload", "user-data");
  } else {
    return path.join(home, ".config", "TugaLaTurtuga", "reload", "user-data");
  }
}

function resolveSubsonicSettingsPath() {
  if (configuredSubsonicSettingsPath) {
    return configuredSubsonicSettingsPath;
  }

  if (configuredUserDataPath) {
    return path.join(configuredUserDataPath, "subsonicSettings.json");
  }

  // Exactly matching main.js: path.join(userDataPath, "subsonicSettings.json")
  if (electronApp && typeof electronApp.getPath === "function") {
    const userDataPath = path.join(electronApp.getPath("userData"), "user-data");
    const settingsPath = path.join(userDataPath, "subsonicSettings.json");

    // If it doesn't exist in userDataPath yet, copy template from electron/user-data if available
    const templatePath = path.join(electronSourceDir, "user-data", "subsonicSettings.json");
    if (!fs.existsSync(settingsPath) && fs.existsSync(templatePath)) {
      try {
        fs.mkdirSync(userDataPath, { recursive: true });
        fs.copyFileSync(templatePath, settingsPath);
      } catch (err) {
        console.warn(`Could not copy template to ${settingsPath}:`, err);
      }
    }

    return settingsPath;
  }

  // Standalone / CLI fallback when app is not available
  const localTemplate = path.join(electronSourceDir, "user-data", "subsonicSettings.json");
  if (fs.existsSync(localTemplate)) return localTemplate;

  const cwdTemplate = path.join(process.cwd(), "electron", "user-data", "subsonicSettings.json");
  if (fs.existsSync(cwdTemplate)) return cwdTemplate;

  return path.join(resolveUserDataDir(), "subsonicSettings.json");
}

function loadSubsonicSettings() {
  const settingsFile = resolveSubsonicSettingsPath();
  if (!fs.existsSync(settingsFile)) {
    throw new Error(`subsonicSettings.json not found. Checked: ${settingsFile}`);
  }

  const raw = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
  const entry = raw.main || raw.server || raw;

  const rawIp = entry.ip || entry.url || entry.serverUrl || entry.host || "127.0.0.1:4533";
  const user = entry.user || entry.username || "admin";
  const password = entry.password !== undefined ? String(entry.password) : "";
  const clientName = entry.clientName || "Reload";
  const apiVersion = entry.apiVersion || "1.16.1";
  const downloadDir = entry.downloadDir || entry.downloadPath || null;

  let serverUrl = String(rawIp).trim();
  if (!/^https?:\/\//i.test(serverUrl)) {
    serverUrl = `http://${serverUrl}`;
  }
  serverUrl = serverUrl.replace(/\/+$/, "");

  return {
    filePath: settingsFile,
    serverUrl,
    ip: rawIp,
    user,
    password,
    clientName,
    apiVersion,
    downloadDir,
  };
}

function getDownloadDestination(overrideDir) {
  if (overrideDir) {
    return path.resolve(overrideDir.replace(/^~(?=$|\/|\\)/, os.homedir()));
  }

  // 1. Configured in subsonicSettings.json
  try {
    const cfg = loadSubsonicSettings();
    if (cfg.downloadDir) {
      return path.resolve(cfg.downloadDir.replace(/^~(?=$|\/|\\)/, os.homedir()));
    }
  } catch {}

  // 2. Look for library.json in user-data
  const userDataDir = resolveUserDataDir();
  const libraryJsonPath = path.join(userDataDir, "library.json");
  if (fs.existsSync(libraryJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(libraryJsonPath, "utf-8"));
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === "string") {
        return path.resolve(data[0]);
      }
    } catch {}
  }

  // 3. Fallback to default reload Documents directory
  return path.join(os.homedir(), "Documents", "reload");
}

// -------------------------------------------------------------
// 2. Subsonic API Client
// -------------------------------------------------------------

function buildAuthParams(config) {
  const salt = crypto.randomBytes(8).toString("hex");
  const token = crypto
    .createHash("md5")
    .update(config.password + salt)
    .digest("hex");

  return {
    u: config.user,
    t: token,
    s: salt,
    v: config.apiVersion || "1.16.1",
    c: config.clientName || "Reload",
    f: "json",
  };
}

function buildQueryString(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      p.append(k, String(v));
    }
  }
  return p.toString();
}

async function subsonicRequest(endpoint, params = {}, customConfig = null) {
  const config = customConfig || loadSubsonicSettings();
  const qs = buildQueryString({
    ...buildAuthParams(config),
    ...params,
  });

  const url = `${config.serverUrl}/rest/${endpoint}.view?${qs}`;
  const fetchFn = config.fetch || fetch;
  const response = await fetchFn(url, { signal: AbortSignal.timeout(15000) });

  if (!response.ok) {
    throw new Error(`Subsonic HTTP error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const subResponse = json?.["subsonic-response"];
  if (!subResponse) {
    throw new Error("Invalid Subsonic response: missing subsonic-response root");
  }

  if (subResponse.status === "failed") {
    const errorMsg = subResponse.error?.message || "Unknown Subsonic error";
    const errorCode = subResponse.error?.code || 0;
    throw new Error(`Subsonic API error (${errorCode}): ${errorMsg}`);
  }

  return json;
}

async function pingServer(customConfig = null) {
  const json = await subsonicRequest("ping", {}, customConfig);
  const sub = json["subsonic-response"];
  return {
    ok: sub.status === "ok",
    version: sub.version,
    type: sub.type || "subsonic",
    serverUrl: (customConfig || loadSubsonicSettings()).serverUrl,
  };
}

// -------------------------------------------------------------
// 3. Album & Single Catalog Retrieval
// -------------------------------------------------------------

/**
 * Fetches all album entries from Navidrome/Subsonic using pagination.
 */
async function fetchAllAlbumSummaries(customConfig = null) {
  const size = 500;
  let offset = 0;
  const allSummaries = [];

  while (true) {
    const json = await subsonicRequest(
      "getAlbumList2",
      {
        type: "alphabeticalByName",
        size,
        offset,
      },
      customConfig,
    );

    const rawAlbums = json?.["subsonic-response"]?.albumList2?.album;
    const albums = Array.isArray(rawAlbums)
      ? rawAlbums
      : rawAlbums
      ? [rawAlbums]
      : [];

    if (albums.length === 0) break;
    allSummaries.push(...albums);

    if (albums.length < size) break;
    offset += size;
  }

  return allSummaries;
}

/**
 * Retrieves full album details including track list.
 */
async function fetchAlbumDetails(albumId, customConfig = null) {
  const json = await subsonicRequest("getAlbum", { id: albumId }, customConfig);
  const album = json?.["subsonic-response"]?.album;
  if (!album) {
    throw new Error(`Album with ID ${albumId} not found`);
  }

  const rawSongs = album.song;
  const songs = Array.isArray(rawSongs)
    ? rawSongs
    : rawSongs
    ? [rawSongs]
    : [];

  const isSingle = album.albumType === "single" || songs.length === 1;

  return {
    id: album.id,
    name: album.name || album.title || "Unknown Album",
    artist: album.artist || "Unknown Artist",
    artistId: album.artistId,
    coverArt: album.coverArt,
    songCount: songs.length,
    duration: album.duration || 0,
    year: album.year,
    genre: album.genre,
    isAlbum: !isSingle,
    isSingle,
    songs,
  };
}

/**
 * Lists all albums and singles from Navidrome, categorized.
 */
async function listAllAlbumsAndSingles(customConfig = null) {
  const summaries = await fetchAllAlbumSummaries(customConfig);
  const items = [];

  for (const summary of summaries) {
    const songCount = summary.songCount || 0;
    const isSingle = summary.albumType === "single" || songCount === 1;

    items.push({
      id: summary.id,
      name: summary.name || summary.title || "Unknown Album",
      artist: summary.artist || "Unknown Artist",
      artistId: summary.artistId,
      coverArt: summary.coverArt,
      songCount,
      duration: summary.duration,
      year: summary.year,
      genre: summary.genre,
      isAlbum: !isSingle,
      isSingle,
    });
  }

  return {
    total: items.length,
    albums: items.filter((item) => item.isAlbum),
    singles: items.filter((item) => item.isSingle),
    items,
  };
}

// -------------------------------------------------------------
// 4. Downloader Engine
// -------------------------------------------------------------

function sanitizePathSegment(str) {
  if (!str) return "Unknown";
  return String(str)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\.+$/, "")
    .trim() || "Unknown";
}

class DownloadManager {
  constructor() {
    this.state = {
      status: "idle", // 'idle' | 'scanning' | 'downloading' | 'completed' | 'cancelled' | 'error'
      destination: "",
      totalItems: 0,
      processedItems: 0,
      totalTracks: 0,
      downloadedTracks: 0,
      skippedTracks: 0,
      failedTracks: 0,
      currentAlbum: null,
      currentTrack: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      log: [],
    };
    this.cancelRequested = false;
  }

  getStatus() {
    return { ...this.state };
  }

  cancel() {
    if (this.state.status === "downloading" || this.state.status === "scanning") {
      this.cancelRequested = true;
      this.addLog("Cancellation requested by user.");
      return true;
    }
    return false;
  }

  addLog(msg) {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
    const entry = `[${timestamp}] ${msg}`;
    this.state.log.push(entry);
    if (this.state.log.length > 200) {
      this.state.log.shift();
    }
    console.log(`[NavidromeDownloader] ${entry}`);
  }

  async downloadFile(url, targetPath, fetchFn = fetch) {
    const tempPath = `${targetPath}.tmp`;
    const res = await fetchFn(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) {
      throw new Error(`Failed to download file (HTTP ${res.status})`);
    }

    const fileStream = fs.createWriteStream(tempPath);
    await pipeline(res.body, fileStream);

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(tempPath, targetPath);
  }

  async downloadCoverArt(config, coverArtId, targetPath) {
    if (!coverArtId) return false;
    try {
      const qs = buildQueryString({
        ...buildAuthParams(config),
        id: coverArtId,
      });
      const url = `${config.serverUrl}/rest/getCoverArt.view?${qs}`;
      const fetchFn = config.fetch || fetch;
      await this.downloadFile(url, targetPath, fetchFn);
      return true;
    } catch (err) {
      this.addLog(`Warning: Failed to download cover (${coverArtId}): ${err.message}`);
      return false;
    }
  }

  async downloadTrack(config, song, targetPath, forceOverwrite = false) {
    if (fs.existsSync(targetPath) && !forceOverwrite) {
      const stat = fs.statSync(targetPath);
      if (stat.size > 0) {
        return "skipped";
      }
    }

    const qs = buildQueryString({
      ...buildAuthParams(config),
      id: song.id,
    });

    const fetchFn = config.fetch || fetch;
    // Try download.view first, then fallback to stream.view
    const downloadUrl = `${config.serverUrl}/rest/download.view?${qs}`;
    const streamUrl = `${config.serverUrl}/rest/stream.view?${qs}`;

    try {
      await this.downloadFile(downloadUrl, targetPath, fetchFn);
      return "downloaded";
    } catch (err) {
      this.addLog(`download.view failed for "${song.title}", trying stream.view: ${err.message}`);
      await this.downloadFile(streamUrl, targetPath, fetchFn);
      return "downloaded";
    }
  }

  async downloadSingleAlbum(albumId, options = {}) {
    const config = options.config || loadSubsonicSettings();
    const destRoot = getDownloadDestination(options.destination);
    const forceOverwrite = Boolean(options.forceOverwrite);

    const details = await fetchAlbumDetails(albumId, config);
    const artistName = sanitizePathSegment(details.artist);
    const albumName = sanitizePathSegment(details.name);

    const albumFolder = path.join(destRoot, artistName, albumName);
    fs.mkdirSync(albumFolder, { recursive: true });

    // Download Cover
    const coverPath = path.join(albumFolder, "cover.jpg");
    let hasCover = fs.existsSync(coverPath);
    if (!hasCover && details.coverArt) {
      hasCover = await this.downloadCoverArt(config, details.coverArt, coverPath);
    }

    // Download Tracks
    const downloadedSongs = [];
    for (let i = 0; i < details.songs.length; i++) {
      if (this.cancelRequested) break;

      const song = details.songs[i];
      this.state.currentTrack = song.title;

      const trackNum = song.track ? String(song.track).padStart(2, "0") : String(i + 1).padStart(2, "0");
      const ext = (song.suffix || "mp3").replace(/^\./, "");
      const trackFileName = `${trackNum} - ${sanitizePathSegment(song.title)}.${ext}`;
      const trackPath = path.join(albumFolder, trackFileName);

      try {
        const result = await this.downloadTrack(config, song, trackPath, forceOverwrite);
        if (result === "downloaded") {
          this.state.downloadedTracks++;
        } else {
          this.state.skippedTracks++;
        }
      } catch (err) {
        this.state.failedTracks++;
        this.addLog(`Error downloading track "${song.title}": ${err.message}`);
      }

      downloadedSongs.push({
        path: trackFileName,
        title: song.title || `Track ${i + 1}`,
        rating: 5,
        lastModified: fs.existsSync(trackPath) ? fs.statSync(trackPath).mtimeMs : Date.now(),
      });
    }

    // Save reload.json metadata file
    const reloadJsonPath = path.join(albumFolder, "reload.json");
    const reloadMeta = {
      name: details.name,
      path: albumFolder,
      info: {
        trackList: downloadedSongs,
        description: {
          name: details.name,
          author: details.artist,
          label: "none",
          description: "",
          isAlbum: details.isAlbum,
          year: details.year ? String(details.year) : "year",
          genre: details.genre ? String(details.genre) : "genre",
          color: "#AAAAAA",
          palette: null,
          cover: hasCover ? coverPath : null,
          copyrightFree: false,
          favourite: false,
        },
      },
    };

    try {
      fs.writeFileSync(reloadJsonPath, JSON.stringify(reloadMeta.info, null, 4), "utf-8");
    } catch (err) {
      this.addLog(`Failed to write reload.json: ${err.message}`);
    }

    return {
      id: details.id,
      name: details.name,
      artist: details.artist,
      isAlbum: details.isAlbum,
      folder: albumFolder,
      tracks: downloadedSongs.length,
    };
  }

  async downloadAll(options = {}) {
    if (this.state.status === "downloading" || this.state.status === "scanning") {
      throw new Error("Download task is already in progress");
    }

    const config = options.config || loadSubsonicSettings();
    const destRoot = getDownloadDestination(options.destination);
    const forceOverwrite = Boolean(options.forceOverwrite);

    this.cancelRequested = false;
    this.state = {
      status: "scanning",
      destination: destRoot,
      totalItems: 0,
      processedItems: 0,
      totalTracks: 0,
      downloadedTracks: 0,
      skippedTracks: 0,
      failedTracks: 0,
      currentAlbum: null,
      currentTrack: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      log: [],
    };

    this.addLog(`Starting download from Navidrome server (${config.serverUrl})`);
    this.addLog(`Target destination directory: ${destRoot}`);

    try {
      fs.mkdirSync(destRoot, { recursive: true });

      // Fetch all albums & singles
      this.addLog("Scanning all albums and singles from Navidrome...");
      const catalog = await listAllAlbumsAndSingles(config);
      this.state.totalItems = catalog.total;
      this.addLog(
        `Found ${catalog.total} items (${catalog.albums.length} albums, ${catalog.singles.length} singles).`,
      );

      this.state.status = "downloading";

      for (let i = 0; i < catalog.items.length; i++) {
        if (this.cancelRequested) {
          this.state.status = "cancelled";
          this.addLog("Download process cancelled.");
          break;
        }

        const item = catalog.items[i];
        this.state.currentAlbum = `${item.artist} - ${item.name} (${item.isAlbum ? "Album" : "Single"})`;
        this.addLog(
          `[${i + 1}/${catalog.total}] Downloading ${item.isAlbum ? "album" : "single"}: "${item.name}" by "${item.artist}"`,
        );

        try {
          await this.downloadSingleAlbum(item.id, {
            config,
            destination: destRoot,
            forceOverwrite,
          });
        } catch (err) {
          this.addLog(`Failed downloading item "${item.name}": ${err.message}`);
        }

        this.state.processedItems++;
      }

      if (!this.cancelRequested) {
        this.state.status = "completed";
        this.addLog("All downloads completed successfully!");
      }
    } catch (err) {
      this.state.status = "error";
      this.state.error = err.message;
      this.addLog(`Download process failed: ${err.message}`);
    } finally {
      this.state.finishedAt = new Date().toISOString();
      this.state.currentAlbum = null;
      this.state.currentTrack = null;
    }

    return this.getStatus();
  }
}

const globalDownloadManager = new DownloadManager();

// -------------------------------------------------------------
// 5. Backend Server & IPC
// -------------------------------------------------------------

function startSubsonicBackend(options = {}) {
  if (options.userDataPath) {
    setUserDataPath(options.userDataPath);
  }
  if (options.subsonicSettingsPath) {
    setSubsonicSettingsPath(options.subsonicSettingsPath);
  }

  const appServer = express();
  appServer.use(cors());
  appServer.use(express.json());

  // Ping / health check
  appServer.get("/api/ping", async (req, res) => {
    try {
      const ping = await pingServer();
      res.json(ping);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Current config (masked password)
  appServer.get("/api/config", (req, res) => {
    try {
      const cfg = loadSubsonicSettings();
      res.json({
        filePath: cfg.filePath,
        serverUrl: cfg.serverUrl,
        ip: cfg.ip,
        user: cfg.user,
        passwordConfigured: Boolean(cfg.password),
        downloadDir: getDownloadDestination(cfg.downloadDir),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // List all albums and singles from Navidrome
  appServer.get("/api/albums", async (req, res) => {
    try {
      const catalog = await listAllAlbumsAndSingles();
      const filter = req.query.filter; // 'all' | 'albums' | 'singles'
      if (filter === "albums") {
        return res.json({ total: catalog.albums.length, items: catalog.albums });
      } else if (filter === "singles") {
        return res.json({ total: catalog.singles.length, items: catalog.singles });
      }
      res.json(catalog);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download status
  appServer.get("/api/download/status", (req, res) => {
    res.json(globalDownloadManager.getStatus());
  });

  // Trigger download of all albums and singles
  appServer.post("/api/download/all", (req, res) => {
    const { destination, forceOverwrite } = req.body || {};
    if (globalDownloadManager.state.status === "downloading" || globalDownloadManager.state.status === "scanning") {
      return res.status(409).json({
        error: "Download is already in progress",
        status: globalDownloadManager.getStatus(),
      });
    }

    // Run asynchronously in background
    globalDownloadManager.downloadAll({ destination, forceOverwrite }).catch((err) => {
      console.error("[DownloadManager] downloadAll background error:", err);
    });

    res.json({
      message: "Download process started",
      status: globalDownloadManager.getStatus(),
    });
  });

  // Download specific album or single
  appServer.post("/api/download/album/:id", async (req, res) => {
    try {
      const { destination, forceOverwrite } = req.body || {};
      const result = await globalDownloadManager.downloadSingleAlbum(req.params.id, {
        destination,
        forceOverwrite,
      });
      res.json({ message: "Download completed", result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cancel download
  appServer.post("/api/download/cancel", (req, res) => {
    const cancelled = globalDownloadManager.cancel();
    res.json({ cancelled, status: globalDownloadManager.getStatus() });
  });

  // Legacy library endpoint
  appServer.get("/api/library", async (req, res) => {
    try {
      const data = await subsonicRequest("getAlbumList2", {
        type: req.query.type || "newest",
        size: req.query.size || 50,
      });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Register Electron IPC handlers if ipcMain is available
  if (ipcMain) {
    try {
      ipcMain.removeHandler("get-backend-origin");
      ipcMain.removeHandler("subsonic-get-config");
      ipcMain.removeHandler("subsonic-ping");
      ipcMain.removeHandler("subsonic-get-albums");
      ipcMain.removeHandler("subsonic-download-all");
      ipcMain.removeHandler("subsonic-download-album");
      ipcMain.removeHandler("subsonic-download-status");
      ipcMain.removeHandler("subsonic-cancel-download");
    } catch {}

    ipcMain.handle("subsonic-get-config", () => {
      const cfg = loadSubsonicSettings();
      return {
        filePath: cfg.filePath,
        serverUrl: cfg.serverUrl,
        ip: cfg.ip,
        user: cfg.user,
        passwordConfigured: Boolean(cfg.password),
        downloadDir: getDownloadDestination(cfg.downloadDir),
      };
    });

    ipcMain.handle("subsonic-ping", async () => {
      return await pingServer();
    });

    ipcMain.handle("subsonic-get-albums", async (event, filter) => {
      const catalog = await listAllAlbumsAndSingles();
      if (filter === "albums") return catalog.albums;
      if (filter === "singles") return catalog.singles;
      return catalog;
    });

    ipcMain.handle("subsonic-download-all", (event, opts) => {
      globalDownloadManager.downloadAll(opts).catch(console.error);
      return globalDownloadManager.getStatus();
    });

    ipcMain.handle("subsonic-download-album", async (event, id, opts) => {
      return await globalDownloadManager.downloadSingleAlbum(id, opts);
    });

    ipcMain.handle("subsonic-download-status", () => {
      return globalDownloadManager.getStatus();
    });

    ipcMain.handle("subsonic-cancel-download", () => {
      return globalDownloadManager.cancel();
    });
  }

  const portToUse = options.port !== undefined ? options.port : 0;
  const server = appServer.listen(portToUse, () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : portToUse;
    console.log(`Subsonic Navidrome backend listening on http://127.0.0.1:${port}`);

    if (ipcMain) {
      ipcMain.handle("get-backend-origin", () => `http://127.0.0.1:${port}`);
    }
  });

  server.downloadManager = globalDownloadManager;
  server.loadSubsonicSettings = loadSubsonicSettings;
  server.getDownloadDestination = getDownloadDestination;

  return server;
}

// -------------------------------------------------------------
// 6. Direct CLI Execution
// -------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Navidrome / Subsonic Downloader Backend for Reload

Usage:
  node electron/subsonic-backend.js [options]

Options:
  --ping, -t              Test connection to Navidrome server
  --list, -l              List all albums and singles found on Navidrome
  --download, -d          Download all albums and singles to disk
  --dest <path>           Custom destination folder for downloads
  --overwrite             Overwrite existing files
  --port <number>, -p     Run HTTP backend server on specific port (default: random)
  --help, -h              Show this help message
`);
    process.exit(0);
  }

  (async () => {
    try {
      const settings = loadSubsonicSettings();
      console.log(`Using settings from: ${settings.filePath}`);
      console.log(`Navidrome Server: ${settings.serverUrl} (User: ${settings.user})`);

      if (args.includes("--ping") || args.includes("-t")) {
        console.log("Pinging Navidrome server...");
        const res = await pingServer(settings);
        console.log("Ping successful:", res);
        process.exit(0);
      }

      if (args.includes("--list") || args.includes("-l")) {
        console.log("Fetching all albums and singles from Navidrome...");
        const catalog = await listAllAlbumsAndSingles(settings);
        console.log(`\nFound ${catalog.total} total items:`);
        console.log(`- Albums: ${catalog.albums.length}`);
        console.log(`- Singles: ${catalog.singles.length}\n`);

        for (const item of catalog.items) {
          const type = item.isAlbum ? "[Album ]" : "[Single]";
          console.log(`${type} ${item.artist} - ${item.name} (${item.songCount} track(s), ${item.year || "no year"})`);
        }
        process.exit(0);
      }

      if (args.includes("--download") || args.includes("-d")) {
        const destIdx = args.indexOf("--dest");
        const customDest = destIdx !== -1 && args[destIdx + 1] ? args[destIdx + 1] : undefined;
        const overwrite = args.includes("--overwrite");

        console.log("Starting full download of all albums and singles...");
        const result = await globalDownloadManager.downloadAll({
          config: settings,
          destination: customDest,
          forceOverwrite: overwrite,
        });
        console.log("\nDownload finished:", result);
        process.exit(result.status === "completed" ? 0 : 1);
      }

      // Default action: start HTTP server
      const portIdx = args.indexOf("--port") !== -1 ? args.indexOf("--port") : args.indexOf("-p");
      const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : 4534;

      startSubsonicBackend({ port });
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  startSubsonicBackend,
  loadSubsonicSettings,
  resolveSubsonicSettingsPath,
  resolveUserDataDir,
  setUserDataPath,
  setSubsonicSettingsPath,
  getDownloadDestination,
  pingServer,
  subsonicRequest,
  fetchAllAlbumSummaries,
  fetchAlbumDetails,
  listAllAlbumsAndSingles,
  DownloadManager,
  globalDownloadManager,
  buildAuthParams,
  buildQueryString,
  sanitizePathSegment,
};
