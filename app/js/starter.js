async function loadSettings(onlyNonMusic = false) {
  try {
    let updatedSettings = await ipcRenderer.invoke('load-settings') || {};
    if (!updatedSettings) return;

    for (const key in settings) { // saver load then just putting
      if (updatedSettings.hasOwnProperty(key)) {
        if (onlyNonMusic) {
          if (nonMusicSettings.hasOwnProperty(key)) {
            settings[key] = updatedSettings[key];
          }
        } else {
          settings[key] = updatedSettings[key];
        }
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  console.log('Settings loaded:', settings);

  volumeSlider.value = settings.volume;
  updateTheme();
}

function updateTheme() {
  document.body.setAttribute('theme', settings.theme)
}

async function saveSettings() {
  if (isNaN(audioPlayer.currentTime)) {
    settings.tracksTimer = 0;
  } else {
    settings.tracksTimer = audioPlayer.currentTime;
  }

  let saveSettings = settings;
  console.log(saveSettings.volume);
  saveSettings.theme = undefined;

  await ipcRenderer.invoke('save-settings', saveSettings);
};

function updateSettings() {
  updateTheme();
  updateLibrary();
}

// Setup file watchers for JSON files
function setupJsonWatchers() {
  // Clear existing watchers
  jsonWatchers.forEach(watcher => {
    if (watcher && typeof watcher.close === 'function') {
      watcher.close();
    }
  });
  jsonWatchers.clear();

  // Setup watchers for each album's JSON file
  songs.forEach(album => {
    if (album.jsonPath) {
      try {
        const watcher = fs.watchFile(album.jsonPath, { persistent: false, interval: 1000 }, (curr, prev) => {
          // Check if file was actually modified (not just accessed)
          if (curr.mtime > prev.mtime) {
            console.log(`JSON file changed: ${album.jsonPath}`);
            //ipcRenderer.invoke('update-library');
            updateLibrary();
          }
        });
        
        jsonWatchers.set(album.jsonPath, watcher);
      } catch (error) {
        console.error(`Error setting up watcher for ${album.jsonPath}:`, error);
      }
    }
  });
}

// Clean up watchers when app closes
function cleanupWatchers() {
  jsonWatchers.forEach(watcher => {
    if (watcher && typeof watcher.close === 'function') {
      watcher.close();
    }
  });
  jsonWatchers.clear();
}

// Event listeners

// Listen for app close event
window.addEventListener('beforeunload', cleanupWatchers); // cleanup watchers on exit
window.addEventListener('beforeunload', async () => {
  await loadSettings(true);
  saveSettings();
}); // this saves correctly on exit. Don't ask.

ipcRenderer.on('settings-updated', (event, updatedSettings) => {
  if (updatedSettings) {
    for (const key in settings) { // saver load
      if (updatedSettings.hasOwnProperty(key)) {
        settings[key] = updatedSettings[key];
      }
    }
  }
  updateSettings();
});


audioPlayer.addEventListener('timeupdate', updateProgress);
audioPlayer.addEventListener('ended', playNext);
audioSource = getAudioSource('curr');
playPauseButton.addEventListener('click', togglePlayPause);
prevButton.addEventListener('click', playPrevious);
nextButton.addEventListener('click', playNext);
progressBar.addEventListener('input', seek);
progressBar.addEventListener('change', unseek);
muteButton.addEventListener('click', toggleMute);
volumeSlider.addEventListener('input', setVolume);
backButton.addEventListener('click', backToLibrary);
editButton.addEventListener('click', () => openExternalHtml('html/musicEditor.html'));

navItems.forEach(item => {
  item.addEventListener('click', () => switchSection(item.dataset.section));
});

// Initialize app
loadSettings();
loadLibrary();

document.addEventListener('DOMContentLoaded', () => {
  playLoadedAudioFromSettings();
  setVolume();
  sController.updateSliders();
});

window.addEventListener('resize', () => {
  updateOverflowsOnNowPlaying();
});

async function openExternalHtml(relativePathFromHtml) {
  await saveSettings()
  ipcRenderer.invoke('open-external', path.join(__dirname, relativePathFromHtml));
}
