const { app, BrowserWindow, ipcMain, Menu, nativeTheme } = require("electron");
const { childProcess, spawn, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const mm = require("music-metadata");
const ColorThief = require("colorthief");
const { get } = require("https");
const settingsFilePath = path.join(app.getPath("userData"), "settings.json");
const libraryFilePath = path.join(app.getPath("userData"), "library.json");
const defaultLibraryPaths = [path.join(app.getPath("documents"), "reload")];
const changeLogsPath = path.join(__dirname, "changeLogs.json");
const openedWindows = new Map();

let mainWindow;

function createAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            // open settings page
            const settingsPath = path.join(
              __dirname,
              "../app/html/settings.html",
            );
            openExternal(settingsPath, true);
          },
        },
        {
          label: "Themes Editor",
          accelerator: "CmdOrCtrl+T",
          click: () => {
            // open theme editor page
            const themePath = path.join(
              __dirname,
              "../app/html/themeEditor.html",
            );
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
        },
      ],
    },
    {
      label: "Edit",
      submenu: [{ role: "cut" }, { role: "copy" }, { role: "paste" }],
    },
    {
      label: "View",
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
        { role: "reload" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 570,
    minHeight: 100,
    titleBarStyle: "hidden",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("app/index.html");
}

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

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Get music library
ipcMain.handle("get-library", async () => {
  try {
    // Try to get libraries
    await loadLibraryPaths();
    let songs = [];
    for (const path of defaultLibraryPaths) {
      const music = await scanMusicFolder(path);
      if (music.length > 0) songs.push(...music);
    }
    return songs;
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
        JSON.stringify(defaultLibraryPaths, null, 2),
        "utf8",
      );
      return defaultLibraryPaths;
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
      fs.writeFileSync(libraryFilePath, JSON.stringify(paths, null, 2), "utf8");
    } catch (error) {
      console.error("Error saving library paths:", error);
    }
  }
});

ipcMain.handle("get-change-logs", () => {
  if (fs.existsSync(changeLogsPath)) {
    const data = fs.readFileSync(changeLogsPath, "utf8");
    return JSON.parse(data);
  } else {
    return {};
  }
});

async function scanMusicFolder(rootPath, fromExternalProvider = false) {
  const albums = [];

  async function processFolder(folderPath) {
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
      const dirs = entries.filter((entry) => entry.isDirectory());

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

      // Sort audio files by the leading number in the filename
      audioFiles.sort((a, b) => {
        const numA = parseInt(a.match(/^\d+/)?.[0], 10) || Infinity;
        const numB = parseInt(b.match(/^\d+/)?.[0], 10) || Infinity;
        return numA - numB;
      });

      if (audioFiles.length > 0) {
        const album = {
          name: path.basename(folderPath),
          path: folderPath,
          tracks: [],
          info: {
            trackList: [],
            description: {
              name: path.basename(folderPath),
              author: path.basename(path.dirname(folderPath)),
              label: "none",
              description: "",
              year: "year",
              genre: fromExternalProvider ? "from external provider." : "genre",
              color: "#AAAAAA",
              rating: 5,
              cover: null,
            },
          },
        };

        // Initialize or read music.json
        const confPath = path.join(folderPath, "reload.json");
        //deleteConfPath(folderPath, 'reload1.json')

        let shouldExtractColor = false;

        if (!fromExternalProvider && !fs.existsSync(confPath)) {
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
            fs.writeFileSync(
              confPath,
              JSON.stringify(album.info, null, 2),
              "utf8",
            );
          } catch (err) {
            console.error("Error creating json:", err);
          }
        } else if (!fromExternalProvider) {
          // json exists → load it
          try {
            const data = fs.readFileSync(confPath, "utf8");
            const parsedData = JSON.parse(data);
            album.info = parsedData || album.info;

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
        } else {
          // external provider fallback
          album.info.trackList = audioFiles.map((file) => ({
            title: path.basename(file, path.extname(file)).trim(),
            rating: 5,
          }));
          shouldExtractColor = true;
        }

        // ✅ only rasterize cover if needed
        if (album.info.description.cover && shouldExtractColor) {
          album.info.description.color = await getImgColor(
            album.info.description.cover,
          );
          try {
            fs.writeFileSync(
              confPath,
              JSON.stringify(album.info, null, 2),
              "utf8",
            );
          } catch (err) {
            console.error("Error updating json with color:", err);
          }
        } else if (!album.info.description.cover) {
          album.info.description.cover = await lookForCover(folderPath, files);
          if (album.info.description.cover) {
            album.info.description.color = await getImgColor(
              album.info.description.cover,
            );
            try {
              fs.writeFileSync(
                confPath,
                JSON.stringify(album.info, null, 2),
                "utf8",
              );
            } catch (err) {
              console.error("Error updating json with color:", err);
            }
          }
        }

        // Utility functions
        const cleanTrackTitle = (title) =>
          title.replace(/^\d+\s*\.?\s*/, "").trim();

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

              if (fromExternalProvider && metadata.common) {
                const { artist, album: alb, year, genre } = metadata.common;
                if (artist) album.info.description.author = artist;
                if (alb) album.name = alb;
                if (year) album.info.description.year = year;
                if (genre?.length) album.info.description.genre = genre[0];
              }

              return {
                title: rawTitle,
                path: trackPath,
                duration: metadata.format.duration || 0,
              };
            } catch (err) {
              console.error(`Error parsing metadata for ${rawTitle}:`, err);
              return { title: rawTitle, path: trackPath, duration: 0 };
            }
          }),
        );

        // Build lookup map for efficient matching
        const trackMap = new Map(
          ungarnizedTracks.map((t) => [clearTitle(t.title), t]),
        );

        // Match with trackList
        album.tracks = album.info.trackList
          .map((track) => {
            const match = trackMap.get(clearTitle(track.title));
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

        // Sort both arrays
        album.info.trackList.sort(sortByTrackNumber);
        album.tracks.sort(sortByTrackNumber);

        album.jsonPath = confPath;

        if (album.tracks.length > 0) albums.push(album);
      }

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

  return albums;
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

    if (fs.existsSync(settingsFilePath)) {
      const data = fs.readFileSync(settingsFilePath, "utf8");
      settings = JSON.parse(data);
    }

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

    fs.writeFileSync(
      settingsFilePath,
      JSON.stringify(settings, null, 2),
      "utf8",
    );

    // Broadcast to all windows that settings have been updated
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("settings-updated", settings);
    });

    return true;
  } catch (error) {
    console.error("❌ Error saving last played info:", error);
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
      JSON.stringify(settings, null, 2),
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
      fs.writeFileSync(settingsFilePath, JSON.stringify({}, null, 2), "utf8");
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
      if (!existingWin.isDestroyed()) {
        existingWin.focus();
        return;
      } else {
        // clean up destroyed reference
        openedWindows.delete(absolutePath);
      }
    }
  }

  // create new BrowserWindow
  const win = new BrowserWindow({
    width: 950,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile(absolutePath);
  openedWindows.set(absolutePath, win);

  // clean up on close
  win.on("closed", () => {
    openedWindows.delete(absolutePath);
  });
}

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

function rbgToHex(rgb) {
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

  // limit how bright the color can be (to avoid white colors)
  const total = r + g + b;
  const clamp = 0.9 * 765; // 765 = 255 * 3
  if (total > clamp) {
    const scale = clamp / total;
    r = Math.round(r * scale);
    g = Math.round(g * scale);
    b = Math.round(b * scale);
  }
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b)); // always nice to clamp (bc me bad at js)

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
      const file = coverFiles[i];
      let score = 0;
      let nameHasCoverInit = false;
      if (file.toLowerCase().includes("cover")) {
        score += 10;
        nameHasCoverInit = true;
      }

      if (file.toLowerCase().includes("front")) {
        if (nameHasCoverInit)
          score -= 3; // this allows to have 'Cover.png' to win over 'FrontCover.png'
        else score += 5;
      } else if (file.toLowerCase().includes("back")) {
        if (nameHasCoverInit) score -= 4;
        else score += 4;
      } else if (file.toLowerCase().includes("album")) {
        if (nameHasCoverInit) score -= 2;
        else score += 3;
      } else if (file.toLowerCase().includes("folder")) {
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
      return rbgToHex(color);
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
  // Delete old music.json if it exists
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
