// Update helper
function updateTracks(trackList) {
  if (!trackList) return;
  if (Array.isArray(trackList)) {
    const updatedTrackList = [];
    for (const track of trackList) {
      const match = songsMap.get(track.album.path);
      if (match) {
        track.album = match;
      }
      updatedTrackList.push(track);
    }
    return updatedTrackList;
  } else {
    const match = songsMap.get(trackList.path);
    if (match) {
      return match;
    } else {
      return false;
    }
  }
}

async function updateLibrary() {
  try {
    // Reload the library
    songs = await ipcRenderer.invoke("rescan-library");
    songsMap = new Map(songs.map((song) => [song.path, song]));
    renderLibrary();

    //                  Update tracks                  //
    settings.nextTracks = updateTracks(settings.nextTracks);
    settings.previousTracks = updateTracks(settings.previousTracks);
    const currentAlbumUpdated = updateTracks(settings.currentAlbum);
    const playingAlbumUpdated = updateTracks(settings.currentPlayingAlbum);

    // Handle UI updates
    if (currentAlbumUpdated) {
      openAlbum(currentAlbumUpdated); // update Values
      settings.currentAlbum = currentAlbumUpdated;
    } else {
      backToLibrary(); // Current album no longer exists
    }

    if (playingAlbumUpdated) {
      nowPlayingArtist.textContent =
        playingAlbumUpdated.info.description.author;
      updateOverflowsOnNowPlaying();
      settings.currentPlayingAlbum = playingAlbumUpdated;
    }
    saveSettings();
  } catch (error) {
    console.error("Error reloading library:", error);
  }
}

// Load music library
async function loadLibrary() {
  try {
    songs = await ipcRenderer.invoke("get-library");
    songsMap = new Map(songs.map((song) => [song.path, song]));
    renderLibrary();
    loading.style.display = "none";
  } catch (error) {
    console.error("Error loading library:", error);
    loading.textContent =
      "Error loading music library. Please check your file structure.";
  }
}

// Render music library
function renderLibrary() {
  // Render albums
  albumsSection.innerHTML = "";
  songs.forEach((album) => {
    const albumCard = document.createElement("div");
    albumCard.className = "album-card";
    //albumCard.setAttribute("title", "Open album");
    albumCard.innerHTML = `
      <div class="album-cover" style="background-image: url('${album.info.description.cover}')"></div>
      <div class="album-info">
        <div class="album-title">${album.info.description.name || album.name}</div>
        <div class="album-artist">${album.info.description.author}</div>
      </div>
    `;
    albumCard.addEventListener("click", () => openAlbum(album));
    albumsSection.appendChild(albumCard);
  });
  //getTooltips();

  if (settings.currentAlbum) {
    openAlbum(settings.currentAlbum);
  }
}

window.addEventListener("resize", () => {
  checkAlbumArtSize();
});

function checkAlbumArtSize() {
  const el = document.getElementById("album-art-container");
  el.style.display = "block"; // this is to calculate the size of the album art container correctly
  const w = el.clientWidth;
  const h = el.clientHeight;

  const aba = document.getElementById("album-back-art");

  if (w < h) {
    el.style.display = "none";
    aba.style.display = "none";
  } else {
    el.style.display = "block";
  }
}

function putAlbumBackArtInPlace(e) {
  const aa = document.getElementById("album-art-container");
  const aba = document.getElementById("album-back-art");

  if (
    aa.style.display === "none" ||
    e === null ||
    document.getElementById("player-container").classList.contains("hidden")
  ) {
    aba.style.display = "none";
    return;
  } else {
    aba.style.display = "block";
  }

  // Center aba inside aa
  const rect = aa.getBoundingClientRect();
  let left =
    rect.width / 2 +
    aa.offsetLeft +
    document.getElementById("main-content").offsetLeft;
  let top = rect.height / 2 + aa.offsetTop;

  let cursorXdiff = Math.min(30, Math.max(-30, (e.clientX - left) / 20));
  let cursorYdiff = Math.min(30, Math.max(-30, (e.clientY - top) / 20));

  aba.style.left = left - cursorXdiff + "px";
  aba.style.top = top - cursorYdiff + "px";
}

document.addEventListener("mousemove", (e) => {
  putAlbumBackArtInPlace(e);
});

// Open album view
async function openAlbum(album) {
  if (!album) return;
  if (!fs.existsSync(album.path)) {
    // doesn't exist
    backToLibrary();
    return;
  }

  const fullAlbum = songsMap.get(album.path);
  if (fullAlbum) {
    album = fullAlbum;
  }
  settings.currentAlbum = album;

  // Set album details
  if (album.info.description.cover) {
    albumArt.style.backgroundImage = `url('${settings.currentAlbum.info.description.cover}')`;
    if (
      albumArt.style.backgroundImage !==
      `url("${settings.currentAlbum.info.description.cover}")`
    )
      albumArt.style.backgroundImage = "none";
  } else {
    albumArt.style.backgroundImage = "none";
  }

  if (!settings.currentAlbum.info.description.cover.endsWith(".gif")) {
    document.getElementById("album-back-art").style.backgroundImage =
      albumArt.style.backgroundImage;
  } else {
    document.getElementById("album-back-art").style.backgroundImage = "none";
  }

  albumArt.addEventListener("click", () => {
    setNextTracksFromAlbum(album, 0);
    playTrack(0, album, { pushPrev: true });
  });

  albumTitle.textContent = album.info.description.name || album.name;
  albumArtist.textContent = album.info.description.author;
  albumYear.textContent = album.info.description.year;
  albumGenre.textContent = album.info.description.genre;
  albumDescription.textContent = album.info.description.description;

  await changeBackGroundColorFromNewAlbum(album.info.description.color);

  // Render track list
  trackList.innerHTML = "";

  const albumTrackSize = album.tracks.length;
  const albumTrackSizeDigits = albumTrackSize.toString().length;

  album.tracks.forEach((track, index) => {
    const trackItem = document.createElement("div");
    trackItem.className = "track-item";
    trackItem.dataset.index = index;
    if (index % 2 === 0) trackItem.classList.add("odd-color");
    const trackNumber = String(index + 1).padStart(albumTrackSizeDigits, "0");
    const durationStr = track.duration ? formatTime(track.duration) : "--:--";

    trackItem.innerHTML = `
      <div class="track-number">${trackNumber}</div>
      <div class="track-title">${getTrackName(track)}</div>
      <div class="track-duration">${durationStr}</div>
    `;

    trackItem.addEventListener("click", () => {
      setNextTracksFromAlbum(album, index);
      playTrack(index, album, { pushPrev: true });
    });

    trackList.appendChild(trackItem);
  });

  if (settings.currentPlayingAlbum !== null) {
    // on first load the currentPlayingAlbum might be null, so this prevents a error
    if (settings.currentAlbum.path === settings.currentPlayingAlbum.path) {
      document
        .querySelectorAll(".track-item")
        .forEach((item) => item.classList.remove("active"));
      const activeEl = document.querySelector(
        `.track-item[data-index="${settings.currentTrackIndex}"]`,
      );
      if (activeEl) activeEl.classList.add("active");
    }
  }
  // Show player view, hide library
  libraryContainer.classList.add("hidden");
  playerContainer.classList.remove("hidden");
  mainContent.scrollTo(0, 0);

  try {
    updateFavouriteBtn();
  } catch (err) {}

  checkAlbumArtSize();

  return true;
}

// Return to library view
async function backToLibrary() {
  playerContainer.classList.add("hidden");
  libraryContainer.classList.remove("hidden");
  mainContent.scrollTo(0, 0);
  const color = await tryGetComputedStyle("--bg-2");
  changeBackgroundGradient(color);
  settings.currentAlbum = null;
  putAlbumBackArtInPlace(null);
  return true;
}

async function editAlbum() {
  // for html/musicEditor.html know what file to load
  const savePath = path.join(__dirname, "saves", "jsonToLoad.txt");
  try {
    await fs.writeFileSync(savePath, settings.currentAlbum.jsonPath, "utf8");
    openExternalHtml("html/musicEditor.html");
  } catch (err) {
    console.error("Error saving current album:", err);
  }
}
