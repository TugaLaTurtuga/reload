async function loadSettings() {
  try {
    let lastPlayedInfo = await ipcRenderer.invoke('load-settings') || {};

    for (const key in settings) { // saver load
      if (lastPlayedInfo && lastPlayedInfo.hasOwnProperty(key)) {
        settings[key] = lastPlayedInfo[key];
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }

  // Apply settings
  volumeSlider.value = settings.volume;
  updateTheme();

  console.log('Settings loaded:', settings);
}

function updateTheme() {
  settings.theme = '';
  document.body.setAttribute('theme', settings.theme)
}

async function saveSettings() {
  if (isNaN(audioPlayer.currentTime)) {
    settings.tracksTimer = 0;
  } else {
    settings.tracksTimer = audioPlayer.currentTime;
  }

  await ipcRenderer.invoke('save-settings', settings);
};

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
window.addEventListener('beforeunload', saveSettings);   // save on exit

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
  await ipcRenderer.invoke('save-settings', settings); // this is for the theme to be in all the windows
  ipcRenderer.invoke('open-external', path.join(__dirname, relativePathFromHtml));
}
