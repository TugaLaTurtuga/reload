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

function combineLooksIntoBase() {
  let newRoot = ":root {\n";
  let oldRootNames = new Map();
  let updatedCss = "";
  for (let i = 0; i < selectedLooks.length; i++) {
    const rootLook = selectedLooks[i][0];
    console.log(selectedLooks[i]);
    const look = selectedLooks[i][1];
    const lookName = selectedLooks[i][2];
    if (rootLook) {
      let thisRoot = ":root {\n";
      for (const [name, value] of rootLook.entries()) {
        if (!oldRootNames.has(name)) {
          newRoot += `  ${name}: ${value};\n`;
          oldRootNames.set(name, value);
        }
        thisRoot += `  ${name}: ${value};\n`;
      }
      updatedCss += `\n\n/* _-PROGRAMING IS SO MUCH FUN! I wanna kms when I look at this, but this is a fire name: ${lookName} */\n${look.replace(/:root\s*{[^}]*}/, "")}\n`;
    } else {
      updatedCss += `\n\n/* _-PROGRAMING IS SO MUCH FUN! I wanna kms when I look at this, but this is a fire name: ${lookName} */\n${look}\n`;
    }
  }

  newRoot += "}\n";
  updatedCss = newRoot.trim() + updatedCss;

  // save to file
  try {
    fs.writeFileSync(mainLookPath, updatedCss, "utf-8");
    console.log(`CSS updated and saved to ${mainLookPath}`);
    return true;
  } catch (err) {
    console.error(`Failed to write CSS to ${mainLookPath}:`, err);
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
      // demo: two simple looks — one as path, one as raw css
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
  looks = looks.map((item, idx) => {
    return { name: item.split("/").pop(), css: String(item), path: item };
  });

  // Extract css/look.css content
  const lookNames = new Set();
  try {
    if (fs.existsSync(mainLookPath)) {
      const css = fs.readFileSync(mainLookPath, "utf8");

      // Match all look names in that comment format
      const nameRe =
        /\/\*\s*_-PROGRAMING IS SO MUCH FUN! I wanna kms when I look at this, but this is a fire name:\s*([^*]+)\*\//g;
      let match;
      let foundAny = false;

      const defaultLook = looks.find((look) => look.name === "default.css");

      // Loop through all matches
      while ((match = nameRe.exec(css)) !== null) {
        foundAny = true;
        const lookPath = match[1].trim();

        if (defaultLook?.path === lookPath) continue;

        const lookName = lookPath.split("/").pop();
        lookNames.add(lookName);

        if (fs.existsSync(lookPath)) {
          const lookCssContent = fs.readFileSync(lookPath, "utf8");
          const lookCssOptions = getRootFromCSS(lookCssContent);
          selectedLooks.push([lookCssOptions, lookCssContent, lookPath]);
        } else {
          console.warn(`⚠️ Look path not found: ${lookPath}`);
        }
      }

      // If no matches found, use default look
      if (!foundAny && defaultLook) {
        lookNames.add(defaultLook.name);
        selectedLooks.push([new Map(), "", defaultLook.path]);
      }
    }
  } catch (err) {
    console.error("Failed to read css/look.css file:", err);
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

    // Extract CSS content from look.css file
    let lookCssContent = "";

    try {
      if (fs.existsSync(look.css)) {
        lookCssContent = fs.readFileSync(look.css, "utf8");
      }
    } catch (err) {
      console.error("Failed to read look.css file:", err);
    }

    let lookCssOptions = getRootFromCSS(lookCssContent);
    const lookIndex = selectedLooks.findIndex((sel) => sel[2] === look.path);
    if (lookIndex !== -1 || lookNames.has(look.name)) {
      const isDifferent =
        lookIndex !== -1 &&
        !mapsAreEqual(selectedLooks[lookIndex][0], lookCssOptions) &&
        lookCssOptions !== "" &&
        lookCssOptions !== null &&
        lookCssOptions !== undefined;
      header.style.color = isDifferent
        ? "var(--ControlsBtnsColor)"
        : "var(--activeColor)";
    }

    header.addEventListener("click", () => {
      const lookIndex = selectedLooks.findIndex((sel) => sel[2] === look.path);

      if (
        header.style.color === "var(--activeColor)" ||
        header.style.color === "var(--ControlsBtnsColor)"
      ) {
        header.style.color = "";
        if (lookIndex !== -1) selectedLooks.splice(lookIndex, 1);
      } else {
        selectedLooks.push([lookCssOptions, lookCssContent, look.path]);
        header.style.color = "var(--activeColor)";
      }

      combineLooksIntoBase();
      ipcRenderer.invoke("save-settings", {}); // reloads all windows
    });

    const frames = [];

    for (let i = 0; i < htmls.length; i++) {
      frames.push(document.createElement("iframe"));
      populateIframe(i);

      frames[i].style.minWidth = `${(1 / htmls.length) * 100 * 2}%`;
      frames[i].style.marginLeft = `calc(${-i} * ${(1 / htmls.length) * 100}%)`;
      framesDiv.appendChild(frames[i]);
    }

    if (lookCssOptions) {
      // iterate over Map entries
      for (const [name, data] of lookCssOptions.entries()) {
        // add input fields for each option
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

        input.addEventListener("input", () => {
          // update Map
          lookCssOptions.set(name, input.value);

          // rebuild CSS content and save
          let updatedCss = updateCSSContent(
            look,
            lookCssContent,
            lookCssOptions,
          );
          look.css = updatedCss;
          looks[i].css = updatedCss;
          lookCssContent = updatedCss;
          lookCssOptions = getRootFromCSS(lookCssContent);

          const lookIndexOnInput = selectedLooks.findIndex(
            (sel) => sel[2] === look.path,
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
            console.log(selectedLooks[lookIndexOnInput][0], lookCssOptions);
            header.style.color = isDifferent
              ? "var(--ControlsBtnsColor)"
              : "var(--activeColor)";
          }

          // 🔥 live-update all iframes for this look
          frames.forEach((frame) => {
            try {
              const doc = frame.contentDocument;
              if (!doc) return;
              let styleEl = doc.getElementById("user-look-style");
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

      // regex to detect an existing user-look link
      const userLookRegex = /<link[^>]*id=["']user-look["'][^>]*>/i;

      if (userLookRegex.test(modified)) {
        // replace existing user-look
        modified = modified.replace(userLookRegex, "");
      }

      try {
        // write HTML into iframe
        frames[frame].srcdoc = modified;

        frames[frame].addEventListener(
          "load",
          () => {
            try {
              frames[
                frame
              ].contentWindow.document.documentElement.dataset.lookIndex = i;

              const doc = frames[frame].contentDocument;
              if (doc) {
                let styleEl = doc.getElementById("user-look-style");
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
