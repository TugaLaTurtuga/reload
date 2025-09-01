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
  } catch (error) {
    console.error("Error loading settings:", error);
  }
  console.log("Settings loaded");

  volumeSlider.value = settings.volume;
  sController.updateSliders();
  updateTheme();
  ipcRenderer.invoke("clean-new-settings");
}

function updateTheme() {
  document.body.setAttribute("theme", settings.theme[settings.themeMode]);
}

function getTrackName(track) {
  if (settings.showFeatures) return track.title.trim();
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

function updateSettings() {
  updateTheme();

  // update the tracks name when settings.showFeatures is changed
  if (settings.currentPlayingAlbum && settings.currentTrackIndex > -1) {
    nowPlayingTitle.textContent = getTrackName(
      settings.currentPlayingAlbum.tracks[settings.currentTrackIndex],
    );
    updateOverflowsOnNowPlaying();
  }
  openAlbum(settings.currentAlbum);
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
  link.href = `css/themes.css?ts=${Date.now()}`;
});

ipcRenderer.on("music-json-updated", updateLibrary);

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
