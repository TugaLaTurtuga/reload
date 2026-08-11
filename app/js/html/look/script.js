const { ipcMain } = require("electron/main");

let htmls = [null, null];
let settings = {
  theme: { dark: "", light: "light" }, // app's theme
  themeMode: "dark",
};

let selectedLooks = [];
const mainLookPath = path.join(__dirname, "css", "look.css");

function getRootFromCSS(css) {
  // Match optional comment, then :root { ... }
  const re =
    /(?:\/\*\s*(?<comment>[^\*]+?)\s*\*\/\s*)?:root\s*{(?<body>[^}]*)}/gms;

  let m;
  const blocks = [];

  while ((m = re.exec(css)) !== null) {
    blocks.push(m);
  }

  for (const match of blocks) {
    const body = match.groups.body;
    if (!body) continue;

    const map = new Map();
    const varRe = /--([\w-]+)\s*:\s*([^;]+);/g;
    let vm;
    while ((vm = varRe.exec(body)) !== null) {
      map.set(`--${vm[1]}`, vm[2].trim());
    }
    return map; // return first :root block
  }

  return null;
}

function mapsAreEqual(map1, map2) {
  if (!(map1 instanceof Map) || !(map2 instanceof Map)) return false;
  if (map1.size !== map2.size) return false;
  for (const [key, val] of map1) {
    if (map2.get(key) !== val) return false;
  }
  return true;
}

function updateCSSContent(look, lookCssContent, lookCssOptions) {
  // rebuild the :root { ... } block
  let newRoot = ":root {\n";
  for (const [name, value] of lookCssOptions.entries()) {
    newRoot += `  ${name}: ${value};\n`;
  }
  newRoot += "}\n";

  // replace the old :root { ... } block
  const updatedCss = lookCssContent.replace(/:root\s*{[^}]*}/m, newRoot.trim());

  // save to file
  try {
    fs.writeFileSync(look.path, updatedCss, "utf-8");
    console.log(`CSS updated and saved to ${look.path}`);
  } catch (err) {
    console.error(`Failed to write CSS to ${look.path}:`, err);
  }

  return updatedCss;
}

// Merge multiple Maps of CSS variables so later maps override earlier ones
function mergeCssVarMaps(maps) {
  const merged = new Map();
  for (const mp of maps) {
    if (!mp) continue;
    for (const [k, v] of mp.entries()) {
      merged.set(k, v);
    }
  }
  return merged;
}


async function combineLooksIntoBase() {
  try {
    // Get the actual look.css path from the main process
    const mainLookPath = await ipcRenderer.invoke("get-look");

    if (!mainLookPath) {
      console.error("get-look did not return a CSS path");
      return false;
    }

    // Create @import statements for every selected look.
    // Use absolute file URLs so CSS can resolve them correctly.
    const imports = selectedLooks
      .map((selected) => {
        const lookPath = selected[2];

        if (!lookPath) return "";

        // Convert absolute filesystem path to a valid file:// URL.
        const cssUrl = require("url").pathToFileURL(lookPath).href;

        return `@import url("${cssUrl}");`;
      })
      .filter(Boolean)
      .join("\n");

    const updatedCss = imports ? `${imports}\n` : "";

    fs.writeFileSync(mainLookPath, updatedCss, "utf-8");

    console.log(`CSS imports updated in ${mainLookPath}`);
    return true;
  } catch (err) {
    console.error("Failed to update main look CSS:", err);
    return false;
  }
}


async function loadSettings(onlyNewchanges = false, updatedSettings = {}) {
  try {
    if (Object.keys(updatedSettings).length === 0) {
      updatedSettings = (await ipcRenderer.invoke("get-settings")) || {};
    }
    if (!updatedSettings) return;

    for (const key in settings) {
      // saver load then just putting
      if (updatedSettings.hasOwnProperty(key) && !onlyNewchanges) {
        settings[key] = updatedSettings[key];
      } else if (
        onlyNewchanges &&
        updatedSettings.new &&
        updatedSettings.new.hasOwnProperty(key)
      ) {
        settings[key] = updatedSettings.new[key];
      }
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
  console.log("Settings loaded");
  updateTheme();
}

function updateTheme() {
  let link = document.getElementById("themes-stylesheet");
  // Force reload by appending timestamp query
  link.href = `css/themes.css?ts=${Date.now()}`;

  document.body.setAttribute("theme", settings.theme[settings.themeMode]);
}

// helper regex to find the toolTip link
const toolTipRegex = /<link[^>]*href=(['"])css\/toolTip\.css\1[^>]*>/i;

const grid = document.getElementById("looks-grid");
const refreshBtn = document.getElementById("refresh");
const openLooksFolderBtn = document.getElementById("open-looks-folder");

// will collect blob urls we create so we can revoke them later
const createdBlobUrls = [];

async function updateLookCss(css) {
  try {
    await fs.writeFileSync(mainLookPath, css, "utf8");
  } catch (err) {
    console.error("Failed to write css/look.css file:", err);
  }
}

async function loadLooks() {
  grid.innerHTML = '<div class="empty">Loading looks...</div>';

  let looks = [];

  try {
    if (ipcRenderer && ipcRenderer.invoke) {
      looks = await ipcRenderer.invoke("get-all-user-looks");
    } else {
      console.warn("ipcRenderer not available — running demo fallback");
      looks = [];
    }
  } catch (err) {
    console.error("Failed to fetch looks:", err);
    grid.innerHTML =
      '<div class="empty">Error loading looks — check console</div>';
    return;
  }

  if (!Array.isArray(looks) || looks.length === 0) {
    grid.innerHTML = '<div class="empty">No looks returned.</div>';
    return;
  }

  grid.innerHTML = "";

  // normalize to objects: { name, css, path }
  looks = looks.map((item) => {
    const lookPath = String(item);

    return {
      name: path.basename(lookPath),
      css: lookPath,
      path: lookPath,
    };
  });

  // Reset selected looks before rebuilding them
  selectedLooks = [];

  // Read the main look.css and extract @import paths
  const lookNames = new Set();

  try {
    const mainLookPath = await ipcRenderer.invoke("get-look");

    if (mainLookPath && fs.existsSync(mainLookPath)) {
      const css = fs.readFileSync(mainLookPath, "utf8");

      /*
       * Matches:
       *
       * @import url("file:///C:/path/to/look.css");
       * @import url('file:///C:/path/to/look.css');
       * @import url(file:///C:/path/to/look.css);
       *
       * Also accepts normal absolute paths if present.
       */
      const importRe =
        /@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;/gi;

      let match;
      let foundAny = false;

      const defaultLook = looks.find(
        (look) => look.name.toLowerCase() === "default.css",
      );

      while ((match = importRe.exec(css)) !== null) {
        foundAny = true;

        let lookPath = match[1].trim();

        // Convert file:// URL back into an absolute filesystem path
        if (lookPath.startsWith("file://")) {
          try {
            lookPath = require("url").fileURLToPath(lookPath);
          } catch (err) {
            console.warn("Failed to convert CSS import URL:", lookPath, err);
            continue;
          }
        }

        // Normalize the path
        lookPath = path.normalize(lookPath);

        // Ignore default.css if it is explicitly handled as the fallback
        if (
          defaultLook &&
          path.normalize(defaultLook.path) === lookPath
        ) {
          continue;
        }

        const lookName = path.basename(lookPath);

        lookNames.add(lookName);

        if (fs.existsSync(lookPath)) {
          const lookCssContent = fs.readFileSync(lookPath, "utf8");
          const lookCssOptions = getRootFromCSS(lookCssContent);

          selectedLooks.push([
            lookCssOptions,
            lookCssContent,
            lookPath,
          ]);
        } else {
          console.warn(`⚠️ Look path not found: ${lookPath}`);
        }
      }

      // If there are no imports, use default.css
      if (!foundAny && defaultLook) {
        lookNames.add(defaultLook.name);

        const defaultCssContent = fs.existsSync(defaultLook.path)
          ? fs.readFileSync(defaultLook.path, "utf8")
          : "";

        const defaultCssOptions = getRootFromCSS(defaultCssContent);

        selectedLooks.push([
          defaultCssOptions,
          defaultCssContent,
          defaultLook.path,
        ]);
      }
    }
  } catch (err) {
    console.error("Failed to read main look CSS:", err);
  }

  // create one iframe per look
  looks.forEach((look, i) => {
    const framesDiv = document.createElement("div");
    framesDiv.className = "look-frames";

    const card = document.createElement("div");
    card.className = "look-card";

    const header = document.createElement("div");
    header.className = "look-header";
    header.textContent = look.name;

    const valueChanger = document.createElement("div");
    valueChanger.className = "look-values";

    // Extract CSS content from the individual look file
    let lookCssContent = "";

    try {
      if (fs.existsSync(look.path)) {
        lookCssContent = fs.readFileSync(look.path, "utf8");
      }
    } catch (err) {
      console.error("Failed to read look.css file:", err);
    }

    let lookCssOptions = getRootFromCSS(lookCssContent);

    const lookIndex = selectedLooks.findIndex(
      (sel) => path.normalize(sel[2]) === path.normalize(look.path),
    );

    if (lookIndex !== -1 || lookNames.has(look.name)) {
      const isDifferent =
        lookIndex !== -1 &&
        !mapsAreEqual(
          selectedLooks[lookIndex][0],
          lookCssOptions,
        ) &&
        lookCssOptions !== "" &&
        lookCssOptions !== null &&
        lookCssOptions !== undefined;

      header.style.color = isDifferent
        ? "var(--ControlsBtnsColor)"
        : "var(--activeColor)";
    }

    header.addEventListener("click", async () => {
      const normalizedLookPath = path.normalize(look.path);

      const lookIndex = selectedLooks.findIndex(
        (sel) => path.normalize(sel[2]) === normalizedLookPath,
      );

      if (
        header.style.color === "var(--activeColor)" ||
        header.style.color === "var(--ControlsBtnsColor)"
      ) {
        // Deselect
        header.style.color = "";

        if (lookIndex !== -1) {
          selectedLooks.splice(lookIndex, 1);
        }
      } else {
        // Select
        selectedLooks.push([
          lookCssOptions,
          lookCssContent,
          look.path,
        ]);

        header.style.color = "var(--activeColor)";
      }

      await combineLooksIntoBase();
      await ipcRenderer.invoke("save-settings", {});
    });

    const frames = [];

    for (let frameIndex = 0; frameIndex < htmls.length; frameIndex++) {
      frames.push(document.createElement("iframe"));
      populateIframe(frameIndex);

      frames[frameIndex].style.minWidth =
        `${(1 / htmls.length) * 100 * 2}%`;

      frames[frameIndex].style.marginLeft =
        `calc(${-frameIndex} * ${(1 / htmls.length) * 100}%)`;

      framesDiv.appendChild(frames[frameIndex]);
    }

    if (lookCssOptions) {
      for (const [name, data] of lookCssOptions.entries()) {
        const label = document.createElement("label");

        label.textContent = `${name
          .slice(2)
          .replace(/([A-Z])/g, " $1")
          .replace(/-/g, " ")
          .replace(/^./, (c) => c.toUpperCase())
          .replace(/ (.)/g, (m, c) => " " + c.toLowerCase())}:`;

        const input = document.createElement("input");
        input.type = "text";
        input.value = data;

        input.addEventListener("input", async () => {
          // Update Map
          lookCssOptions.set(name, input.value);

          // Rebuild the individual look CSS and save it
          const updatedCss = updateCSSContent(
            look,
            lookCssContent,
            lookCssOptions,
          );

          lookCssContent = updatedCss;

          // Keep the look object pointing to the actual file path
          look.css = look.path;
          looks[i].css = look.path;

          // Re-read options
          lookCssOptions = getRootFromCSS(lookCssContent);

          const lookIndexOnInput = selectedLooks.findIndex(
            (sel) =>
              path.normalize(sel[2]) ===
              path.normalize(look.path),
          );

          if (lookIndexOnInput !== -1 || lookNames.has(look.name)) {
            const isDifferent =
              lookIndexOnInput !== -1 &&
              !mapsAreEqual(
                selectedLooks[lookIndexOnInput][0],
                lookCssOptions,
              ) &&
              lookCssOptions !== "" &&
              lookCssOptions !== null &&
              lookCssOptions !== undefined;

            header.style.color = isDifferent
              ? "var(--ControlsBtnsColor)"
              : "var(--activeColor)";
          }

          // Update selected look's CSS map/content
          if (lookIndexOnInput !== -1) {
            selectedLooks[lookIndexOnInput][0] = lookCssOptions;
            selectedLooks[lookIndexOnInput][1] = lookCssContent;
          }

          // Live-update all iframes for this look
          frames.forEach((frame) => {
            try {
              const doc = frame.contentDocument;
              if (!doc) return;

              let styleEl =
                doc.getElementById("user-look-style");

              if (!styleEl) {
                styleEl = doc.createElement("style");
                styleEl.id = "user-look-style";
                doc.head.appendChild(styleEl);
              }

              styleEl.textContent = updatedCss;
            } catch (e) {
              console.warn("iframe update failed:", e);
            }
          });

          // Rebuild the main @import file if this look is selected
          if (lookIndexOnInput !== -1) {
            await combineLooksIntoBase();
          }
        });

        const valueDiv = document.createElement("div");
        valueDiv.appendChild(label);
        valueDiv.appendChild(input);

        valueChanger.appendChild(valueDiv);
      }
    }

    card.appendChild(header);
    card.appendChild(framesDiv);
    card.appendChild(valueChanger);
    grid.appendChild(card);

    async function populateIframe(frame) {
      let modified = htmls[frame];

      // Remove an existing user-look link
      const userLookRegex =
        /<link[^>]*id=["']user-look["'][^>]*>/i;

      if (userLookRegex.test(modified)) {
        modified = modified.replace(userLookRegex, "");
      }

      try {
        frames[frame].srcdoc = modified;

        frames[frame].addEventListener(
          "load",
          () => {
            try {
              frames[
                frame
              ].contentWindow.document.documentElement.dataset.lookIndex =
                i;

              const doc = frames[frame].contentDocument;

              if (doc) {
                let styleEl =
                  doc.getElementById("user-look-style");

                if (!styleEl) {
                  styleEl = doc.createElement("style");
                  styleEl.id = "user-look-style";
                  doc.head.appendChild(styleEl);
                }

                styleEl.textContent = lookCssContent;
              }
            } catch (e) {
              /* ignore cross-origin */
            }
          },
          { once: true },
        );
      } catch (err) {
        console.error("Failed to populate iframe", err);
      }
    }
  });
}

// initial load
document.addEventListener("DOMContentLoaded", async () => {
  htmls = await ipcRenderer.invoke("get-main-reload-html");
  baseHtml = htmls[1];
  loadSettings();
  loadLooks();
});

refreshBtn.addEventListener("click", () => location.reload());

// cleanup blob urls when page unloads
window.addEventListener("beforeunload", () => {
  createdBlobUrls.forEach((u) => {
    try {
      URL.revokeObjectURL(u);
    } catch (e) {}
  });
});

openLooksFolderBtn.addEventListener("click", async () => {
  try {
    const looksDir = await ipcRenderer.invoke("open-looks-dir");
    await navigator.clipboard.writeText(looksDir);
  } catch (e) {
    console.error("Failed to open looks dir", e);
  }
});

ipcRenderer.on("settings-updated", async (event, updatedSettings) => {
  location.reload();
});

