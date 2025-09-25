const { ipcRenderer, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const changeContainer = document.getElementById("change-container");
const settingsContainer = document.getElementById("settings");
const libraryPathsContainer = document.getElementById(
  "library-paths-container",
);
const shortcutsContainer = document.getElementById("shortcuts");
const addLibraryBtn = document.getElementById("addLibraryBtn");
const containers = document.querySelectorAll(".container");
const changeLogsSidebar = document.querySelector(".change-logs-container");

let settings = {
  volume: 0.5,
  showFeatures: true,
  controller: {
    cursorSensitifity: 20,
    keepMouseBetweenBounds: true,
    scrollSensitifity: 20,
    invertScroll: false,
    cursorAceleration: 1.2,
  },
};

let themeSettings = {
  themeMode: "dark",
  theme: {
    dark: "",
    light: "light",
  },
};

const inputsFilePath = path.join(__dirname, "../js/input/settingsImp.json");

let changeLogs = {};

async function loadSettings(onlyNewchanges = false) {
  try {
    let updatedSettings = (await ipcRenderer.invoke("get-settings")) || {};
    if (!updatedSettings) return;

    for (const key in settings) {
      // saver load then just putting
      if (updatedSettings.hasOwnProperty(key) && !onlyNewchanges) {
        settings[key] = updatedSettings[key];
      } else if (updatedSettings.new.hasOwnProperty(key) && onlyNewchanges) {
        console.log(key, updatedSettings.new[key]);
        settings[key] = updatedSettings.new[key];
      }
    }
    for (const key in themeSettings) {
      if (updatedSettings.hasOwnProperty(key)) {
        themeSettings[key] = updatedSettings[key];
      }
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
  console.log("Settings loaded");

  setLook();
}

function setLook() {
  let userLookCSS = document.getElementById("user-look");
  if (!userLookCSS) {
    userLookCSS = document.createElement("link");
    userLookCSS.id = "user-look";
    userLookCSS.rel = "stylesheet";
    document.head.appendChild(userLookCSS);
  }

  userLookCSS.href = `../css/look.css?ts=${Date.now()}`;

  let themeCSS = document.getElementById("themes-stylesheet");
  // Force reload by appending timestamp query
  themeCSS.href = `../css/themes.css?ts=${Date.now()}`;

  document.body.setAttribute(
    "theme",
    themeSettings.theme[themeSettings.themeMode],
  );
}

async function saveSettings() {
  await ipcRenderer.invoke("save-settings", settings);
}

function updateSettings() {
  setLook();
}

// Event listeners
window.addEventListener("beforeunload", async (e) => {
  await loadSettings(true);
  await saveSettings();
});

// this saves correctly on exit.
ipcRenderer.on("settings-updated", async (event, updatedSettings) => {
  await loadSettings(true);
  updateSettings();

  let link = document.getElementById("themes-stylesheet");
  // Force reload by appending timestamp query
  link.href = `../css/themes.css?ts=${Date.now()}`;
});

// helpers: get / set by path (path is an array of keys)
function getAtPath(obj, path) {
  return path.reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}
function setAtPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (!(k in cur) || typeof cur[k] !== "object" || cur[k] === null) {
      cur[k] = {};
    }
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
}

function renderSettingsEditor() {
  settingsContainer.innerHTML = ""; // Clear old UI

  // --- Create top buttons ---
  const topButtonsWrapper = document.createElement("div");
  topButtonsWrapper.classList.add("top-buttons");

  const keys = Object.keys(settings);

  // Create a "general" button for all non-object top-level settings
  const hasGeneral = keys.some(
    (k) => !(settings[k] && typeof settings[k] === "object"),
  );
  if (hasGeneral) {
    const btn = document.createElement("button");
    btn.textContent = "general";
    btn.classList.add("section-btn");
    btn.addEventListener("click", () => showSection("general"));
    topButtonsWrapper.appendChild(btn);
  }

  // Buttons for object sections (like controller)
  keys.forEach((k) => {
    if (settings[k] && typeof settings[k] === "object") {
      const btn = document.createElement("button");
      btn.textContent = k;
      btn.classList.add("section-btn");
      btn.addEventListener("click", () => showSection(k));
      topButtonsWrapper.appendChild(btn);
    }
  });

  settingsContainer.appendChild(topButtonsWrapper);

  // --- Wrapper for actual settings ---
  const sectionsWrapper = document.createElement("div");
  sectionsWrapper.classList.add("sections-wrapper");
  settingsContainer.appendChild(sectionsWrapper);

  // General (non-object) section
  const generalDiv = document.createElement("div");
  generalDiv.classList.add("section");
  generalDiv.dataset.section = "general";
  keys.forEach((k) => {
    if (!(settings[k] && typeof settings[k] === "object")) {
      generalDiv.appendChild(createInput([k]));
    }
  });
  sectionsWrapper.appendChild(generalDiv);

  // Object sections
  keys.forEach((sectionKey) => {
    const section = settings[sectionKey];
    if (section && typeof section === "object") {
      const sectionDiv = document.createElement("div");
      sectionDiv.classList.add("section");
      sectionDiv.dataset.section = sectionKey;
      for (const key in section) {
        sectionDiv.appendChild(createInput([sectionKey, key]));
        console.log(key);
      }
      sectionsWrapper.appendChild(sectionDiv);
    }
  });

  // Show settings (general) by default
  showSection("general");

  // --- Save button ---
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save Settings";
  saveBtn.classList.add("save-btn");
  saveBtn.addEventListener("click", () => {
    saveSettings();
  });
  settingsContainer.appendChild(saveBtn);
}

function createInput(path) {
  const key = path[path.length - 1];
  const value = getAtPath(settings, path);
  const input = document.createElement("input");

  if (typeof value === "boolean") {
    input.type = "checkbox";
    input.checked = value;
    input.classList.add("checkbox-input");
    input.addEventListener("change", (e) => {
      setAtPath(settings, path, e.target.checked);
    });
  } else if (typeof value === "number" || !isNaN(parseFloat(value))) {
    if (key === "volume") {
      input.type = "range";
      input.step = "0.01";
      input.min = 0;
      input.max = 1;
      input.classList.add("slider");
    } else {
      input.type = "number";
      input.step = "0.1";
      input.min = 0;
    }

    input.value = value;

    input.addEventListener("input", (e) => {
      const parsed = parseFloat(e.target.value);
      if (!isNaN(parsed)) {
        setAtPath(settings, path, parsed);
      }
    });
  } else {
    input.type = "text";
    input.value = value === undefined ? "" : value;
    input.classList.add("text-input");
    input.addEventListener("input", (e) => {
      setAtPath(settings, path, e.target.value);
    });
  }

  const label = document.createElement("label");
  const name = key
    .replace(/([A-Z])/g, " $1")
    .replace(/-/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ (.)/g, (m, c) => " " + c.toLowerCase());

  label.textContent = name + " ";
  label.appendChild(input);

  const wrapper = document.createElement("div");
  wrapper.classList.add("input-wrapper");
  wrapper.appendChild(label);

  return wrapper;
}

// Show only the clicked section
function showSection(sectionKey) {
  const btns = document
    .querySelector(".top-buttons")
    .querySelectorAll("button");
  document.querySelectorAll(".section").forEach((sectionDiv) => {
    if (sectionDiv.dataset.section === sectionKey) {
      sectionDiv.style.display = "block";
      for (let i = 0; i < btns.length; ++i) {
        if (btns[i].textContent === sectionKey) {
          btns[i].classList.add("active");
        } else {
          btns[i].classList.remove("active");
        }
      }
    } else {
      sectionDiv.style.display = "none";
    }
  });
}

loadSettings();
updateChangeContainer();
document.addEventListener("DOMContentLoaded", async () => {
  renderSettingsEditor();
  sController.updateSliders();

  changeLogs = (await ipcRenderer.invoke("get-change-logs")) || {};
  let version = "";

  // Get all version keys, sort descending (latest first)
  const versions = Object.keys(changeLogs).sort((a, b) => {
    // Split into numbers and compare
    const parse = (v) => v.split(".").map(Number);
    const [a1, a2, a3] = parse(a);
    const [b1, b2, b3] = parse(b);

    if (a1 !== b1) return b1 - a1;
    if (a2 !== b2) return b2 - a2;
    return b3 - a3;
  });

  for (const key of versions) {
    if (changeLogs[key].done) {
      const changeLogDiv = document.createElement("div");
      changeLogDiv.classList.add("change-logs-item");
      changeLogDiv.id = `change-logs-item-${key}`;
      changeLogDiv.textContent = key;
      changeLogDiv.onclick = () => {
        changeChangeLog(key);
      };
      changeLogsSidebar.appendChild(changeLogDiv);

      // set version only the first time (latest one)
      if (version === "") {
        version = key;
      }
    }
  }

  document.getElementById("version").textContent = version;
  changeChangeLog(version);
});

function showChangeLog() {
  const overlay = document.querySelector(".overlay");
  const isVisible = overlay.getAttribute("isVisible");
  if (isVisible) {
    overlay.style.display = "flex";
    const cleanup = () => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.setAttribute("isVisible", isVisible);
      overlay.style.display = "none";
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
      }
    };

    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) {
        cleanup();
      }
    });

    document.addEventListener("keydown", onKeyDown);
  } else {
    overlay.style.display = "none";
  }
  overlay.setAttribute("isVisible", !isVisible);
}

document.getElementById("version").addEventListener("click", () => {
  showChangeLog();
});

function changeChangeLog(key) {
  const sidebarItem = document.getElementById(`change-logs-item-${key}`);
  console.log("Clicked item:", sidebarItem);

  // remove active from all
  document.querySelectorAll(".change-logs-item").forEach((item) => {
    item.classList.remove("active");
  });

  if (sidebarItem) {
    sidebarItem.classList.add("active");

    // now update the main log area
    const changeLogContainer = document.querySelector(".change-log");
    const changeLogTitle = document.querySelector(".change-log-title");
    const changeLogDate = document.querySelector(".change-log-date");
    const changeLogContent = document.querySelector(".change-log-content");

    if (changeLogTitle)
      changeLogTitle.textContent = changeLogs[key].name || key;
    if (changeLogDate) changeLogDate.textContent = changeLogs[key].date || "";
    if (changeLogContent) {
      changeLogContent.innerHTML = "";
      const logs = changeLogs[key].logs.split("-");
      logs.forEach((log) => {
        let text = log.trim();
        if (!text) return; // skip empty entries

        // capitalize first letter
        text = text.charAt(0).toUpperCase() + text.slice(1);

        const logElement = document.createElement("div");
        logElement.textContent = text;
        changeLogContent.appendChild(logElement);
        spacer = document.createElement("div");
        spacer.className = "spacer";
        changeLogContent.appendChild(spacer);
      });
    }

    console.log("Updated main log:", { key, data: changeLogs[key] });
  }
}

function updateChangeContainer() {
  changeContainer.innerHTML = "";
  let firstContainer = [null, null];
  for (let i = 0; i < containers.length; ++i) {
    const container = containers[i];
    const name = container.id.replace(/-/g, " ");
    const button = document.createElement("button");
    button.textContent = name
      .replace(/([A-Z])/g, " $1")
      .replace(/-/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
      .replace(/ (.)/g, (m, c) => " " + c.toLowerCase());
    button.classList.add("container-change-btn");
    button.addEventListener("click", () => {
      openContainer(container, button);
    });

    if (i === 0) {
      firstContainer = [container, button];
    }

    changeContainer.appendChild(button);
  }

  openContainer(firstContainer[0], firstContainer[1]);
}

function openContainer(containerElement, button) {
  const btns = changeContainer.querySelectorAll("button");

  for (let i = 0; i < containers.length; ++i) {
    containers[i].style.display = "none";
    btns[i].classList.remove("active");
  }
  containerElement.style.display = "flex";
  button.classList.add("active");
}

async function renderLibraryPaths() {
  // Clear container
  libraryPathsContainer.innerHTML = "";

  const paths = await ipcRenderer.invoke("get-library-paths");

  if (!paths || paths.length === 0) {
    libraryPathsContainer.innerHTML =
      "<div class='empty'>No library folders added yet.</div>";
    return;
  }

  paths.forEach((path, index) => {
    const pathDiv = document.createElement("div");
    pathDiv.classList.add("library-path");

    const pathLabel = document.createElement("span");
    pathLabel.textContent = path;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✖";
    removeBtn.classList.add("remove-btn");
    removeBtn.onclick = async () => {
      const newPaths = paths.filter((_, i) => i !== index);
      await ipcRenderer.invoke("save-library-paths", newPaths);
      renderLibraryPaths();
    };

    pathDiv.appendChild(pathLabel);
    pathDiv.appendChild(removeBtn);
    libraryPathsContainer.appendChild(pathDiv);
  });
}

addLibraryBtn.addEventListener("click", async () => {
  const { canceled, filePaths } = await ipcRenderer.invoke("show-open-dialog", {
    properties: ["openDirectory"],
  });

  if (!canceled && filePaths.length > 0) {
    let paths = await ipcRenderer.invoke("get-library-paths");
    paths = paths || [];
    if (!paths.includes(filePaths[0])) {
      paths.push(filePaths[0]);
      await ipcRenderer.invoke("save-library-paths", paths);
      renderLibraryPaths();
    }
  }
});

// Initial load
renderLibraryPaths();
renderShortcuts();

async function renderShortcuts() {
  // Clear container
  shortcutsContainer.innerHTML = "";

  const topButtons = document.createElement("div");
  topButtons.classList.add("top-buttons");

  const seeShortcutsFiles = document.createElement("button");
  seeShortcutsFiles.textContent = "See Shortcuts Files";
  seeShortcutsFiles.classList.add("section-btn");
  seeShortcutsFiles.addEventListener("click", () => {
    ipcRenderer.invoke("open-shortcuts-dir");
  });
  topButtons.appendChild(seeShortcutsFiles);

  shortcutsContainer.appendChild(topButtons);

  let shortcuts = await ipcRenderer.invoke("get-all-shortcuts");

  if (!shortcuts || shortcuts.length === 0) {
    shortcutsContainer.innerHTML =
      "<div class='empty'>No shortcuts added yet.</div>";
    return;
  }

  const currShortcut = await ipcRenderer.invoke("get-current-shortcut");
  shortcuts = [...new Set(shortcuts)];
  console.log(shortcuts);
  shortcuts.forEach((shortcut, index) => {
    const shortcutDiv = document.createElement("div");
    shortcutDiv.classList.add("shortcut-div");

    shortcutDiv.textContent = shortcut.split("/").pop().split(".json")[0];

    shortcutDiv.addEventListener("click", () => {
      ipcRenderer.send("set-current-shortcut", shortcut.split("/").pop());

      const shortcuts = document.querySelectorAll(".shortcut-div");
      for (let i = 0; i < shortcuts.length; ++i) {
        shortcuts[i].classList.remove("active");
      }
      shortcutDiv.classList.add("active");
    });

    if (currShortcut === shortcut) {
      shortcutDiv.classList.add("active");
    }

    shortcutsContainer.appendChild(shortcutDiv);
  });
}
