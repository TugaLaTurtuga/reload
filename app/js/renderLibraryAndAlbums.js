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
  albumOpened = false;
  albumsSection.innerHTML = "";
  albumsSorted = {};

  const filteredAlbums = [];
  songs.forEach((album) => {
    const finderMatch = _getFinderMatch(album);
    if (!finderMatch.matches) return;
    filteredAlbums.push({ album, finderMatch });
  });

  const organizationLevels = _getOrganizationLevels();
  const showOrganizationName = settings.organization.showOrganizationName;

  if (organizationLevels.length === 0) {
    albumsSection.classList.remove("organized-view");
    filteredAlbums.forEach(({ album, finderMatch }) => {
      albumsSection.appendChild(_createAlbumCard(album, finderMatch));
    });
  } else {
    albumsSection.classList.add("organized-view");
    const groupedAlbums = _buildAlbumGroups(filteredAlbums, organizationLevels);
    _renderAlbumGroups(
      albumsSection,
      groupedAlbums,
      organizationLevels,
      0,
      showOrganizationName,
    );
  }

  if (settings.currentAlbum) {
    openAlbum(settings.currentAlbum);
  }
}

function _getFinderMatch(album) {
  const containsFinder = [false, false, false];
  const albumName = album.info.description.name || album.name;

  if (!finderSearchWord) {
    return { matches: true, containsFinder };
  }

  const search = finderSearchWord.toLowerCase();

  if (albumName.toLowerCase().includes(search)) {
    containsFinder[0] = true;
  }

  if (album.info.description.author.toLowerCase().includes(search)) {
    containsFinder[1] = true;
  }

  for (let i = 0; i < album.tracks.length; i++) {
    const track = album.tracks[i];
    if (getTrackName(track).toLowerCase().includes(search)) {
      containsFinder[2] = true;
      break;
    }
  }

  return {
    matches: containsFinder[0] || containsFinder[1] || containsFinder[2],
    containsFinder,
  };
}

function _getOrganizationLevels() {
  const levels = [];

  if (settings.organization.seperateAlbumsFromSingles) {
    levels.push({
      type: "format",
      label: "Type",
      getGroupNames: (album) => [
        album.info.description.isAlbum ? "Albums" : "Singles",
      ],
      sort: (a, b) => {
        const order = { Album: 0, Single: 1 };
        return (order[a] ?? 99) - (order[b] ?? 99) || a.localeCompare(b);
      },
    });
  }

  if (settings.organization.organizeByArtist) {
    levels.push({
      type: "artist",
      label: "Artist",
      getGroupNames: (album) => [
        album.info.description.author || "Unknown Artist",
      ],
      sort: (a, b) => a.localeCompare(b),
    });
  }

  if (settings.organization.organizeByYear) {
    levels.push({
      type: "year",
      label: "Decade",
      getGroupNames: (album) => [_getAlbumDecade(album.info.description.year)],
      sort: (a, b) => _sortDecades(a, b),
    });
  }

  if (settings.organization.organizeByGenre) {
    levels.push({
      type: "genre",
      label: "Genre",
      getGroupNames: (album) => _getAlbumGenres(album.info.description.genre),
      sort: (a, b) => a.localeCompare(b),
    });
  }

  return levels;
}

function _buildAlbumGroups(items, levels, levelIndex = 0) {
  if (levelIndex >= levels.length) {
    return [...items].sort((a, b) => {
      const albumNameA = a.album.info.description.name || a.album.name;
      const albumNameB = b.album.info.description.name || b.album.name;
      return (
        albumNameA.localeCompare(albumNameB) ||
        (a.album.info.description.author || "").localeCompare(
          b.album.info.description.author || "",
        )
      );
    });
  }

  const currentLevel = levels[levelIndex];
  const groups = new Map();

  items.forEach((item) => {
    const groupNames = currentLevel.getGroupNames(item.album);
    groupNames.forEach((groupName) => {
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName).push(item);
    });
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => currentLevel.sort(a, b))
    .map(([groupName, groupItems]) => ({
      name: groupName,
      children: _buildAlbumGroups(groupItems, levels, levelIndex + 1),
    }));
}

function _renderAlbumGroups(
  container,
  groups,
  levels,
  levelIndex,
  showOrganizationName,
) {
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = `library-group library-group-level-${levelIndex + 1}`;

    if (showOrganizationName) {
      const title = document.createElement("h1");
      title.className = "library-group-title";
      title.textContent = `${group.name}:`;
      section.appendChild(title);
    }

    if (levelIndex === levels.length - 1) {
      const grid = document.createElement("div");
      grid.className = "library-group-grid";

      group.children.forEach(({ album, finderMatch }) => {
        grid.appendChild(_createAlbumCard(album, finderMatch));
      });

      section.appendChild(grid);
    } else {
      _renderAlbumGroups(
        section,
        group.children,
        levels,
        levelIndex + 1,
        showOrganizationName,
      );
    }

    container.appendChild(section);
  });
}

function _createAlbumCard(album, finderMatch) {
  const albumName = album.info.description.name || album.name;
  const albumCard = document.createElement("div");
  albumCard.className = "album-card";
  albumCard.innerHTML = `
      <div class="album-cover" style="background-image: url('${album.info.description.cover}')"></div>
      <div class="album-info">
        <div class="album-title">
          ${_highlightMatch(albumName)}
        </div>
        <div class="album-artist">
          ${_highlightMatch(album.info.description.author)}
        </div>
      </div>
    `;

  if (finderMatch.containsFinder[2]) {
    albumCard.classList.add("highlight");
  }

  albumCard.addEventListener("click", () => openAlbum(album));
  return albumCard;
}

function _getAlbumDecade(year) {
  const numericYear = parseInt(year, 10);
  if (Number.isNaN(numericYear)) {
    return "Unknown Decade";
  }

  return `${Math.floor(numericYear / 10) * 10}s`;
}

function _sortDecades(a, b) {
  if (a === "Unknown Decade") return 1;
  if (b === "Unknown Decade") return -1;
  return parseInt(b, 10) - parseInt(a, 10);
}

function _getAlbumGenres(genre) {
  if (!genre) return ["Unknown Genre"];

  const normalizedGenre = genre.trim();
  if (!normalizedGenre) return ["Unknown Genre"];

  const parts = normalizedGenre
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return [normalizedGenre];
  }

  return [...new Set([...parts, normalizedGenre])];
}

function _highlightMatch(text) {
  const escaped = finderSearchWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "ig");

  return text.replace(regex, `<span class="highlight">$1</span>`);
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
  aba.style.top = top - cursorYdiff - mainContent.scrollTop + "px";
}

document.addEventListener("mousemove", (e) => {
  putAlbumBackArtInPlace(e);
});

document.addEventListener("wheel", (e) => {
  putAlbumBackArtInPlace(e);
});

// Open album view
async function openAlbum(album) {
  if (!album || !fs.existsSync(album.path)) {
    // doesn't exist
    backToLibrary();
    return;
  }

  albumOpened = true;
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

  renderLibrary();
  return true;
}

async function editAlbum() {
  console.log("run");
  const savedCorrectly = await ipcRenderer.invoke(
    "setJsonToLoad",
    settings.currentAlbum.jsonPath,
  );

  if (savedCorrectly) {
    console.log("ran");
    openExternalHtml("html/musicEditor.html");
  }
}
