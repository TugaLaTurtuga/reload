const { ipcRenderer, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const container = document.getElementById("settingsContainer");

let settings = {
  volume: 0.5,
  showFeatures: true,
  showNotifications: true,
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

  //volumeSlider.value = settings.volume;
  updateTheme();
}

function updateTheme() {
  document.body.setAttribute(
    "theme",
    themeSettings.theme[themeSettings.themeMode],
  );
}

async function saveSettings() {
  await ipcRenderer.invoke("save-settings", settings);
}

function updateSettings() {
  updateTheme();
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

function renderSettingsEditor() {
  container.innerHTML = ""; // Clear old inputs

  for (const key in settings) {
    const value = settings[key];
    let input = document.createElement("input");

    if (typeof value === "boolean") {
      // Checkbox for boolean
      input.type = "checkbox";
      input.checked = value;
      input.classList.add("checkbox-input");
      input.addEventListener("change", (e) => {
        settings[key] = e.target.checked;
      });
    } else if (typeof value === "number" || !isNaN(parseFloat(value))) {
      // Number input
      input.type = "range";
      input.step = ".01";
      input.min = 0;
      input.max = 1;
      input.value = parseFloat(value);
      input.classList.add("slider");
      input.addEventListener("input", (e) => {
        settings[key] = parseFloat(e.target.value) || settings[key];
      });
    } else {
      // String input
      input.type = "text";
      input.value = value;
      input.classList.add("text-input");
      input.addEventListener("input", (e) => {
        settings[key] = e.target.value;
      });
    }

    // Label + input wrapper
    const label = document.createElement("label");
    const name = key
      .replace(/([A-Z])/g, " $1")
      .replace(/-/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
      .replace(/ (.)/g, (m, c) => " " + c.toLowerCase());
    label.textContent = name;
    label.appendChild(input);

    const wrapper = document.createElement("div");
    wrapper.classList.add("input-wrapper");
    wrapper.appendChild(label);

    container.appendChild(wrapper);
  }

  // Add Save button
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save Settings";
  saveBtn.addEventListener("click", async () => {
    saveSettings();
  });

  container.appendChild(saveBtn);
}

loadSettings();
document.addEventListener("DOMContentLoaded", async () => {
  renderSettingsEditor();
  sController.updateSliders();

  changeLogs = (await ipcRenderer.invoke("get-change-logs")) || {};
  let version = "0.0.000";
  for (const key in changeLogs) {
    version = key; // the key is the version number ex: 0.0.001
    //// TODO: make a changeLog div and add the values of the keys.
  }
  document.getElementById("version").textContent = version;

  //// TODO: get-library-paths, allow the user to select a path to save the library to.
  // and save it with save-library-paths thru ipcRenderer.invoke.
});

async function openExternalHtml(relativePathFromHtml) {
  await saveSettings();
  ipcRenderer.invoke(
    "open-external",
    path.join(__dirname, relativePathFromHtml),
  );
}
