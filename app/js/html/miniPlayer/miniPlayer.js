let settings = {
  currentPlayingAlbum: null, // the album the music is currently playing from
  currentTrackIndex: -1, // the place on the album where the track is
  tracksTimer: null, // the current time of the music being played (only changed on exit)
  isPlayingMusic: false, // is the audio being played
  currentAlbum: null, // the album thats currently opened
  volume: 0.8, // audio volume
};

async function loadSettings() {
  try {
    let newSettings = (await ipcRenderer.invoke("get-settings")) || {};

    if (
      // just changed songs
      settings.currentPlayingAlbum !== null &&
      settings.currentPlayingAlbum.path !== newSettings.currentPlayingAlbum.path
    ) {
      newSettings["isPlayingMusic"] = true;
    } else if (
      // just changed tracks
      settings.currentTrackIndex !== -1 &&
      settings.currentTrackIndex !== newSettings.currentTrackIndex
    ) {
      console.log(settings.currentTrackIndex);
      newSettings["isPlayingMusic"] = true;
    }

    for (const key in settings) {
      if (newSettings && newSettings.hasOwnProperty(key)) {
        settings[key] = newSettings[key];
      }
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
}

ipcRenderer.on("settings-updated", async (event, updatedSettings) => {
  init();
});

function getTrackName(track) {
  return track.title.replace(/(\(|\[)(feat|ft|with).*$/i, "").trim();
}

const albumArt = document.getElementById("album-art");
const background = document.getElementById("app-background");

function bindControls() {
  document.getElementById("play-btn").onclick = () => {
    ipcRenderer.invoke("player-toggle-playpause");
  };

  document.getElementById("prev-btn").onclick = () => {
    ipcRenderer.invoke("player-prev");
  };

  document.getElementById("next-btn").onclick = () => {
    ipcRenderer.invoke("player-next");
  };
}

async function init() {
  await loadSettings();
  bindControls();

  const album = settings.currentPlayingAlbum;
  const track = getAlbumTrack(album, settings.currentTrackIndex);

  if (!album || !track) {
    document.getElementById("track-title").textContent = "Select a track";
    document.getElementById("track-artist").textContent = "";
    document.getElementById("track-album").textContent = "";
    document.getElementById("play-btn").textContent = settings.isPlayingMusic
      ? "⏸"
      : "▶";
    albumArt.src = "none";
    background.style.background = "";
    return;
  }

  const colors = album.info.description.palette || [
    "var(--textColor)",
    "var(--textSubColor)",
    "var(--textSubColor)",
  ];

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

  document.getElementById("track-title").textContent = getTrackName(track);
  document.getElementById("track-artist").textContent =
    album.info.description.author;

  document.getElementById("track-album").textContent =
    album.info.description.name || album.name;

  document.body.style.setProperty("--2-color", colors[2]);
  document.body.style.setProperty("--1-color", colors[1]);
  document.body.style.setProperty("--0-color", colors[0]);

  console.log(colors);

  document.getElementById("play-btn").textContent = settings.isPlayingMusic
    ? "⏸"
    : "▶";

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

document.addEventListener("keydown", (e) => {
  console.log(e.key);
  if (e.key === " ") {
    ipcRenderer.invoke("player-toggle-playpause");
  } else if (e.key === "ArrowLeft" || e.key === "<") {
    ipcRenderer.invoke("player-prev");
  } else if (e.key === "ArrowRight" || e.key === ">") {
    ipcRenderer.invoke("player-next");
  }
});

window.addEventListener("DOMContentLoaded", init);
