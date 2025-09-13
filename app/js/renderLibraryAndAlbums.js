// Update helper
function updateTracks(trackList) {
  if (!trackList) return;
  if (Array.isArray(trackList)) {
    const updatedTrackList = [];
    for (const track of trackList) {
      const match = songMap.get(track.album.path);
      if (match) {
        track.album = match;
      }
      updatedTrackList.push(track);
    }
    return updatedTrackList;
  } else {
    const match = songMap.get(trackList.path);
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
    songs = await ipcRenderer.invoke("get-library");
    songMap = new Map(songs.map((song) => [song.path, song]));
    await renderLibrary();

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
    songMap = new Map(songs.map((song) => [song.path, song]));
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
        <div class="album-title">${album.info.description.title || album.name}</div>
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

// Open album view
function openAlbum(album) {
  if (!album) return;
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
    console.log("No cover found for album:", album.name);
    albumArt.style.backgroundImage = "none";
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

  changeBackGroundColorFromNewAlbum(album.info.description.color);

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
  //mainContent.style.marginTop = '15px';
}

// Return to library view
async function backToLibrary() {
  playerContainer.classList.add("hidden");
  libraryContainer.classList.remove("hidden");
  mainContent.scrollTo(0, 0);
  const color = await tryGetComputedStyle("--bg-2");
  changeBackgroundGradient(color);
  settings.currentAlbum = null;
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

function getGridXSize(width) {
  if (width <= 200) return 0;
  return Math.ceil((width - 200) / 220);
}

async function moveVirtualCursor(x, y) {
  const allAlbums = document.querySelectorAll(".album-cover");
  const gridXSize = getGridXSize(albumsSection.clientWidth);
  const gridYSize = Math.ceil(allAlbums.length / gridXSize);
  const [cursorPos, isInCard] = await getCurrentGridPosition();

  let pos = cursorPos;
  if (isInCard) {
    pos += x - y * gridXSize;
    if (pos < 0) {
      if (x !== 0) {
        pos = gridXSize - 1;
        console.log(pos);
      } else {
        let gridPosY = Math.floor(cursorPos / gridXSize);
        let gridPosX = cursorPos % gridXSize;
        pos = gridPosX + (gridPosY + gridYSize) * gridXSize;
      }
      if (pos >= allAlbums.length) {
        pos -= gridXSize;
      }
    } else if (pos >= allAlbums.length) {
      let gridPosY = Math.floor(cursorPos / gridXSize);
      let gridPosX = cursorPos % gridXSize;
      if (x !== 0) {
        console.log(gridPosX, gridXSize);
        if (gridPosX + 1 === gridXSize) {
          console.log("Reached end of row");
          pos = cursorPos - gridXSize + 1;
        } else {
          console.log("Reached end of uncompleted row");
          pos = cursorPos - gridXSize;
        }
      } else {
        pos = gridPosX + (gridPosY - gridYSize) * gridXSize;
      }
      if (pos < 0) {
        pos += gridXSize;
      }
    }
  }

  // Ensure pos is within bounds
  pos = Math.min(Math.max(0, pos), allAlbums.length - 1);
  const album = allAlbums[pos];

  const playerControlsRect = playerControls.getBoundingClientRect();
  const albumRect = album.getBoundingClientRect();
  let albumCenterX = Math.ceil(albumRect.left + albumRect.width / 2);
  let albumCenterY = Math.ceil(albumRect.top + albumRect.height / 2);

  // scroll until album is fully visible
  let safety = allAlbums.length; // prevent infinite loop
  while (
    (albumCenterY >= playerControlsRect.top - albumRect.height / 4 ||
      albumCenterY < albumRect.height / 4) &&
    safety-- > 0
  ) {
    if (albumCenterY >= playerControlsRect.top - albumRect.height / 4) {
      mainContent.scrollBy(0, albumRect.height);
      albumCenterY -= albumRect.height;
    } else if (albumCenterY < albumRect.height / 4) {
      mainContent.scrollBy(0, -albumRect.height);
      albumCenterY += albumRect.height;
    }
  }

  await ipcRenderer.invoke("set-cursor-pos", albumCenterX, albumCenterY);
}

async function getCurrentGridPosition() {
  const allAlbums = document.querySelectorAll(".album-card");

  let closestIndex = -1;
  let closestDistance = Infinity;
  let isInCard = false;

  const cursorPos = await ipcRenderer.invoke("get-cursor-pos");

  for (let index = 0; index < allAlbums.length; index++) {
    const rect = allAlbums[index].getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = cursorPos.x - centerX;
    const dy = cursorPos.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;

      // check if cursor is inside this rect
      if (
        cursorPos.x >= rect.left &&
        cursorPos.x <= rect.right &&
        cursorPos.y >= rect.top &&
        cursorPos.y <= rect.bottom
      ) {
        isInCard = true;
        break; // stop early since cursor is inside a card
      }
    }
  }

  if (closestIndex === -1) return [null, false];
  return [closestIndex, isInCard];
}

function clickVirtualCursor(click) {
  ipcRenderer.invoke("click-cursor-btn", click);
}
