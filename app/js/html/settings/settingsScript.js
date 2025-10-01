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
    keepMouseBetweenBounds: true,
    invertScroll: false,
    cursorSensitifity: 20,
    scrollSensitifity: 20,
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
  const shortcutsFilePathBtn = document.getElementById(
    "shortcuts-file-path-btn",
  );
  shortcutsFilePathBtn.addEventListener("click", () => {
    ipcRenderer.invoke("open-shortcuts-dir");
  });

  let shortcuts = await ipcRenderer.invoke("get-all-shortcuts");

  if (!shortcuts || shortcuts.length === 0) {
    shortcutsContainer.innerHTML =
      "<div class='empty'>No shortcuts added yet.</div>";
    return;
  }

  const shortcutsDiv = document.querySelector(".shortcuts-div");
  shortcutsDiv.innerHTML = "";

  const shortcutsEdits = document.getElementById("shortcuts-edits");

  const currShortcut = await ipcRenderer.invoke("get-current-shortcut");
  let hasActiveShortcut = false;
  shortcuts = [...new Set(shortcuts)];
  shortcuts.forEach((shortcut, index) => {
    const shortcutDiv = document.createElement("div");
    shortcutDiv.classList.add("shortcut-div");

    const input = document.createElement("input");
    input.type = "text";
    input.value = shortcut.split("/").pop().split(".json")[0];
    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        const currShortcutOnInput = await ipcRenderer.invoke(
          "get-current-shortcut",
        );
        if (currShortcutOnInput === shortcut) {
          const newShortcutName = input.value.replace(".", " ");

          fs.readFile(shortcut, "utf8", async (err, data) => {
            if (err) {
              console.error(err);
              return;
            }

            try {
              const json = JSON.parse(data);
              await ipcRenderer.invoke("add-shortcut", newShortcutName, json);
              await ipcRenderer.invoke(
                "set-current-shortcut",
                `${newShortcutName}.json`,
              );
              await ipcRenderer.invoke(
                "remove-shortcut",
                shortcut.split("/").pop().split(".json")[0],
              );
              renderShortcuts();
              return;
            } catch (err) {
              console.error("Error parsing JSON or setting shortcut:", err);
            }
          });
        }
      } else if (e.key === "Escape" || e.key === "Tab") {
        input.value = shortcut.split("/").pop().split(".json")[0];
        input.blur();
      }
    });

    input.addEventListener("blur", () => {
      input.value = shortcut.split("/").pop().split(".json")[0];
    });

    shortcutDiv.appendChild(input);
    shortcutDiv.addEventListener("click", () => {
      ipcRenderer.invoke("set-current-shortcut", shortcut.split("/").pop());

      const shortcuts = document.querySelectorAll(".shortcut-div");
      for (let i = 0; i < shortcuts.length; ++i) {
        shortcuts[i].classList.remove("active");
      }
      shortcutDiv.classList.add("active");

      renderShortcutsInJson(shortcut, shortcutsEdits);
    });

    if (currShortcut === shortcut) {
      shortcutDiv.classList.add("active");
      hasActiveShortcut = true;
      renderShortcutsInJson(shortcut, shortcutsEdits);
    }

    shortcutsDiv.appendChild(shortcutDiv);
  });

  if (!hasActiveShortcut) {
    await ipcRenderer.invoke(
      "set-current-shortcut",
      shortcuts[0].split("/").pop(),
    );
    await renderShortcuts();
    return;
  }

  // add the plus sign at the end
  const plusDiv = document.createElement("div");
  plusDiv.classList.add("shortcut-div");
  plusDiv.style.minWidth = "35px";
  plusDiv.textContent = "+";
  plusDiv.style.padding = "10px";

  plusDiv.addEventListener("click", async () => {
    const allshortcuts = [];
    shortcuts.forEach((shortcut) => {
      allshortcuts.push(shortcut.split("/").pop().split(".json")[0]);
    });
    let newShortcutName = "new-shortcut";
    let i = 1;
    while (allshortcuts.includes(newShortcutName)) {
      newShortcutName = `new-shortcut-${i}`;
      i++;
    }
    await ipcRenderer.invoke("add-shortcut", newShortcutName);
    renderShortcuts();
  });
  shortcutsDiv.appendChild(plusDiv);

  shortcutsDiv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      shortcutsDiv.scrollLeft += e.deltaY + e.deltaX;
    },
    { passive: false },
  );

  shortcutsContainer.appendChild(shortcutsDiv);
  shortcutsContainer.appendChild(shortcutsEdits);
}

const funcsSaveFilePath = path.join(__dirname, "../../electron/data/func.json");

// read the functions from the file
let funcs = {};
try {
  const funcsRaw = fs.readFileSync(funcsSaveFilePath, "utf8");
  const parsedFuncs = JSON.parse(funcsRaw); // { functionName: "param1, param2" }

  // Sort the functions alphabetically by key
  const sortedKeys = Object.keys(parsedFuncs).sort();
  funcs = {};
  sortedKeys.forEach((key) => {
    funcs[key] = parsedFuncs[key];
  });
} catch (err) {
  console.error("Could not load funcsSaveFilePath:", err);
  funcs = {};
}

function renderShortcutsInJson(shortcutPath) {
  // use existing containers from HTML
  const shortcutsEdits = document.getElementById("shortcuts-edits");
  const jsonItemsContainer = shortcutsEdits.querySelector(
    ".shortcut-json-items-container",
  );
  const jsonEditDiv = shortcutsEdits.querySelector(
    ".shortcut-json-edit-container",
  );
  const jsonEditItemContainer = jsonEditDiv.querySelector(
    ".shortcut-json-edit-item-container",
  );
  const jsonEdit = jsonEditDiv.querySelector(".shortcut-json-edit");
  const addValueBtn = document.getElementById("add-value");
  const saveBtn = jsonEditDiv.querySelector("#save-shortcuts");
  const deleteBtn = jsonEditDiv.querySelector("#delete-shortcuts");

  // clear old content
  jsonItemsContainer.innerHTML = "";
  jsonEditItemContainer.innerHTML = "";
  jsonEdit.innerHTML = "";

  fs.readFile(shortcutPath, "utf8", async (err, data) => {
    if (err) {
      console.error(err);
      confirm("File not found.");
      const shortcuts = await ipcRenderer.invoke("get-all-shortcuts");
      await ipcRenderer.invoke(
        "set-current-shortcut",
        shortcuts[0].split("/").pop(),
      );
      await renderShortcuts();
      return;
    }
    const json = JSON.parse(data);

    saveBtn.onclick = () => {
      fs.writeFile(
        shortcutPath,
        JSON.stringify(json, null, 4),
        "utf8",
        (err) => {
          if (err) {
            console.error("Error saving shortcuts:", err);
            return;
          }
          console.log("Shortcuts saved successfully!");
          ipcRenderer.invoke("set-current-shortcut");
        },
      );
    };

    deleteBtn.onclick = async () => {
      if (
        confirm(
          `Are you sure you want to delete '${shortcutPath.split("/").pop().slice(0, -5)}'?`,
        )
      ) {
        await ipcRenderer.invoke(
          "remove-shortcut",
          shortcutPath.split("/").pop(),
        );
        await renderShortcuts();
      }
    };

    let currentKey, currentKey1, currentTableBody;

    // left column keys
    Object.entries(json).forEach(([key]) => {
      const itemDiv = document.createElement("div");
      itemDiv.classList.add("shortcut-json-item");
      itemDiv.textContent = key;
      jsonItemsContainer.appendChild(itemDiv);

      itemDiv.addEventListener("click", () => {
        document
          .querySelectorAll(".shortcut-json-item")
          .forEach((d) => d.classList.remove("active"));
        itemDiv.classList.add("active");
        jsonEditItemContainer.innerHTML = "";
        jsonEdit.innerHTML = "";

        Object.entries(json[key]).forEach(([key_1, value_1]) => {
          const subItem = document.createElement("div");
          subItem.classList.add("shortcut-json-edit-item");
          subItem.textContent = key_1;
          jsonEditItemContainer.appendChild(subItem);

          subItem.addEventListener("click", () => {
            document
              .querySelectorAll(".shortcut-json-edit-item")
              .forEach((d) => d.classList.remove("active"));
            subItem.classList.add("active");
            jsonEdit.innerHTML = "";

            currentKey = key;
            currentKey1 = key_1;

            if (
              Array.isArray(value_1) ||
              (value_1 !== null && typeof value_1 === "object")
            ) {
              // header
              const vars = document.createElement("div");
              vars.classList.add("shortcut-json-edit-vars");
              vars.innerHTML = `
                <div class="var-shortcut">Keybindings</div>
                <div class="var-action">Action</div>
                <div class="var-params">Params</div>
                <div class="var-delete">Del</div>
              `;

              // table
              const table = document.createElement("table");
              const tbody = document.createElement("tbody");
              table.appendChild(tbody);
              currentTableBody = tbody;

              const div = document.createElement("div");
              div.classList.add("shortcut-json-edit-table");
              div.appendChild(table);

              // rows
              fillRows(value_1, tbody);

              jsonEdit.appendChild(vars);
              jsonEdit.appendChild(div);
            } else {
              const input = document.createElement("input");
              let type = "text";
              if (typeof value_1 === "number") {
                type = "number";
                input.step = 0.1;
              } else if (typeof value_1 === "boolean") {
                type = "checkbox";
                input.checked = value_1;
              }
              input.type = type;
              input.value = json[currentKey][currentKey1];

              input.classList.add("shortcut-input-field");
              jsonEdit.appendChild(input);
              input.addEventListener("change", () => {
                if (type === "checkbox") {
                  json[currentKey][currentKey1] = input.checked;
                } else if (type === "number") {
                  json[currentKey][currentKey1] = parseFloat(input.value);
                } else {
                  json[currentKey][currentKey1] = input.value;
                }
              });
            }
          });
        });
      });
    });

    function fillRows(valueObj, tbody) {
      tbody.innerHTML = "";
      Object.entries(valueObj).forEach(([key_2, value_2]) => {
        addRow(tbody, key_2, value_2);
      });
    }

    function addRow(tbody, key_2, value_2) {
      const row = document.createElement("tr");
      const action = value_2.split("(")[0];
      const params = value_2.split("(")[1].split(")")[0];

      row.innerHTML = `
        <td class="var-shortcut"><input id="shortcut-input" type="text" value="${key_2}"></td>
        <td class="var-action"><input id="action-input" type="text" value="${action}"></td>
      `;

      const varParams = document.createElement("td");
      if (funcs[action] !== undefined && funcs[action] !== "") {
        const paramsInput = document.createElement("input");
        paramsInput.type = "text";
        paramsInput.value = params;
        varParams.appendChild(paramsInput);
      }

      const varDelete = document.createElement("td");
      varDelete.classList.add("var-delete-table", "var-delete");
      varDelete.innerHTML = `<button>X</button>`;
      varDelete.querySelector("button").addEventListener("click", () => {
        row.remove();
        delete json[currentKey][currentKey1][key_2];
      });

      row.appendChild(varParams);
      row.appendChild(varDelete);
      tbody.appendChild(row);

      const [shortcutInput, actionInput] = row.querySelectorAll("input");
      let paramsInput = varParams.querySelector("input");

      // initial color
      actionInput.style.color = funcs[action] === undefined ? "red" : "";

      // --- keybind recorder ---
      let recording = false;
      let pressed = new Set();
      let oldValue = "";

      function startRecording() {
        recording = true;
        pressed.clear();
        oldValue = shortcutInput.value;
        shortcutInput.value = "";
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("mousedown", onMouseDown);
        gamepadLoop(); // start polling gamepad
      }

      function stopRecording() {
        recording = false;
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("mousedown", onMouseDown);
        cancelAnimationFrame(gamepadRAF);
        if (document.activeElement === shortcutInput) {
          shortcutInput.blur();
        }
        if (shortcutInput.value === "") shortcutInput.value = oldValue; // reset
        updateJson();
      }

      function onKeyDown(e) {
        if (!recording) return;
        if (e.key !== "Shift") {
          if (e.key === " ") {
            pressed.add("Space");
          } else {
            pressed.add(e.key);
          }

          if (e.key === "Escape" || e.key === "Enter") {
            const element = document.getElementById("add-value");
            const oldText = element.textContent;
            element.textContent = "Press left click to stop recording";
            if (oldText !== element.textContent) {
              setTimeout(() => {
                element.textContent = oldText;
              }, 2000);
            }
          }

          shortcutInput.value = Array.from(pressed).join("+");
        }
      }

      function onMouseDown(e) {
        if (!recording) return;
        // Left click ends recording
        if (e.button === 0) {
          stopRecording();
          return;
        }
        pressed.add(e.button);
        shortcutInput.value = Array.from(pressed).join("+");
      }

      let gamepadRAF;
      function gamepadLoop() {
        if (!recording) return;
        const gamepads = navigator.getGamepads();
        if (gamepads) {
          for (const gp of gamepads) {
            if (!gp) continue;
            gp.buttons.forEach((btn, i) => {
              if (btn.pressed) {
                pressed.add(i);
              }
            });
          }
          shortcutInput.value = Array.from(pressed).join("+");
        }
        gamepadRAF = requestAnimationFrame(gamepadLoop);
      }

      shortcutInput.addEventListener("focus", startRecording);
      shortcutInput.addEventListener("blur", stopRecording);

      // --- end keybind recorder ---

      function updateJson() {
        const oldKey = key_2;
        const newKey = shortcutInput.value;
        const actionVal = actionInput.value.trim();
        renderShortcutsContextMenu(actionVal);

        if (funcs[actionVal] !== undefined) {
          actionInput.style.color = "";
          if (!paramsInput && funcs[actionVal] !== "") {
            paramsInput = document.createElement("input");
            paramsInput.type = "text";
            paramsInput.value = funcs[actionVal];
            paramsInput.addEventListener("input", updateJson);
            varParams.innerHTML = "";
            varParams.appendChild(paramsInput);
          }
        } else {
          actionInput.style.color = "red";
          varParams.innerHTML = "";
          paramsInput = null;
        }

        let newValue = `${actionVal}()`;
        if (paramsInput) {
          newValue = `${actionVal}(${paramsInput.value})`;
        }

        if (newKey !== oldKey) delete json[currentKey][currentKey1][oldKey];
        json[currentKey][currentKey1][newKey] = newValue;
        key_2 = newKey;
      }
      actionInput.addEventListener("input", updateJson);
      actionInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          selectShortcutsContextMenu(0);
        } else if (!isNaN(parseFloat(e.key))) {
          e.preventDefault();
          if (parseFloat(e.key) === 0) {
            selectShortcutsContextMenu(10);
          } else {
            selectShortcutsContextMenu(parseFloat(e.key) - 1);
          }
        } else if (e.key === "Escape") {
          actionInput.blur();
        }
      });

      if (paramsInput) paramsInput.addEventListener("input", updateJson);
    }

    // add value button
    addValueBtn.onclick = () => {
      if (!currentTableBody) return;

      // pick a random function from funcs
      const funcNames = Object.keys(funcs);
      if (funcNames.length === 0) {
        console.warn("No functions available in funcsSaveFilePath");
        return;
      }
      const randomFuncName =
        funcNames[Math.floor(Math.random() * funcNames.length)];

      // get its parameter string
      const paramString = funcs[randomFuncName]; // e.g. "a, b"
      // build full call
      const newValue = `${randomFuncName}(${paramString})`;

      // pick a unique shortcut key
      const count = Object.keys(json[currentKey][currentKey1]).length;
      const newKey = `shortcut_${count}`;

      // update JSON
      json[currentKey][currentKey1][newKey] = newValue;

      // add new row visually
      addRow(currentTableBody, newKey, newValue);
    };
  });
}

function selectShortcutsContextMenu(place) {
  const allPossibleFuncs = document.querySelectorAll(".context-menu-item");
  if (allPossibleFuncs.length === 0) {
    return;
  }
  if (allPossibleFuncs.length <= place) {
    place = allPossibleFuncs.length - 1;
  } else if (isNaN(place) || place === undefined || place < 0) {
    place = 0;
  }
  allPossibleFuncs[place].click();
}

function renderShortcutsContextMenu(action) {
  action = action.toLowerCase().trim();
  const contextMenu = document.getElementById(
    "shortcut-json-edit-context-menu",
  );
  const focusedElement = document.activeElement;

  // If not focused on the right input, hide the menu
  if (!focusedElement || focusedElement.id !== "action-input") {
    contextMenu.style.opacity = 0;
    contextMenu.style.pointerEvents = "none";
    return;
  }

  // Compute rect only once so it's in scope for mousemove
  let rect = focusedElement.getBoundingClientRect();

  // Position the menu
  function calculateContextMenuPosition() {
    try {
      const parent = document.querySelector(".shortcut-json-edit");
      const parentRect = parent.getBoundingClientRect();
      rect = focusedElement.getBoundingClientRect();
      if (
        parentRect.top > rect.top - rect.height / 3 ||
        parentRect.bottom < (rect.top + rect.bottom) / 2
      ) {
        contextMenu.style.opacity = 0;
        contextMenu.style.pointerEvents = "none";
        return false;
      }
      const computedStyle = getComputedStyle(contextMenu);
      const marginTop = parseFloat(computedStyle.marginTop) || 0;
      const marginBottom = parseFloat(computedStyle.marginBottom) || 0;
      const maxH =
        window.innerHeight - rect.top - rect.height - marginTop - marginBottom;
      contextMenu.style.top = `${rect.top + rect.height + window.scrollY}px`;
      contextMenu.style.left = `${rect.left + window.scrollX}px`;
      contextMenu.style.width = `${rect.width}px`;
      contextMenu.style.setProperty("max-height", `${maxH}px`, "important");
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  // Generate menu items
  let hasPutContextMenu = false;
  const ul = document.createElement("ul");
  Object.keys(funcs).forEach((funcName) => {
    if (funcName.toLowerCase().includes(action) && funcName !== action) {
      if (!hasPutContextMenu) {
        if (!calculateContextMenuPosition()) return;
        contextMenu.style.opacity = 1;
        contextMenu.style.pointerEvents = "all";
        hasPutContextMenu = true;
      }

      const li = document.createElement("li");
      li.textContent = funcName;
      li.classList.add("context-menu-item");
      li.addEventListener("click", () => {
        focusedElement.value = funcName;
        focusedElement.dispatchEvent(new Event("input", { bubbles: true }));
        contextMenu.style.opacity = 0;
        contextMenu.style.pointerEvents = "none";
        window.removeEventListener("mousemove", onMouseMove);
      });
      ul.appendChild(li);
    }
  });

  contextMenu.innerHTML = "";
  contextMenu.appendChild(ul);

  // Hide if mouse goes outside ±marginpx horizontally of the input
  const margin = 20;
  function onMouseMove(e) {
    const x = e.clientX;
    const y = e.clientY;
    rect = focusedElement.getBoundingClientRect();
    if (!calculateContextMenuPosition()) return;
    const currentRect = contextMenu.getBoundingClientRect();

    if (
      x < rect.left - margin ||
      x > rect.right + margin ||
      y < rect.top - margin ||
      y > currentRect.bottom + margin
    ) {
      contextMenu.style.opacity = 0;
      contextMenu.style.pointerEvents = "none";
    } else if (getComputedStyle(contextMenu).opacity === "0") {
      contextMenu.style.opacity = 1;
      contextMenu.style.pointerEvents = "all";
    }
  }

  document.addEventListener("wheel", () => {
    if (!calculateContextMenuPosition()) return;
  });
  document.addEventListener("resize", () => {
    if (!calculateContextMenuPosition()) return;
  });

  // attach mousemove only when menu is visible
  if (hasPutContextMenu) {
    window.addEventListener("mousemove", onMouseMove);
  }

  // Hide when the focused input loses focus
  focusedElement.addEventListener(
    "blur",
    () => {
      setTimeout(() => {
        contextMenu.style.opacity = 0;
        contextMenu.style.pointerEvents = "none";
        window.removeEventListener("mousemove", onMouseMove);
      }, 200); // give click event time to fire
    },
    { once: true },
  );
}
