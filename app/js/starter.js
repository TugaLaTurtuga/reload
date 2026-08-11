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
      } else if (updatedSettings.new.hasOwnProperty(key) && onlyNewchanges) {
        settings[key] = updatedSettings.new[key];
      }
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
  console.log("Settings loaded");

  volumeSlider.value = settings.volume;
  setVolume();
  setLook();
  sController.updateSliders();
  updateTheme();
  ipcRenderer.invoke("clean-new-settings");
}

async function setLook() {
  try {
    const lookPath = await ipcRenderer.invoke("get-look");

    if (!lookPath) {
      console.warn("get-look did not return a CSS path");
      return;
    }

    // Convert the absolute filesystem path to a file:// URL
    const cssUrl = require("url").pathToFileURL(lookPath).href;

    // Don't add it twice
    let link = document.getElementById("main-look-css");

    if (!link) {
      link = document.createElement("link");
      link.id = "main-look-css";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }

    link.href = `${cssUrl}?ts=${Date.now()}`;

    console.log("Loaded look CSS:", cssUrl);
  } catch (err) {
    console.error("Failed to load look CSS:", err);
  }
}

function updateTheme() {
  let link = document.getElementById("themes-stylesheet");
  // Force reload by appending timestamp query
  link.href = `css/themes.css?ts=${Date.now()}`;

  document.body.setAttribute("theme", settings.theme[settings.themeMode]);
}

function getTrackName(track, overrideFeatures = false) {
  if (settings.showFeatures && !overrideFeatures) return track.title.trim();
  else return track.title.replace(/(\(|\[)(feat|ft|with).*$/i, "").trim();
}

async function saveSettings() {
  if (isNaN(audioPlayer.currentTime)) {
    settings.tracksTimer = 0;
  } else {
    settings.tracksTimer = audioPlayer.currentTime;
  }

  settingsUpdatedByItself = true;
  await ipcRenderer.invoke("save-settings", settings);
}

async function updateSettings() {
  updateTheme();

  // update the tracks name when settings.showFeatures is changed
  if (settings.currentPlayingAlbum && settings.currentTrackIndex > -1) {
    nowPlayingTitle.textContent = getTrackName(
      getAlbumTrack(settings.currentPlayingAlbum, settings.currentTrackIndex),
    );
    updateOverflowsOnNowPlaying();
  }
  if (settings.currentAlbum) {
    openAlbum(settings.currentAlbum);
  } else if (settings.currentPlayingAlbum) {
    const test = await openAlbum(settings.currentPlayingAlbum);
    backToLibrary();
  } else {
    const test = await openAlbum(songs[0]);
    backToLibrary();
  }
}

// Event listeners
window.addEventListener("beforeunload", async (e) => {
  await loadSettings(true);
  await saveSettings();
});

// this saves correctly on exit.
ipcRenderer.on("settings-updated", async (event, updatedSettings) => {
  await loadSettings(true, updatedSettings);
  if (!settingsUpdatedByItself) {
    updateSettings();
  }
  settingsUpdatedByItself = false;
});

ipcRenderer.on("music-json-updated", updateLibrary);

ipcRenderer.on("player-command", async (event, command) => {
  await window.handlePlayerCommand(command);
});

audioPlayer.addEventListener("timeupdate", updateProgress);
audioPlayer.addEventListener("ended", playNext);
audioSource = getAudioSource("curr");
playPauseButton.addEventListener("click", togglePlayPause);
prevButton.addEventListener("click", playPrevious);
nextButton.addEventListener("click", playNext);
progressBar.addEventListener("input", seek);
progressBar.addEventListener("change", unseek);
muteButton.addEventListener("click", toggleMute);
volumeSlider.addEventListener("input", setVolume);
backButton.addEventListener("click", backToLibrary);
editButton.addEventListener("click", editAlbum);
ipcRenderer.on("edit-album", editAlbum);

navItems.forEach((item) => {
  item.addEventListener("click", () => switchSection(item.dataset.section));
});

loadSettings();
window.addEventListener("load", () => {
  loadLibrary();
  playLoadedAudioFromSettings();
  setVolume();
  sController.updateSliders();
  document.getElementById("spinner")?.remove();

  loadFavouritesToSidebar();
});

window.addEventListener("resize", () => {
  updateOverflowsOnNowPlaying();
});

async function openExternalHtml(relativePathFromHtml) {
  await saveSettings();
  ipcRenderer.invoke(
    "open-external",
    path.join(__dirname, relativePathFromHtml),
  );
}

const buttons = [
  { id: "min-btn", hoverText: "—" },
  { id: "max-btn", hoverText: "☐" },
  { id: "close-btn", hoverText: "×" },
];

buttons.forEach(({ id, hoverText }) => {
  const btn = document.getElementById(id);
  if (!btn) return;

  // Hover in
  btn.addEventListener("mouseenter", () => {
    btn.textContent = hoverText;
  });

  // Hover out (reset to original, optional)
  btn.addEventListener("mouseleave", () => {
    btn.textContent = "";
  });
});

// Click handlers
document.getElementById("min-btn").addEventListener("click", () => {
  ipcRenderer.send("window-minimize");
});

document.getElementById("max-btn").addEventListener("click", () => {
  ipcRenderer.send("window-toggle-maximize");
});

document.getElementById("close-btn").addEventListener("click", () => {
  ipcRenderer.send("window-close");
});

function goBack() {
  if (settings.currentAlbum) {
    backToLibrary();
  } else {
    openAlbum(settings.currentPlayingAlbum);
  }
}

function goForward() {
  return;
}
