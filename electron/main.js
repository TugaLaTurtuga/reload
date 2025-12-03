const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  dialog,
  shell,
  screen,
} = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const mm = require("music-metadata");
const ColorThief = require("colorthief");
const { getFonts } = require("font-list");
const nut = require("@nut-tree-fork/nut-js");
const { mouse, Button } = nut;

app.setName("TugaLaTurtuga/reload");
const userDataPath = path.join(app.getPath("userData"), "user-data");
if (!fs.existsSync(userDataPath)) {
  const defaultUserDataPath = path.join(__dirname, "user-data");
  fs.mkdirSync(userDataPath, { recursive: true });

  // Copy contents from defaultUserDataPath to userDataPath if it exists
  if (fs.existsSync(defaultUserDataPath)) {
    const copyRecursively = (src, dest) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursively(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    copyRecursively(defaultUserDataPath, userDataPath);
  }
}

const settingsFilePath = path.join(userDataPath, "settings.json");
const libraryFilePath = path.join(userDataPath, "library.json");
let libraryPaths = [path.join(app.getPath("documents"), "reload")];
const changeLogsPath = path.join(__dirname, "changeLogs.json");
const albumsPathData = path.join(userDataPath, "albumsPath.json");
const nonAlbumsPathData = path.join(userDataPath, "nonAlbumsPath.json");
const openedWindows = new Map();

let mainWindow;
let audioIsMuffled = false;

// Lazy-load wrapper
let subsonicBackend = null;
async function getSubsonicBackend() {
  if (subsonicBackend) return subsonicBackend;

  // Load only when needed
  const { startSubsonicBackend } = require("./subsonic-backend.js");
  subsonicBackend = startSubsonicBackend();
  return subsonicBackend;
}

function createAppMenu() {
  const template = [
    {
      label: "Reload",
      submenu: [
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            const settingsPath = path.join(
              __dirname,
              "../app/html/settings.html",
            );
            openExternal(settingsPath, true);
          },
        },
        { type: "separator" },
        {
          label: "Mini player",
          accelerator: "CmdOrCtrl+m",
          click: () => {
            const musicWatcherPath = path.join(
              __dirname,
              "../app/html/musicWatcher.html",
            );
            openExternal(musicWatcherPath, true);
          },
        },
        {
          label: "Themes",
          accelerator: "CmdOrCtrl+T",
          click: () => {
            const themePath = path.join(
              __dirname,
              "../app/html/themeEditor.html",
            );
            openExternal(themePath, true);
          },
        },
        {
          label: "CSS",
          accelerator: "CmdOrCtrl+L",
          click: () => {
            const themePath = path.join(__dirname, "../app/look.html");
            openExternal(themePath, true);
          },
        },
        {
          label: "Edit",
          accelerator: "CmdOrCtrl+E",
          click: () => {
            mainWindow.webContents.send("edit-album");
          },
        },
        { type: "separator" },
        {
          role: "quit",
          label: "Quit",
        },
      ],
    },
    {
      label: "Dev tools",
      submenu: [
        {
          label: "Toggle Debug Mode",
          accelerator: "CmdOrCtrl+Alt+I",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.toggleDevTools();
            }
          },
        },
        { role: "reload", label: "Reload (the window)" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function getMacIconPath() {
  const basePath = path.join(__dirname, "images/reloadIconApple");

  // Determine appearance
  const isDark = nativeTheme.shouldUseDarkColors;
  const appearance = nativeTheme.themeSource;

  const mode = process.env.MAC_ICON_MODE || "default";

  // Build the filename pattern
  let iconName = "reloadIcon-iOS-Default-1024x1024@1x.png";

  if (mode === "clear") {
    iconName = isDark
      ? "reloadIcon-iOS-ClearDark-1024x1024@1x.png"
      : "reloadIcon-iOS-ClearLight-1024x1024@1x.png";
  } else if (mode === "tinted") {
    iconName = isDark
      ? "reloadIcon-iOS-TintedDark-1024x1024@1x.png"
      : "reloadIcon-iOS-TintedLight-1024x1024@1x.png";
  } else if (isDark) {
    iconName = "reloadIcon-iOS-Dark-1024x1024@1x.png";
  }

  const iconPath = path.join(basePath, iconName);
  return fs.existsSync(iconPath) ? iconPath : null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 570,
    minHeight: 100,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("app/index.html");

  // Handle mainWindow focus events
  mainWindow.on("focus", () => {
    if (openedWindows.size > 0) {
      mainWindow.webContents.send("unmuffleAudio");
    }
  });

  // Set app icon
  if (process.platform === "darwin") {
    const macIcon = getMacIconPath();
    if (macIcon) {
      app.dock.setIcon(macIcon);
      mainWindow.icon = macIcon;
    } else {
      const iconPath = path.join(__dirname, "images/reloadIcon.png");
      if (fs.existsSync(iconPath)) {
        app.dock.setIcon(macIcon);
        mainWindow.icon = iconPath;
      }
    }

    nativeTheme.on("updated", () => {
      const newIcon = getMacIconPath();
      if (newIcon !== macIcon && fs.existsSync(newIcon)) {
        mainWindow.icon = newIcon;
        app.dock.setIcon(newIcon);
      }
    });
  } else {
    const iconPath = path.join(__dirname, "images/reloadIcon.png");
    if (fs.existsSync(iconPath)) {
      options.icon = iconPath;
    }
  }

  mainWindow.on("blur", () => {
    // Check if focus is moving to one of our external windows
    setTimeout(() => {
      const focusedWin = BrowserWindow.getFocusedWindow();
      if (
        focusedWin &&
        Array.from(openedWindows.values()).includes(focusedWin)
      ) {
        mainWindow.webContents.send("muffleAudio");
      }
    }, 50); // Small delay to ensure focus has transferred
  });

  mainWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      } else {
        mainWindow.focus();
      }
    }
  });
}

ipcMain.on("window-minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.close();
});

ipcMain.on("window-toggle-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on("window-close", () => {
  app.isQuiting = true;
  app.quit();
});

app.on("before-quit", () => {
  app.isQuiting = true;
});

app.whenReady().then(() => {
  getSystemTheme();
  createWindow();
  createAppMenu();
});

app.on("window-all-closed", () => {
  /*
  if (process.platform !== 'darwin') {
    app.quit();
  }
  */

  app.quit(); // plain better + IT'S MY FUCKING APP
});

ipcMain.handle("click-cursor", async (event, button) => {
  let btnEnum;

  if (typeof button === "number") {
    btnEnum = button;
  } else if (typeof button === "string") {
    // Normalize string
    button = button.toLowerCase();

    if (!isNaN(Number(button))) {
      return await ipcMain.handle("click-cursor-btn", event, Number(button));
    } else if (button === "left") btnEnum = 0;
    else if (button === "middle") btnEnum = 1;
    else if (button === "right") btnEnum = 2;
    else throw new Error(`Unknown button string: ${button}`);
  } else {
    throw new Error(`Unsupported button type: ${typeof button}`);
  }

  try {
    await mouse.click(btnEnum);
    return { ok: true, button };
  } catch (err) {
    console.error("click-cursor-btn failed", err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("sticky-click-cursor", async (event, button, stick) => {
  let btnEnum;

  if (typeof button === "number") {
    btnEnum = button;
  } else if (typeof button === "string") {
    // Normalize string
    button = button.toLowerCase();

    if (!isNaN(Number(button))) {
      return await ipcMain.handle("click-cursor-btn", event, Number(button));
    } else if (button === "left") btnEnum = 0;
    else if (button === "middle") btnEnum = 1;
    else if (button === "right") btnEnum = 2;
    else throw new Error(`Unknown button string: ${button}`);
  } else {
    throw new Error(`Unsupported button type: ${typeof button}`);
  }

  try {
    if (stick) {
      // press & hold
      await mouse.pressButton(btnEnum);
      return { ok: true, action: "pressed", button };
    } else {
      // release
      await mouse.releaseButton(btnEnum);
      return { ok: true, action: "released", button };
    }
  } catch (err) {
    console.error("sticky-click-cursor failed", err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("scroll-cursor", async (event, x, y) => {
  if (y !== 0) {
    const a = Math.abs(y);
    const signIsPositive = y > 0 ? true : false;
    if (signIsPositive) {
      await mouse.scrollUp(a);
      return { ok: true, action: "scrolled-up", a };
    } else {
      await mouse.scrollDown(a);
      return { ok: true, action: "scrolled-down", a };
    }
  }
  if (x !== 0) {
    const a = Math.abs(x);
    const signIsPositive = x > 0 ? true : false;
    if (signIsPositive) {
      await mouse.scrollLeft(a);
      return { ok: true, action: "scrolled-left", a };
    } else {
      await mouse.scrollRight(a);
      return { ok: true, action: "scrolled-right", a };
    }
  }
});

// small helper: convert coords relative-to-window -> absolute screen coords
function toScreenCoords(win, x, y) {
  const bounds = win.getBounds();
  return {
    x: Math.round(bounds.x + Number(x || 0)),
    y: Math.round(bounds.y + Number(y || 0)),
  };
}

ipcMain.handle("get-cursor-pos", async (event) => {
  const cursorPos = screen.getCursorScreenPoint();
  const win = BrowserWindow.fromWebContents(event.sender);
  const winBounds = win.getBounds();
  return { x: cursorPos.x - winBounds.x, y: cursorPos.y - winBounds.y };
});

// set-cursor-pos: moves the system cursor to (x,y) relative to the window top-left
ipcMain.handle("set-cursor-pos", async (event, x, y) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error("Could not resolve BrowserWindow for caller.");

  const { x: sx, y: sy } = toScreenCoords(win, x, y);

  try {
    await mouse.setPosition({ x: sx, y: sy }); // nut.js API
    return { ok: true, screenX: sx, screenY: sy };
  } catch (err) {
    console.error("mouse.setPosition failed", err);
    throw err;
  }
});

ipcMain.handle("show-open-dialog", async (event, options) => {
  return await dialog.showOpenDialog(options);
});

ipcMain.handle("get-change-logs", () => {
  if (fs.existsSync(changeLogsPath)) {
    const data = fs.readFileSync(changeLogsPath, "utf8");
    return JSON.parse(data);
  } else {
    return {};
  }
});

ipcMain.handle("get-system-fonts", async () => {
  try {
    const fonts = await getFonts(); // returns string[] (may include quoted names)
    return fonts;
  } catch (err) {
    console.error("getFonts error", err);
    return [];
  }
});

// Get music library
ipcMain.handle("get-library", async () => {
  try {
    const startTime = Date.now();
    albums = [];
    albumsPathLoaded.clear();
    loadAlbumsPath();
    // Try to get libraries
    libraryPaths = await loadLibraryPaths();
    for (const path of libraryPaths) {
      await scanMusicFolder(path);
    }
    saveAlbumsPath();
    console.log(
      "Time to load all songs reload.json:",
      Date.now() - startTime + "ms",
    );
    return albums;
  } catch (error) {
    console.error("Error scanning music library:", error);
    return [];
  }
});

ipcMain.handle("rescan-library", async () => {
  try {
    const startTime = Date.now();
    albums = [];
    albumsPathLoaded.clear();
    albumsPath = new Map();
    nonAlbumsPath = new Set();

    // Try to get libraries
    libraryPaths = await loadLibraryPaths();
    let songs = [];
    for (const path of libraryPaths) {
      const music = await scanMusicFolder(path);
      if (music.length > 0) songs.push(...music);
    }
    saveAlbumsPath();
    console.log(
      "Time to scan all songs reload.json:",
      Date.now() - startTime + "ms",
    );
    mainWindow.reload();
    return albums;
  } catch (error) {
    console.error("Error scanning music library:", error);
    return [];
  }
});

function loadLibraryPaths() {
  try {
    if (fs.existsSync(libraryFilePath)) {
      const data = fs.readFileSync(libraryFilePath, "utf8");
      return JSON.parse(data);
    } else {
      // create default settings if none exist
      fs.writeFileSync(
        libraryFilePath,
        JSON.stringify(libraryPaths, null, 4),
        "utf8",
      );
      return libraryPaths;
    }
  } catch (error) {
    console.error("Error loading last played info:", error);
    return null;
  }
}

ipcMain.handle("get-library-paths", loadLibraryPaths);
ipcMain.handle("save-library-paths", (event, paths) => {
  if (paths.length !== 0 && Array.isArray(paths)) {
    try {
      fs.writeFileSync(libraryFilePath, JSON.stringify(paths, null, 4), "utf8");
    } catch (error) {
      console.error("Error saving library paths:", error);
    }
  }
});

let albums = [];
let albumsPathLoaded = new Set();
let albumsPath = new Map();
let nonAlbumsPath = new Set();

function loadAlbumsPath() {
  if (fs.existsSync(albumsPathData)) {
    try {
      const data = JSON.parse(fs.readFileSync(albumsPathData, "utf8"));
      albumsPath = new Map(data); // Convert [key,value] pairs → Map
    } catch (err) {
      console.error("Failed to load albumsPath:", err);
      albumsPath = new Map();
    }
  }
  if (fs.existsSync(nonAlbumsPathData)) {
    try {
      const data = JSON.parse(fs.readFileSync(nonAlbumsPathData, "utf8"));
      nonAlbumsPath = new Set(data); // Convert array → Set
    } catch (err) {
      console.error("Failed to load nonAlbumsPath:", err);
      nonAlbumsPath = new Set();
    }
  }
}

function saveAlbumsPath() {
  try {
    const arrayData0 = [...albumsPath]; // Map → array of [key,value]
    fs.writeFileSync(albumsPathData, JSON.stringify(arrayData0, null, 2));

    const arrayData1 = [...nonAlbumsPath]; // Set → array
    fs.writeFileSync(nonAlbumsPathData, JSON.stringify(arrayData1, null, 2));
  } catch (err) {
    console.error("Failed to save albumsPath:", err);
  }
}

async function processMusicFolder(folderPath) {
  folderPath = folderPath.toLowerCase();
  if (albumsPath.has(folderPath)) {
    if (!albumsPathLoaded.has(folderPath)) {
      albums.push(albumsPath.get(folderPath));
      albumsPathLoaded.add(folderPath);
    }
    return;
  } else if (nonAlbumsPath.has(folderPath)) return;
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  // Look for audio files in this folder
  let audioFiles = files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return [
      ".mp3",
      ".wav",
      ".aac",
      ".alac",
      ".flac",
      ".ogg",
      ".m4a",
      ".m4p",
      ".movpkg",
    ].includes(ext);
  });
  if (audioFiles.length === 0) {
    nonAlbumsPath.add(folderPath);
    return;
  }

  // Sort audio files by the leading number in the filename
  audioFiles.sort((a, b) => {
    const numA = parseInt(a.match(/^\d+/)?.[0], 10) || Infinity;
    const numB = parseInt(b.match(/^\d+/)?.[0], 10) || Infinity;
    return numA - numB;
  });

  const album = {
    name: (() => {
      const base = path.basename(folderPath);
      return base.charAt(0).toUpperCase() + base.slice(1);
    })(),
    path: folderPath,
    tracks: [],
    info: {
      trackList: [],
      description: {
        name: (() => {
          const base = path.basename(folderPath);
          return base.charAt(0).toUpperCase() + base.slice(1);
        })(),
        author: path.basename(path.dirname(folderPath)),
        label: "none",
        description: "",
        year: "year",
        genre: "genre",
        color: "#AAAAAA",
        palette: null,
        cover: null,
        copyrightFree: false,
        favourite: false,
      },
    },
  };

  // Initialize or read music.json
  const confPath = path.join(folderPath, "reload.json");
  //deleteConfPath(folderPath, 'reload1.json')

  let shouldExtractColor = false;

  if (!fs.existsSync(confPath)) {
    // no json → build new
    album.info.trackList = audioFiles.map((file) => ({
      title: path.basename(file, path.extname(file)).trim(),
      rating: 5,
    }));

    const possible_txts = [
      ["Author.txt", "author"],
      ["Genre.txt", "genre"],
      ["Year.txt", "year"],
      ["color.txt", "color"],
    ];
    for (const [txtFile, key] of possible_txts) {
      const txtPath = path.join(folderPath, txtFile);
      if (fs.existsSync(txtPath)) {
        try {
          let content = fs.readFileSync(txtPath, "utf8").trim();
          if (content) {
            content = content.trim();
            const contentToLowerCase = content.toLowerCase();
            // ignore unknown values from python
            if (
              !(
                contentToLowerCase === "unknown" ||
                contentToLowerCase === "n/a" ||
                contentToLowerCase === "0000"
              )
            ) {
              album.info.description[key] = content;
            }
          }
        } catch (err) {
          console.error(`Error reading ${txtFile}:`, err);
        }
      }
    }
    shouldExtractColor = true; // the python code might be shit.

    try {
      fs.writeFileSync(confPath, JSON.stringify(album.info, null, 4), "utf8");
    } catch (err) {
      console.error("Error creating json:", err);
    }
  } else {
    // json exists → load it
    try {
      const data = fs.readFileSync(confPath, "utf8");
      const parsedData = JSON.parse(data);
      // Merge parsed data with default structure to ensure all properties exist
      if (parsedData) {
        album.info.description = {
          ...album.info.description,
          ...parsedData.description,
        };
        album.info.trackList = parsedData.trackList || album.info.trackList;
      }

      // mark for extraction only if color missing/placeholder
      if (
        !album.info.description.color ||
        ["#AAAAAA", "#FFFFFF"].includes(album.info.description.color)
      ) {
        shouldExtractColor = true;
      }
    } catch (err) {
      console.error("Error reading or parsing json:", err);
      shouldExtractColor = true;
    }
  }

  if (fs.existsSync(album.info.description.cover) && shouldExtractColor) {
    album.info.description.color = await getImgColor(
      album.info.description.cover,
    );
    album.info.description.palette = await getImgPalette(
      album.info.description.cover,
    );
    try {
      fs.writeFileSync(confPath, JSON.stringify(album.info, null, 4), "utf8");
    } catch (err) {
      console.error("Error updating json with color:", err);
    }
  } else {
    album.info.description.cover = lookForCover(folderPath, files);
    if (album.info.description.cover) {
      album.info.description.color = await getImgColor(
        album.info.description.cover,
      );
      album.info.description.palette = await getImgPalette(
        album.info.description.cover,
      );
      try {
        fs.writeFileSync(confPath, JSON.stringify(album.info, null, 4), "utf8");
      } catch (err) {
        console.error("Error updating json with color:", err);
      }
    }
  }

  // Utility functions
  const cleanTrackTitle = (title) => title.replace(/^\d+\s*\.?\s*/, "").trim();

  const clearTitle = (title) => title.toLowerCase().trim();

  const sortByTrackNumber = (a, b) => {
    const numA = parseInt(a.title.match(/^\d+/)?.[0] || Infinity, 10);
    const numB = parseInt(b.title.match(/^\d+/)?.[0] || Infinity, 10);
    return numA - numB;
  };

  // Process audio files
  const ungarnizedTracks = await Promise.all(
    audioFiles.map(async (audioFile) => {
      const trackPath = path.join(folderPath, audioFile);
      const rawTitle = path.basename(audioFile, path.extname(audioFile));

      try {
        const metadata = await mm.parseFile(trackPath);

        if (metadata.common && shouldExtractColor) {
          const {
            artist,
            album: alb,
            year,
            genre,
            label,
            copyright,
            comment,
            description,
          } = metadata.common;

          if (artist) album.info.description.author = artist;
          if (alb) album.name = alb;
          if (year) album.info.description.year = year;
          if (genre?.length) album.info.description.genre = genre[0];
          if (label) album.info.description.label = label;

          // Set copyright as true/false
          album.info.description.copyrightFree = !(
            copyright && copyright.trim() !== ""
          );

          // Add description (from comment or description tag)
          const descText = Array.isArray(comment)
            ? comment.join(" ")
            : description || null;

          if (descText) album.info.description.description = descText.trim();
        }

        return {
          title: rawTitle,
          path: trackPath,
          duration: metadata.format.duration || 0,
        };
      } catch (err) {
        console.error(`Error parsing metadata for ${rawTitle}:`, err);
        return {
          title: rawTitle,
          path: trackPath,
          duration: 0,
          label: null,
          copyright: null,
        };
      }
    }),
  );

  // Build lookup map for efficient matching
  const trackMap = new Map(
    ungarnizedTracks.map((t) => [clearTitle(t.title), t]),
  );

  // Match with trackList
  const matchedTracks = album.info.trackList
    .map((track) => {
      const key = clearTitle(track.title);
      const match = trackMap.get(key);
      if (match) {
        return {
          title: cleanTrackTitle(match.title),
          path: match.path,
          duration: match.duration,
        };
      }
      return null;
    })
    .filter(Boolean);

  // Add missing tracks from trackMap that aren’t in album.info.trackList
  const missingTracks = [];
  const missingTrackList = [];
  for (const [key, track] of trackMap.entries()) {
    const exists = album.info.trackList.some(
      (t) => clearTitle(t.title) === key,
    );
    if (!exists) {
      missingTrackList.push({
        title: clearTitle(track.title),
        rating: 5,
      });
      missingTracks.push({
        title: cleanTrackTitle(track.title),
        path: track.path,
        duration: track.duration,
      });
    }
  }

  // Combine both
  album.tracks = [...matchedTracks, ...missingTracks];
  album.info.trackList = [...album.info.trackList, ...missingTrackList];

  // Sort both arrays
  album.info.trackList.sort(sortByTrackNumber);
  album.tracks.sort(sortByTrackNumber);

  album.jsonPath = confPath;

  if (album.tracks.length > 0) {
    albums.push(album);
    albumsPath.set(folderPath, album);
    albumsPathLoaded.add(folderPath);
  } else {
    nonAlbumsPath.add(folderPath);
  }
}

async function scanMusicFolder(rootPath) {
  async function processFolder(folderPath) {
    try {
      await processMusicFolder(folderPath);
      const dirs = fs
        .readdirSync(folderPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());

      // Recurse into subdirectories
      for (const dir of dirs) {
        await processFolder(path.join(folderPath, dir.name));
      }
    } catch (error) {
      console.error(`Error processing folder ${folderPath}:`, error);
    }
  }

  if (fs.existsSync(rootPath)) {
    await processFolder(rootPath);
  } else {
    console.error(`Music library path does not exist: ${rootPath}`);
  }

  return true;
}

function getSystemTheme() {
  saveSettings(
    { themeMode: nativeTheme.shouldUseDarkColors ? "dark" : "light" },
    true,
  );
}

nativeTheme.on("updated", () => {
  getSystemTheme();
});

// Handle saving last played track info
ipcMain.handle("save-settings", (event, unsavedSettings) => {
  saveSettings(unsavedSettings);
});

function saveSettings(unsavedSettings, fromsystemTheme = false) {
  try {
    let settings = {};
    const saveNewAsSettings = false;

    if (fs.existsSync(settingsFilePath)) {
      const data = fs.readFileSync(settingsFilePath, "utf8");
      settings = JSON.parse(data);
    }

    if (settings == {}) saveNewAsSettings = true;

    if (fromsystemTheme) {
      if (settings.getSystemTheme) {
        settings.themeMode = unsavedSettings.themeMode;
        settings.new = { themeMode: settings.themeMode };
      }
    } else {
      settings.new = {};
      if (unsavedSettings.getSystemTheme)
        unsavedSettings.themeMode = nativeTheme.shouldUseDarkColors
          ? "dark"
          : "light";

      // Merge: overwrite existing keys, keep old if not in unsavedSettings
      for (const key of Object.keys(unsavedSettings)) {
        if (unsavedSettings[key] !== undefined && unsavedSettings[key] !== "") {
          settings[key] = unsavedSettings[key];
          settings.new[key] = unsavedSettings[key];
        }
      }
    }

    if (saveNewAsSettings) {
      settings = settings.new;
      settings.new = settings;
    }

    fs.writeFileSync(
      settingsFilePath,
      JSON.stringify(settings, null, 4),
      "utf8",
    );

    // Broadcast to all windows that settings have been updated
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("settings-updated", settings);
    });

    return true;
  } catch (error) {
    if (error.message.startsWith("Unexpected end of JSON input")) {
      fs.writeFileSync(settingsFilePath, JSON.stringify({}, null, 4), "utf8");
      saveSettings(unsavedSettings, fromsystemTheme);
    }
    console.error("Error saving last played info:", error);
    return false;
  }
}

ipcMain.handle("clean-new-settings", () => {
  try {
    let settings = {};
    if (fs.existsSync(settingsFilePath)) {
      const data = fs.readFileSync(settingsFilePath, "utf8");
      settings = JSON.parse(data);
    }
    settings.new = {};
    fs.writeFileSync(
      settingsFilePath,
      JSON.stringify(settings, null, 4),
      "utf8",
    );
  } catch (err) {
    console.error(err);
  }
});

ipcMain.handle("changed-json-data", () => {
  // Broadcast to all windows that a album json has been updated
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("music-json-updated");
  });
});

// Handle loading last played track info
ipcMain.handle("get-settings", () => {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const data = fs.readFileSync(settingsFilePath, "utf8");
      return JSON.parse(data);
    } else {
      // create default settings if none exist
      fs.writeFileSync(settingsFilePath, JSON.stringify({}, null, 4), "utf8");
      return {};
    }
  } catch (error) {
    console.error("Error loading last played info:", error);
    return null;
  }
});

ipcMain.handle("decode-m4p", async (event, filePath) => {
  const tempOutputPath = path.join(
    app.getPath("temp"),
    `decoded-${Date.now()}.m4a`,
  );

  return new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", [
      "-i",
      filePath,
      "-vn", // No video
      "-c:a",
      "copy", // Copy audio codec (no re-encode)
      "-f",
      "mp4", // M4A = MP4 container for audio
      "-y", // Overwrite output file
      tempOutputPath,
    ]);

    let stderr = "";

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve(tempOutputPath);
      } else {
        console.error(`FFmpeg exited with code ${code}`);
        console.error("Full stderr:", stderr);
        reject(new Error(`FFmpeg extraction failed with code ${code}`));
      }
    });
  });
});

ipcMain.handle("open-external", (event, absolutePath) => {
  openExternal(absolutePath);
});

function openExternal(absolutePath, onlyOpenOnce = false) {
  if (onlyOpenOnce) {
    // if already opened, just focus it
    if (openedWindows.has(absolutePath)) {
      const existingWin = openedWindows.get(absolutePath);
      existingWin.focus();
      return;
    }
  }

  // create new BrowserWindow
  const win = new BrowserWindow({
    width: 950,
    height: 700,
    minWidth: 800,
    minHeight: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile(absolutePath);

  win.on("focus", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("muffleAudio");
      audioIsMuffled = true;
    }
  });
  openedWindows.set(absolutePath, win);

  win.webContents.on("did-finish-load", () => {
    const title = win.getTitle();

    // Handle focus events for external windows
    if (title === "reload - Mini player") {
      if (openedWindows.has(absolutePath)) {
        openedWindows.delete(absolutePath);
      }
      win.on("focus", () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("unmuffleAudio");
          audioIsMuffled = false;
        }
      });
    }
  });

  win.on("blur", () => {
    // Check if focus is moving to one of our external windows
    setTimeout(() => {
      const focusedWin = BrowserWindow.getFocusedWindow();
      if (
        focusedWin &&
        Array.from(openedWindows.values()).includes(focusedWin)
      ) {
        mainWindow.webContents.send("muffleAudio");
        audioIsMuffled = true;
      } else {
        mainWindow.webContents.send("unmuffleAudio");
        audioIsMuffled = false;
      }
    }, 50); // Small delay to ensure focus has transferred
  });

  // clean up on close
  win.on("closed", () => {
    openedWindows.delete(absolutePath);

    // Check if mainWindow should be unmuffled after this window closes
    if (mainWindow && !mainWindow.isDestroyed()) {
      // If no other external windows are open, unmuffle
      if (openedWindows.size === 0) {
        mainWindow.webContents.send("unmuffleAudio");
        audioIsMuffled = false;
      }
    }
  });
}

ipcMain.handle("get-main-reload-html", async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return [null, null];

  // grab snapshot of renderer DOM
  const state = await mainWindow.webContents.executeJavaScript(
    "document.documentElement.outerHTML",
  );

  // helper: safely add/remove "hidden" class
  function toggleHidden(html, id, shouldHide) {
    const regex = new RegExp(`<div id="${id}"([^>]*)>`);
    return html.replace(regex, (match, attrs) => {
      const classMatch = attrs.match(/class="([^"]*)"/);
      if (classMatch) {
        let classes = classMatch[1].trim().split(/\s+/).filter(Boolean);
        if (shouldHide) {
          if (!classes.includes("hidden")) classes.push("hidden");
        } else {
          classes = classes.filter((c) => c !== "hidden");
        }
        return `<div id="${id}"${attrs.replace(
          /class="[^"]*"/,
          `class="${classes.join(" ")}"`,
        )}>`;
      } else {
        return shouldHide
          ? `<div id="${id}"${attrs} class="hidden">`
          : `<div id="${id}"${attrs}>`;
      }
    });
  }

  const states = [];

  // -----------------------------
  // State 0: player hidden, library visible, app clean
  // -----------------------------
  states[0] = toggleHidden(state, "player-container", true);
  states[0] = toggleHidden(states[0], "library-container", false);
  states[0] = states[0].replace(/<div id="app"[^>]*>/, '<div id="app">');

  // -----------------------------
  // State 1: player visible, library hidden, style moved to app
  // -----------------------------

  // extract the style string from player-container
  const styleMatch = state.match(
    /<div id="player-container"[^>]*style="([^"]*)"/,
  );
  const playerStyle = styleMatch ? styleMatch[1] : "";

  states[1] = toggleHidden(state, "player-container", false);
  states[1] = toggleHidden(states[1], "library-container", true);

  // merge style with existing #app attributes
  states[1] = states[1].replace(/<div id="app"([^>]*)>/, (match, attrs) => {
    // check if app already has a style attribute
    const styleMatchApp = attrs.match(/style="([^"]*)"/);
    if (styleMatchApp) {
      // merge styles
      const merged = styleMatchApp[1].trim();
      return `<div id="app"${attrs.replace(
        /style="[^"]*"/,
        `style="${merged}; ${playerStyle}"`,
      )}>`;
    } else {
      return `<div id="app"${attrs} style="${playerStyle}">`;
    }
  });

  return states;
});

ipcMain.handle("getMuffleStatus", () => {
  return audioIsMuffled;
});

ipcMain.handle("save-file", async (event, absolutePath, data) => {
  try {
    fs.writeFileSync(absolutePath, data, "utf8");
    return true;
  } catch (error) {
    console.error("Error saving file:", error);
    return false;
  }
});

ipcMain.handle("reload-main-page", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.reload();
    return true; // let renderer know it succeeded
  }
  return false; // failed
});

function rgbToHex(rgb) {
  let r, g, b;
  if (Array.isArray(rgb)) {
    [r, g, b] = rgb;
  } else {
    rbgSlipt = rgb.split(","); // these might have 4 values (rgba) (python code, again)
    for (let i = 0; i < rbgSlipt.length; i++) {
      switch (i) {
        case 0:
          r = parseInt(rbgSlipt[i].trim());
          break;
        case 1:
          g = parseInt(rbgSlipt[i].trim());
          break;
        case 2:
          b = parseInt(rbgSlipt[i].trim(), 10);
          break;
        default:
          break;
      }
    }
  }

  return `#${((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)
    .toUpperCase()}`;
}

function lookForCover(folderPath, files) {
  const coverFiles = files.filter((file) =>
    [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(
      path.extname(file).toLowerCase(),
    ),
  );
  if (coverFiles.length > 0) {
    let leading_candidate = -1;
    let leading_candidate_score = -1;
    for (let i = 0; i < coverFiles.length; i++) {
      const file = coverFiles[i].toLowerCase();
      let score = 0;
      let nameHasCoverInit = false;

      if (file.endsWith(".gif")) score += 15;
      if (file.includes("cover")) {
        score += 10;
        nameHasCoverInit = true;
      }

      if (file.includes("front")) {
        if (nameHasCoverInit)
          score -= 3; // this allows to have 'Cover.png' to win over 'FrontCover.png'
        else score += 5;
      } else if (file.includes("back")) {
        if (nameHasCoverInit) score -= 4;
        else score += 4;
      } else if (file.includes("album")) {
        if (nameHasCoverInit) score -= 2;
        else score += 3;
      } else if (file.includes("folder")) {
        if (nameHasCoverInit) score -= 1;
        else score += 2;
      }

      if (score > leading_candidate_score) {
        leading_candidate = i;
        leading_candidate_score = score;
      }
    }
    if (leading_candidate === -1) leading_candidate = 0; // fallback
    return path.join(folderPath, coverFiles[leading_candidate]);
  } else {
    return null;
  }
}

async function getImgColor(imgPath) {
  if (imgPath && fs.existsSync(imgPath)) {
    try {
      const color = await ColorThief.getColor(imgPath);
      return rgbToHex(color);
    } catch (error) {
      console.error(
        "\x1b[38;5;160mError extracting color from image:\x1b[38;5;38m",
        error,
      );
      return "#AAAAAA"; // default color on error
    }
  }
  return "#AAAAAA"; // default color if no image
}

async function getImgPalette(imgPath) {
  if (imgPath && fs.existsSync(imgPath)) {
    try {
      const arrColors = await ColorThief.getPalette(imgPath, 10);
      const colors = arrColors.map((color) => rgbToHex(color));
      return colors;
    } catch (error) {
      console.error(
        "\x1b[38;5;160mError extracting color from image:\x1b[38;5;38m",
        error,
      );
      return "#AAAAAA"; // default color on error
    }
  }
  return "#AAAAAA"; // default color if no image
}

function deleteConfPath(folderPath, confFileName) {
  const confPath = path.join(folderPath, confFileName);
  // Delete old <<>>.json if it exists
  if (fs.existsSync(confPath)) {
    try {
      fs.unlinkSync(confPath);
      console.log(`\x1b[38;5;107mDeleted old json at ${confPath}\x1b[38;5;38m`);
    } catch (err) {
      console.error(
        `\x1b[38;5;160mFailed to delete old json at ${confPath}:\x1b[38;5;38m`,
        err,
      );
    }
  }
}

const looksDir = path.join(userDataPath, "looks");
const shortcutsDir = path.join(userDataPath, "shortcuts");

ipcMain.handle("get-all-user-looks", async () => {
  try {
    // ensure directory exists
    await fs.promises.mkdir(looksDir, { recursive: true });

    const files = await fs.promises.readdir(looksDir);
    const cssFiles = files
      .filter((file) => file.toLowerCase().endsWith(".css"))
      .map((file) => path.join(looksDir, file));

    // Sort so that files ending with "default.css" come first
    cssFiles.sort((a, b) => {
      const aIsDefault = a.toLowerCase().endsWith("default.css");
      const bIsDefault = b.toLowerCase().endsWith("default.css");

      if (aIsDefault && !bIsDefault) return -1;
      if (!aIsDefault && bIsDefault) return 1;
      return 0;
    });

    return cssFiles;
  } catch (err) {
    console.error("Failed to load user looks:", err);
    return [];
  }
});

ipcMain.handle("open-looks-dir", async () => {
  await shell.openPath(looksDir);
  return looksDir;
});

ipcMain.handle("open-shortcuts-dir", async () => {
  await shell.openPath(shortcutsDir);
  return shortcutsDir;
});

ipcMain.handle("get-all-shortcuts", async () => {
  try {
    const files = await fs.promises.readdir(shortcutsDir);
    return files
      .filter((file) => file.toLowerCase().endsWith(".json"))
      .map((file) => path.join(shortcutsDir, file));
  } catch (err) {
    console.error("Failed to load user looks:", err);
    return [];
  }
});

ipcMain.handle("get-current-shortcut", async () => {
  const currTxt = path.join(shortcutsDir, "curr.txt");

  try {
    let contentOfCurrTxt = await fs.promises.readFile(currTxt, "utf8");
    if (!contentOfCurrTxt || contentOfCurrTxt.trim().length === 0) {
      contentOfCurrTxt = "default.json";
    }
    const currShortcut = path.join(shortcutsDir, contentOfCurrTxt.trim());
    return currShortcut;
  } catch (err) {
    // If currTxt doesn't exist, create it with default.json
    if (err.code === "ENOENT") {
      try {
        const contentOfCurrTxt = "default.json";
        await fs.promises.writeFile(currTxt, contentOfCurrTxt);
        const currShortcut = path.join(shortcutsDir, contentOfCurrTxt);
        return currShortcut;
      } catch (writeErr) {
        console.error("Failed to create curr.txt:", writeErr);
        return false;
      }
    }
    console.error("Failed to load user looks:", err);
    return false;
  }
});

ipcMain.handle("set-current-shortcut", async (event, shortcutPath) => {
  if (!shortcutPath) {
    mainWindow.webContents.send("shortcuts-updated");
    return;
  }

  const currTxt = path.join(shortcutsDir, "curr.txt");

  try {
    await fs.promises.writeFile(currTxt, path.basename(shortcutPath));
    mainWindow.webContents.send("shortcuts-updated");
    return true;
  } catch (err) {
    console.error("Failed to set current shortcut:", err);
    return false;
  }
});

ipcMain.handle("add-shortcut", async (event, shortcutName, json = {}) => {
  if (!shortcutName) return false;
  if (shortcutName.endsWith(".json")) shortcutName = shortcutName.slice(0, -5);
  const DEFAULT_INPUTS = {
    opts: { logKeyPress: false, gamepadDeadzone: 0.1 },
    keyboard: {
      whenPressed: {},
      whenUnpressed: {},
      whenDown: {},
      whenUp: {},
      whenUnpressed: {},
    },
    gamepad: {
      whenPressed: {},
      whenUnpressed: {},
      whenDown: {},
      whenUp: {},
    },
    mouse: {
      whenPressed: {},
      whenUnpressed: {},
      whenDown: {},
      whenUp: {},
    },
  };

  if (Object.keys(json).length === 0) {
    json = DEFAULT_INPUTS;
  }

  const newShortcutPath = path.join(shortcutsDir, `${shortcutName}.json`);

  try {
    await fs.promises.writeFile(
      newShortcutPath,
      JSON.stringify(json, null, 4),
      "utf8",
    );
    return true;
  } catch (err) {
    console.error("Failed to add new shortcut:", err);
    return false;
  }
});

ipcMain.handle("remove-shortcut", async (event, shortcutName) => {
  if (shortcutName.endsWith(".json")) shortcutName = shortcutName.slice(0, -5);
  const newShortcutPath = path.join(shortcutsDir, `${shortcutName}.json`);
  if (!shortcutName) {
    return false;
  }

  try {
    await fs.promises.unlink(newShortcutPath);
    return true;
  } catch (err) {
    console.error("Failed to remove shortcut:", err);
    return false;
  }
});
