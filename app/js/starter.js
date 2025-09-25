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
        console.log(key, updatedSettings.new[key]);
        settings[key] = updatedSettings.new[key];
      }
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
  console.log("Settings loaded");

  console.log("Settings loaded");

  volumeSlider.value = settings.volume;
  setVolume();
  setLook();
  sController.updateSliders();
  updateTheme();
  ipcRenderer.invoke("clean-new-settings");
}

function setLook() {
  let userLookCSS = document.getElementById("user-look");
  if (!userLookCSS) {
    userLookCSS = document.createElement("link");
    userLookCSS.id = "user-look";
    userLookCSS.rel = "stylesheet";
    document.head.appendChild(userLookCSS);
  }

  userLookCSS.href = `css/look.css?ts=${Date.now()}`;

  let themeCSS = document.getElementById("themes-stylesheet");
  // Force reload by appending timestamp query
  themeCSS.href = `css/themes.css?ts=${Date.now()}`;
}

function updateTheme() {
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
  await ipcRenderer.invoke("save-settings", settings);
}

async function updateSettings() {
  updateTheme();

  // update the tracks name when settings.showFeatures is changed
  if (settings.currentPlayingAlbum && settings.currentTrackIndex > -1) {
    nowPlayingTitle.textContent = getTrackName(
      settings.currentPlayingAlbum.tracks[settings.currentTrackIndex],
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
  updateSettings();
});

ipcRenderer.on("music-json-updated", updateLibrary);

ipcRenderer.on("muffleAudio", () => {
  muffleAudio();
});
ipcRenderer.on("unmuffleAudio", () => {
  unmuffleAudio();
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
//// TODO: implement the favourite btn, with the favourites going on the scrollable sidebar, rn the '.' in the top-right btns on album

navItems.forEach((item) => {
  item.addEventListener("click", () => switchSection(item.dataset.section));
});

loadSettings();
loadLibrary();
document.addEventListener("DOMContentLoaded", () => {
  playLoadedAudioFromSettings();
  setVolume();
  sController.updateSliders();
  document.getElementById("spinner")?.remove();
  ipcRenderer.invoke("getMuffleStatus").then((status) => {
    if (status) muffleAudio(0);
  });
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
