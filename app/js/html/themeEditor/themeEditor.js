const { ipcRenderer } = require("electron");
const path = require("path");
const fs = require("fs");

function updateOverflows() {
  const themeItems = document.querySelectorAll(".theme-item");

  themeItems.forEach((themeItem, index) => {
    const themeItemTitle = themeItem.querySelector(".theme-item-title");

    if (!themeItemTitle) return;

    // First reset
    themeItemTitle.style.animation = "none";

    // If overflowing
    if (themeItemTitle.scrollWidth > themeItem.clientWidth) {
      // Wrap once
      if (themeItemTitle.children.length === 0) {
        const text = themeItemTitle.textContent;
        themeItemTitle.textContent = "";

        const firstSpan = document.createElement("span");
        const secondSpan = document.createElement("span");

        firstSpan.textContent = text;
        secondSpan.textContent = text;

        themeItemTitle.appendChild(firstSpan);
        themeItemTitle.appendChild(secondSpan);
      }

      // After spans are added, re-measure
      const scrollWidth = themeItemTitle.scrollWidth;
      const visibleWidth = themeItem.clientWidth;

      // Duration proportional to text length
      const duration = Math.pow((scrollWidth / visibleWidth) * 0.5, 1.15) + 0.5;

      // Unique keyframe name per item
      const animationName = `scroll-title-${index}`;

      const scrollFrames = `
        @keyframes ${animationName} {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `;

      // Inject or update <style>
      let styleTag = document.getElementById(animationName);
      if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = animationName;
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML = scrollFrames;

      // Apply animation
      themeItemTitle.style.animation = `${animationName} ${duration}s linear infinite`;
      themeItemTitle.classList.add("overflowing");
    } else {
      // Reset if no overflow
      themeItemTitle.classList.remove("overflowing");
      themeItemTitle.style.animation = "none";
    }
  });
}

// ---------- Utilities ----------
const CSS_URL = "../css/themes.css";
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const statusEl = $("#status");

// Data model: Map<name, Map<var, val>>
let themes = new Map();
let preface = "";
let selected = "root";
let fileHandle = null;
let stylesheetReadyPromise = null;

function setStatus(msg) {
  statusEl.textContent = msg;
}
function sanitizeName(n) {
  n = String(n || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
  let nn = n;
  let suffix = 1;
  while (themes.has(nn)) {
    nn = n + "-" + suffix;
    suffix++;
  }
  return nn;
}

// ---------- Parsing & Serialization ----------
let firstParsed = true;
function parseThemesCSS(cssText) {
  const oldPreface = preface;
  const re =
    /(?:\/\*\s*(?<comment>[^\*]+?)\s*\*\/\s*)?(?<selector>:root|\[theme="([^"]+)"\])\s*\{(?<body>[^}]+)\}/gms;
  let m,
    firstIndex = -1,
    blocks = [];
  while ((m = re.exec(cssText)) !== null) {
    if (firstIndex === -1) firstIndex = m.index;
    blocks.push(m);
  }

  if (firstParsed) {
    preface = firstIndex > 0 ? cssText.slice(0, firstIndex).trimEnd() : "";
    firstParsed = !firstParsed;
  }

  for (const match of blocks) {
    const sel = match.groups.selector;
    if (oldPreface === preface && sel === ":root") continue;
    const body = match.groups.body;
    let name = sanitizeName(
      sel === ":root" ? "root" : sel.match(/\[theme="([^"]+)"\]/)[1],
    );

    const map = new Map();
    const varRe = /--([\w-]+)\s*:\s*([^;]+);/g;
    let vm;
    while ((vm = varRe.exec(body)) !== null) {
      map.set(`--${vm[1]}`, vm[2].trim());
    }

    // Ensure all root vars exist in every theme
    if (name !== "root" && themes.has("root")) {
      const rootVars = themes.get("root");
      for (const [rootKey, rootVal] of rootVars.entries()) {
        if (!map.has(rootKey)) {
          map.set(rootKey, rootVal);
        }
      }
    }
    themes.set(name, map);
  }
}

function serializeThemesCSS(allThemesToSerialize = themes) {
  const order = [
    "root",
    ...Array.from(allThemesToSerialize.keys())
      .filter((k) => k !== "root")
      .sort((a, b) => a.localeCompare(b)),
  ];
  const parts = [];
  if (preface && preface.trim()) parts.push(preface.trimEnd() + "\n\n");

  for (let key of order) {
    const map = allThemesToSerialize.get(key) || new Map();
    const sel =
      key === "root" ? ":root" : `[theme="${key.replace(/ /g, "-")}"]`;
    let vars = Array.from(map.entries());
    for (let i = vars.length; i > 0; --i) {
      try {
        let [key, value] = vars[i];

        if (key === undefined || !key.startsWith("--")) {
          // impossible key
          vars.splice(i, 1); // delete var
        } else if (value === undefined) {
          // impossible value
          vars[i].value = ""; // reset value
        }
      } catch (err) {
        // a very broken var
        vars.splice(i, 1); // delete var
      }
    }
    const cssVars = vars // turns vars to css
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n");

    // Capitalize the first character of the selector for the comment
    const selComment =
      key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ");
    parts.push(`/* ${selComment} mode */\n${sel} {\n${cssVars}\n}\n`);
  }
  return parts.join("\n\n").trim() + "\n";
}

function getCSSVarInRGB(value) {
  // If it's already rgb()
  if (value.startsWith("rgb")) {
    const match = value.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (match) {
      return [
        parseInt(match[1], 10),
        parseInt(match[2], 10),
        parseInt(match[3], 10),
      ];
    }
  }

  // If it's hex (#rrggbb or #rgb)
  if (value.startsWith("#")) {
    if (value.length === 7) {
      return [
        parseInt(value.substr(1, 2), 16),
        parseInt(value.substr(3, 2), 16),
        parseInt(value.substr(5, 2), 16),
      ];
    } else if (value.length === 4) {
      return [
        parseInt(value[1] + value[1], 16),
        parseInt(value[2] + value[2], 16),
        parseInt(value[3] + value[3], 16),
      ];
    }
  }

  // Fallback → gray
  return [128, 128, 128];
}

function isLightTheme(data) {
  const [r1, g1, b1] = getCSSVarInRGB(data.get("--bg-1"));
  const [r2, g2, b2] = getCSSVarInRGB(data.get("--bg-2"));

  const luminance1 = (0.299 * r1 + 0.587 * g1 + 0.114 * b1) / 255;
  const luminance2 = (0.299 * r2 + 0.587 * g2 + 0.114 * b2) / 255;

  return (luminance1 + luminance2) / 2 > 0.5;
}

// ---------- Rendering ----------
function renderThemesList() {
  const container = {
    dark: $("#themesListDark"),
    light: $("#themesListLight"),
  };

  container.dark.innerHTML = "";
  container.light.innerHTML = "";

  for (const theme of themes) {
    const [name, data] = theme;
    const item = document.createElement("div");
    item.id = `theme-${name}`;
    item.className = "theme-item" + (name === selected ? " active" : "");
    item.setAttribute("role", "option");
    item.style.setProperty("--bg", data.get("--trackItemOddColor"));
    item.style.setProperty("--color", data.get("--textColor"));
    item.style.setProperty("--border", data.get("--sliderBgColor"));
    item.style.setProperty("--hover", data.get("--trackItemOnHover"));
    item.style.setProperty("--btn-font", data.get("--font"));
    item.dataset.name = name;
    item.innerHTML = `<div class="theme-item-title">${name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ")}</div>`;
    item.addEventListener("click", () => {
      selected = name;
      playSoundAffect("click", (volume = 0.15));
      renderThemesList();
      renderVarsTable();
      refreshButtons();
      // apply theme but do not block UI
      applyTheme().catch(() => {});
    });

    if (isLightTheme(data)) {
      container.light.appendChild(item);
    } else {
      container.dark.appendChild(item);
    }
  }

  if (settings.themeMode === "light") {
    container.light.style.display = "block";
    container.dark.style.display = "none";
  } else {
    container.light.style.display = "none";
    container.dark.style.display = "block";
  }

  updateOverflows();
}

async function renderVarsTable() {
  function applyThemeToBtn() {
    const item = document.getElementById(`theme-${selected}`);
    if (!item) return;
    item.style.setProperty("--bg", vars.get("--trackItemOddColor"));
    item.style.setProperty("--color", vars.get("--textColor"));
    item.style.setProperty("--border", vars.get("--sliderBgColor"));
    item.style.setProperty("--hover", vars.get("--trackItemOnHover"));
    item.style.setProperty("--btn-font", vars.get("--font"));
  }

  const body = $("#varsBody");
  body.innerHTML = "";
  const vars = themes.get(selected) || new Map();

  // helpers
  const quoteIfNeeded = (name) => {
    if (!name) return name;
    // if contains spaces or special chars, wrap in single quotes
    return /[\s"'(),]/.test(name) ? `'${name.replace(/['"]/g, "")}'` : name;
  };

  const parseFontVar = (val) => {
    // val examples: "'Rubik', sans-serif" or "Arial, sans-serif"
    if (!val) return { primary: "", fallback: "sans-serif" };
    const parts = val
      .split(",")
      .map((p) => p.trim().replace(/^["']|["']$/g, ""));
    return {
      primary: parts[0] || "",
      fallback: parts[1] || "sans-serif",
    };
  };

  for (let [key, val] of vars) {
    const tr = document.createElement("tr");

    let type = "text";
    let alpha = 1;

    // Detect color
    if (isColor(val)) {
      type = "color";
      [val, alpha] = toHex(val) || [val, 1];
    } else if (!isNaN(Number(val))) {
      type = "number";
    } else if (val === "true" || val === "false") {
      type = "checkbox";
    }

    // Prettify variable name
    const name = key
      .slice(2)
      .replace(/([A-Z])/g, " $1")
      .replace(/-/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
      .replace(/ (.)/g, (m, c) => " " + c.toLowerCase());

    // Special handling for --font
    let inputHTML;
    if (key === "--font") {
      const { primary, fallback } = parseFontVar(val);
      inputHTML = `
              <select style="width: 40%; padding: 0.55rem 0;" class="font-select" title="Primary font"></select>
              <select style="width: 40%; padding: 0.55rem 0;" class="fallback-select" title="Fallback" >
                <option value="sans-serif">sans-serif</option>
                <option value="serif">serif</option>
                <option value="monospace">monospace</option>
                <option value="system-ui">system-ui</option>
              </select>
            `;
    } else {
      // Build default inputs
      inputHTML = `<input type="${type}" value="${val}" spellcheck="false" class="var-input" id="${type}"/>`;
      if (type === "color") {
        const hslaMatch = val.match(
          /^hsla?\([^,]+,\s*([^,]+),\s*([^,]+),\s*([\d.]+)\)/i,
        );
        if (hslaMatch) alpha = parseFloat(hslaMatch[3]);
        inputHTML += `<input type="range" min="0" max="1" step="0.01" value="${alpha}" class="slider" title="Alpha">`;
      }
    }

    tr.innerHTML = `<td class="var-name">${name}</td><td class="var-value">${inputHTML}</td>`;

    // If this is the font row, wire up dynamic population and events
    if (key === "--font") {
      const fontSelect = tr.querySelector(".font-select");
      const fallbackSelect = tr.querySelector(".fallback-select");

      // set fallback initial
      fallbackSelect.value = parseFontVar(val).fallback || "sans-serif";

      // populate fonts from main process
      (async () => {
        let fonts = [];
        try {
          fonts = (await ipcRenderer.invoke("get-system-fonts")) || [];
        } catch (e) {
          console.error("Could not get system fonts", e);
        }

        // clean quotes; ensure unique
        const cleaned = Array.from(
          new Set(fonts.map((f) => f.replace(/^"(.+)"$/, "$1"))),
        );
        // Insert a packaged Rubik option first (if you ship Rubik with app assets)
        const rubikPackagedOpt = document.createElement("option");
        rubikPackagedOpt.value = "Rubik";
        rubikPackagedOpt.textContent = "Rubik";
        fontSelect.appendChild(rubikPackagedOpt);

        // then the rest
        cleaned.forEach((f) => {
          if (f !== "Rubik") {
            // removes Rubik from the list, its already in there
            const opt = document.createElement("option");
            opt.value = f;
            opt.textContent = f;
            fontSelect.appendChild(opt);
          }
        });

        // try to pre-select current primary
        const currentPrimary = parseFontVar(val).primary;
        if (currentPrimary) {
          const found = Array.from(fontSelect.options).find(
            (o) => o.value.toLowerCase() === currentPrimary.toLowerCase(),
          );
          if (found) fontSelect.value = found.value;
          else {
            // fallback: create an option for the currentPrimary (in case it's a custom string)
            const customOpt = document.createElement("option");
            customOpt.value = currentPrimary;
            customOpt.textContent = currentPrimary;
            fontSelect.insertBefore(customOpt, fontSelect.firstChild);
            fontSelect.value = currentPrimary;
          }
        }
      })();

      // selection change handlers
      const commitFontChange = () => {
        let primary = fontSelect.value;
        const fallback = fallbackSelect.value || "sans-serif";
        const final = `${quoteIfNeeded(primary)}, ${fallback}`;
        themes.get(selected).set(key, final);
        applyTheme();
        applyThemeToBtn();
        updateCSS();
        // update preview
        preview.style.fontFamily = final;
      };

      fontSelect.addEventListener("change", commitFontChange);
      fallbackSelect.addEventListener("change", commitFontChange);

      // If packaged Rubik is selected and you ship a file at app://assets/fonts/Rubik-*.woff2,
      // inject a simple @font-face pointing at that URL so the preview and UI can use it.
      // (We try to keep injected style tags idempotent.)
      function injectFontFace(familyName, url) {
        const id = `injected-font-${familyName.replace(/\s+/g, "-").toLowerCase()}`;
        if (document.getElementById(id)) return;
        const style = document.createElement("style");
        style.id = id;
        style.textContent = `
          @font-face {
            font-family: '${familyName}';
            src: url('${url}') format('woff2');
            font-weight: 400;
            font-style: normal;
            font-display: swap;
          }
        `;
        document.head.appendChild(style);
      }

      // If the preselected choice is packaged Rubik, inject its @font-face (assumes you ship it under app://assets/fonts/)
      // e.g. app://assets/fonts/Rubik-Regular.woff2 (you can tweak filename)
      (function maybeInjectPackagedRubik() {
        // assume you ship woff2 at this path; change if different
        const packagedUrl = "app://assets/fonts/Rubik-Regular.woff2";
        // we only inject if current primary is 'Rubik' or user selected packaged option
        if (
          parseFontVar(val).primary &&
          parseFontVar(val).primary.toLowerCase() === "rubik"
        ) {
          injectFontFace("Rubik", packagedUrl);
        }
      })();
    } // end font special-case

    // Generic text/number handler (original behavior)
    const colorInput = tr.querySelector("input[type=color]");
    const genericInput = tr.querySelector(".var-input");
    const alphaSlider = tr.querySelector(".slider");
    const alphaLabel = tr.querySelector(".alpha-label");

    if (genericInput && type !== "color") {
      genericInput.addEventListener("input", () => {
        themes.get(selected).set(key, genericInput.value);
        applyTheme();
        applyThemeToBtn();
        updateCSS();
      });
    }

    if (colorInput) {
      const updateTheme = () => {
        const hex = colorInput.value;
        const a = alphaSlider ? parseFloat(alphaSlider.value) : 1;
        const newVal = a < 1 ? hexToRgba(hex, a) : hex;
        playSoundAffect("click", (volume = 0.35));
        themes.get(selected).set(key, newVal);
        if (alphaLabel) alphaLabel.textContent = a.toFixed(2);
        applyTheme();
        applyThemeToBtn();
        updateCSS();
      };

      colorInput.addEventListener("input", updateTheme);
      if (alphaSlider) alphaSlider.addEventListener("input", updateTheme);
    }

    body.appendChild(tr);
  } // end for

  // --- helpers (existing ones kept) ---
  function isColor(str) {
    return /^#/.test(str) || /^rgb/i.test(str) || /^hsl/i.test(str);
  }
  function toHex(colorStr) {
    if (!colorStr) return null;
    if (colorStr.startsWith("#")) {
      if (colorStr.length === 9) {
        const hex = colorStr.slice(0, 7);
        const alpha = parseInt(colorStr.slice(7, 9), 16) / 255;
        return [hex, alpha];
      } else if (colorStr.length === 5) {
        const hex =
          "#" +
          colorStr[1] +
          colorStr[1] +
          colorStr[2] +
          colorStr[2] +
          colorStr[3] +
          colorStr[3];
        const alpha = parseInt(colorStr[4] + colorStr[4], 16) / 255;
        return [hex, alpha];
      } else {
        return [colorStr, 1];
      }
    } else if (colorStr.startsWith("rgb")) {
      return rgbToHex(colorStr);
    } else {
      try {
        const ctx = document.createElement("canvas").getContext("2d");
        ctx.fillStyle = colorStr;
        return rgbToHex(ctx.fillStyle);
      } catch (e) {
        return null;
      }
    }
  }
  function rgbToHex(rgbStr) {
    const m = rgbStr.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/i);
    if (!m) return [null, null];
    const r = parseInt(m[1], 10).toString(16).padStart(2, "0");
    const g = parseInt(m[2], 10).toString(16).padStart(2, "0");
    const b = parseInt(m[3], 10).toString(16).padStart(2, "0");
    const hex = `#${r}${g}${b}`;
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
    return [hex, alpha];
  }
  function hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  sController.updateSliders();
}

function refreshButtons() {
  $("#deleteThemeBtn").disabled = selected === "root";
}

function normalizeVarName(v) {
  v = String(v).trim();
  if (!v) return "";
  if (!v.startsWith("--")) v = "--" + v.replace(/^[-]+/, "");
  return v.replace(/[^\w-]/g, "-");
}

function updateCSS() {
  const css = serializeThemesCSS();
  setStatus("Edited (not saved)");
}

// ---------- Loading / Saving ----------
async function loadFromURL(url = CSS_URL) {
  setStatus(`Fetching ${url}…`);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    parseThemesCSS(text);

    // Do not force selected here; settings will set the selected theme.
    renderThemesList();
    renderVarsTable();
    refreshButtons();
    setStatus("Loaded themes");
  } catch (err) {
    console.error(err);
    setStatus("Fetch failed.");
  }
}

function downloadCSS() {
  const blob = new Blob([serializeThemesCSS()], {
    type: "text/css",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "themes.css";
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
  setStatus("Exported CSS downloaded");
}

async function saveToDisk() {
  const css = serializeThemesCSS();
  try {
    // Save to CSS_URL using Electron's IPC if available
    if (ipcRenderer && ipcRenderer.invoke) {
      if (
        await ipcRenderer.invoke(
          "save-file",
          path.join(__dirname, CSS_URL),
          css,
        )
      ) {
        setStatus("Saved to program");
        settings.theme[settings.themeMode] = selected; // puts the selected theme as the theme for the whole app
        ipcRenderer.invoke("save-settings", settings);
      } else {
        setStatus("Saved to downloads");
        downloadCSS();
      }
    } else {
      setStatus("Saved to downloads");
      downloadCSS();
    }
  } catch (e) {
    console.error(e);
    setStatus("Save failed");
  }
}

function setThememode(mode) {
  playSoundAffect("jobPurchase", (volume = 0.8));
  $(`#${settings.themeMode}Btn`).classList.remove("active");
  $(`#${mode}Btn`).classList.add("active");
  settings.themeMode = mode;
  selected = settings.theme[mode];
  applyTheme();
  renderThemesList();
  renderVarsTable();
  refreshButtons();
  setStatus(`Theme mode set to ${mode}`);
}

function setSystemTheme() {
  playSoundAffect("jobPurchase", (volume = 1));
  settings.getSystemTheme = !settings.getSystemTheme;
  if (settings.getSystemTheme) {
    $("#systemThemeBtn").classList.add("active");
  } else {
    $("#systemThemeBtn").classList.remove("active");
  }
}

// ---------- Theme operations ----------
function deleteSelectedTheme() {
  if (selected === "root") return;
  const ok = confirm(`Delete theme "${selected}"? This cannot be undone.`);
  if (!ok) return;
  themes.delete(selected);
  selected = "root";
  updateCSS();
  renderThemesList();
  renderVarsTable();
  refreshButtons();
  applyTheme();
  setStatus("Theme deleted");
}

async function addTheme() {
  await promptUser("Add new theme", "Theme name", "custom-theme", "addTheme");
}

async function addCustomCssTheme() {
  await promptUser(
    "Add Custom CSS Theme",
    "CSS Here",
    "css",
    "addCustomCssTheme",
  );
}

async function promptUser(TitleTXT, LabelTXT, placeholderTXT, handleCase) {
  return new Promise(async (resolve) => {
    let confirmOverwrite = false;
    // Helper to clean up DOM and listeners
    const cleanup = () => {
      document.removeEventListener("keydown", onKeyDown);
      if (overlay && overlay.parentNode)
        overlay.parentNode.removeChild(overlay);
    };

    // Keyboard handlers (Esc = cancel, Ctrl/Meta+Enter = submit)
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
        resolve(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        createHandler();
      }
    };

    // Create overlay
    const overlay = document.createElement("div");
    overlay.classList.add("overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    // Create modal
    const modal = document.createElement("div");
    modal.classList.add("modal");

    // Title
    const title = document.createElement("h3");
    title.textContent = TitleTXT;
    title.classList.add("modal-title");
    modal.appendChild(title);

    // Name label + input
    const nameLabel = document.createElement("label");
    nameLabel.textContent = LabelTXT;
    nameLabel.classList.add("modal-label");
    modal.appendChild(nameLabel);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = placeholderTXT;
    nameInput.value = "";
    nameInput.classList.add("modal-input");
    modal.appendChild(nameInput);

    // Actions container
    const actions = document.createElement("div");
    actions.classList.add("modal-actions");
    modal.appendChild(actions);

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.classList.add("modal-cancel-btn");
    actions.appendChild(cancelBtn);

    const createBtn = document.createElement("button");
    createBtn.textContent = "Create";
    createBtn.classList.add("modal-create-btn");
    actions.appendChild(createBtn);

    // Append and focus
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    nameInput.focus();
    document.addEventListener("keydown", onKeyDown);

    // Handler: clean create button and confirm overwrite flow
    async function createHandler() {
      const themesList = document.getElementById("themesList");
      switch (handleCase) {
        case 0:
        case "addCustomCssTheme":
          themesList.scrollTo(0, themesList.scrollHeight);
          parseThemesCSS(nameInput.value);
          updateCSS();
          renderThemesList();
          renderVarsTable();
          refreshButtons();
          setStatus(`Custom themes created`);
          break;
        case 1:
        case "addTheme":
          if (nameInput.value === "") nameInput.value = placeholderTXT; // fallback
          const name = sanitizeName(nameInput.value);
          themes.set(name, themes.get(selected));
          selected = name;
          updateCSS();
          renderThemesList();
          renderVarsTable();
          refreshButtons();
          themesList.scrollTo(0, themesList.scrollHeight);
          setStatus(`Theme added`);
          applyTheme();
          break;
      }

      cleanup();
      resolve(name);
    }

    // Wire up buttons
    cancelBtn.addEventListener("click", () => {
      cleanup();
      resolve(null);
    });
    createBtn.addEventListener("click", createHandler);

    // allow clicking overlay background to cancel
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
  });
}

// Apply the currently-selected theme
async function applyTheme() {
  // Ensure we’re working with an array of entries
  let theme = Array.from(themes.get(selected));

  for (let i = theme.length - 1; i >= 0; i--) {
    try {
      let [key, value] = theme[i];

      // Skip invalid keys
      if (!key || !key.startsWith("--")) continue;

      // Only set property if it ins't invalid
      if (value !== undefined)
        document.documentElement.style.setProperty(key, value);
    } catch (err) {
      console.error("Error applying theme var:", theme[i], err);
    }
  }
  console.log("Applied theme");
}

// ---------- Settings loader (Electron) ----------
let settings = {
  theme: { dark: "", light: "" },
  volume: 1,
  themeMode: "dark",
  getSystemTheme: true,
  showNotifications: true,
};
async function loadSettings() {
  try {
    if (ipcRenderer && ipcRenderer.invoke) {
      const lastPlayedInfo = (await ipcRenderer.invoke("get-settings")) || {};
      for (const key in settings) {
        if (
          lastPlayedInfo &&
          Object.prototype.hasOwnProperty.call(lastPlayedInfo, key)
        ) {
          settings[key] = lastPlayedInfo[key];
        }
      }
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }

  // default to root if empty or invalid
  if (!settings.theme || settings.theme === "") {
    settings.theme = { dark: "", light: "light" };
  } else if (typeof settings.theme === "string") {
    settings.theme = { dark: settings.theme, light: "light" };
  }
  if (!themes.has(settings.theme[settings.themeMode])) {
    // If the saved theme doesn't exist yet, fall back to root but keep user preference for later
    selected = "root";
  } else {
    selected = settings.theme[settings.themeMode];
  }

  if (settings.themeMode === "dark") {
    $(`#darkBtn`).classList.add("active");
  } else {
    $(`#lightBtn`).classList.add("active");
  }

  if (settings.getSystemTheme) {
    $("#systemThemeBtn").classList.add("active");
  } else {
    $("#systemThemeBtn").classList.remove("active");
  }

  renderThemesList();
  renderVarsTable();
  refreshButtons();

  applyTheme();
}

// ---------- Wire up ----------
$("#saveBtn").addEventListener("click", saveToDisk);
$("#downloadBtn").addEventListener("click", downloadCSS);

$("#addThemeBtn").addEventListener("click", addTheme);
$("#addCustomCssThemeBtn").addEventListener("click", addCustomCssTheme);
$("#deleteThemeBtn").addEventListener("click", deleteSelectedTheme);

// Make load sequence deterministic: wait for CSS fetch/parsing, then load settings, then apply theme.
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadFromURL();
  } catch (e) {
    console.warn("loadFromURL error", e);
  }
  // now load saved settings and apply theme (robust)
  try {
    await loadSettings();
  } catch (e) {
    console.warn("loadSettings error", e);
  }
});
