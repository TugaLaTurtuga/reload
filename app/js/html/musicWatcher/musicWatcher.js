let settings = {
  currentPlayingAlbum: null, // the album the music is currently playing from
  currentTrackIndex: -1, // the place on the album where the track is
  previousTracks: [], // stack of { album, index }
  nextTracks: [], // queue of { album, index }
  tracksTimer: null, // the current time of the music being played (only changed on exit)
  isPlayingMusic: false, // is the audio being played
  currentAlbum: null, // the album thats currently opened
  volume: 0.8, // audio volume
  sfxVolume: 0.4, // audio volume
  theme: { dark: "", light: "light" }, // app's theme
  themeMode: "dark", // dark or light
  showFeatures: true, // shows features from a track, if false hides this: (feat: someone)
};

async function loadSettings() {
  try {
    let newSettings = (await ipcRenderer.invoke("get-settings")) || {};

    for (const key in settings) {
      // saver load
      if (newSettings && newSettings.hasOwnProperty(key)) {
        settings[key] = newSettings[key];
      }
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }

  // Apply settings
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

  document.body.setAttribute("theme", settings.theme[settings.themeMode]);

  console.log(settings.currentPlayingAlbum.info.description);
  console.log(settings.currentPlayingAlbum.info.description.palette);
}

ipcRenderer.on("settings-updated", async (event, updatedSettings) => {
  init();

  let link = document.getElementById("themes-stylesheet");
  // Force reload by appending timestamp query
  link.href = `../css/themes.css?ts=${Date.now()}`;
});

function getTrackName(track) {
  return track.title.replace(/(\(|\[)(feat|ft|with).*$/i, "").trim();
}

async function saveSettings() {
  settings.tracksTimer = null;
  await ipcRenderer.invoke("save-settings", settings);
}

const albumArt = document.getElementById("album-art");
const background = document.getElementById("app-background");
async function init() {
  await loadSettings();
  const album = settings.currentPlayingAlbum;

  const colors = album.info.description.palette;

  // Set album art cover image if available
  if (album.info.description.cover) {
    albumArt.src = album.info.description.cover;

    // If the image fails to load
    albumArt.onerror = () => {
      albumArt.src = "none";
    };
  } else {
    albumArt.src = "none";
  }

  const track = album.tracks[settings.currentTrackIndex];

  document.getElementById("track-title").textContent = getTrackName(track);
  document.getElementById("track-title").style.color = colors[0];
  document.getElementById("track-artist").textContent =
    album.info.description.author;
  document.getElementById("track-artist").style.color = colors[1];

  document.getElementById("track-album").textContent =
    album.info.description.name;
  document.getElementById("track-album").style.color = colors[1];

  document.getElementById("mini-controls").style.color = colors[2];

  document.getElementById("play-btn").textContent = settings.isPlayingMusic
    ? "⏸"
    : "▶";

  document.getElementById("play-btn").onclick = () => {
    ipcRenderer.invoke("player-toggle-playpause");
  };

  document.getElementById("next-btn").onclick = () => {
    ipcRenderer.invoke("player-next");
  };

  document.getElementById("prev-btn").onclick = () => {
    ipcRenderer.invoke("player-prev");
  };

  // Create soft radial blobs using each palette color
  const gradientStops = colors
    .map((color, i) => {
      return `radial-gradient(circle at ${Math.random() * 100}% ${Math.random() * 100}%, ${color} 0%, transparent 60%)`;
    })
    .join(", ");

  // Apply layered gradients
  if (background.getAttribute("colors") !== colors.join(", ")) {
    background.style.background = gradientStops;
    background.setAttribute("colors", colors.join(", "));
  }
}

window.addEventListener("DOMContentLoaded", init);
