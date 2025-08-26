
// Update helper
function updateTracks(trackList) {
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
    songs = await ipcRenderer.invoke('get-library');
    songMap = new Map(songs.map(song => [song.path, song]));
    await renderLibrary();
    

    //                  Update tracks                  //
    settings.nextTracks       = updateTracks(settings.nextTracks);
    settings.previousTracks   = updateTracks(settings.previousTracks);
    const currentAlbumUpdated = updateTracks(currentAlbum);
    const playingAlbumUpdated = updateTracks(settings.currentPlayingAlbum);

    console.log(currentAlbumUpdated)

    // Handle UI updates
    if (currentAlbumUpdated) {
      openAlbum(currentAlbumUpdated); // update Values
      currentAlbum = currentAlbumUpdated;
    } else {
      backToLibrary(); // Current album no longer exists
    }

    if (playingAlbumUpdated) {
      nowPlayingArtist.textContent = playingAlbumUpdated.info.description.author;
      settings.currentPlayingAlbum = playingAlbumUpdated;
    }
  } catch (error) {
    console.error('Error reloading library:', error);
  }
}

// Load music library
async function loadLibrary() {
  try {
    songs = await ipcRenderer.invoke('get-library');
    songMap = new Map(songs.map(song => [song.path, song]));
    renderLibrary();
    setupJsonWatchers(); // Setup file watchers after loading library
    loading.style.display = 'none';
  } catch (error) {
    console.error('Error loading library:', error);
    loading.textContent = 'Error loading music library. Please check your file structure.';
  }
}

// Render music library
function renderLibrary() {
  // Render albums
  console.log(songs);
  albumsSection.innerHTML = '';
  songs.forEach(album => {
    const albumCard = document.createElement('div');
    albumCard.className = 'album-card';
    albumCard.innerHTML = `
      <div class="album-cover" style="background-image: url('${album.cover}')"></div>
      <div class="album-info">
        <div class="album-title">${album.info.description.title || album.name}</div>
        <div class="album-artist">${album.info.description.author}</div>
      </div>
    `;
    albumCard.addEventListener('click', () => openAlbum(album));
    albumsSection.appendChild(albumCard);
  });
}

// Open album view
function openAlbum(album) {
  currentAlbum = album;

  const savePath = path.join(__dirname, 'saves', 'jsonToLoad.txt');
  try {
    fs.writeFileSync(savePath, album.jsonPath, 'utf8');
  } catch (err) {
    console.error('Error saving current album:', err);
  }
  
  // Set album details
  if (album.cover) {
    albumArt.style.backgroundImage = `url('${currentAlbum.cover}')`;
    console.log(albumArt.style.backgroundImage, `url('${currentAlbum.cover}')`);
    if (albumArt.style.backgroundImage !== `url("${currentAlbum.cover}")`) albumArt.style.backgroundImage = 'none';
  } else {
    console.log('No cover found for album:', album.name);
    albumArt.style.backgroundImage = 'none';
  }

  albumTitle.textContent = album.info.description.name || album.name;
  albumArtist.textContent = album.info.description.author;
  albumYear.textContent = album.info.description.year;
  albumGenre.textContent = album.info.description.genre;
  albumDescription.textContent = album.info.description.description;

  changeBackGroundColorFromNewAlbum(album.info.description.color)
   
  // Render track list
  trackList.innerHTML = '';

  const albumTrackSize = album.tracks.length;
  const albumTrackSizeDigits = albumTrackSize.toString().length;

  album.tracks.forEach((track, index) => {
    const trackItem = document.createElement('div');
    trackItem.className = 'track-item';
    trackItem.dataset.index = index;
    if (index % 2 === 0) trackItem.classList.add('odd-color');
    const trackNumber = String(index + 1).padStart(albumTrackSizeDigits, '0');
    const durationStr = track.duration ? formatTime(track.duration) : '--:--';

    trackItem.innerHTML = `
      <div class="track-number">${trackNumber}</div>
      <div class="track-title">${track.title}</div>
      <div class="track-duration">${durationStr}</div>
    `;

    trackItem.addEventListener('click', () => {
      setNextTracksFromAlbum(album, index);
      playTrack(index, album, { pushPrev: true });
    });

    trackList.appendChild(trackItem);
  });


  if (settings.currentPlayingAlbum !== null) { // on first load the currentPlayingAlbum might be null, so this prevents a error
    if (currentAlbum.path === settings.currentPlayingAlbum.path) {
      document.querySelectorAll('.track-item').forEach(item => item.classList.remove('active'));
      const activeEl = document.querySelector(`.track-item[data-index="${settings.currentTrackIndex}"]`);
      if (activeEl) activeEl.classList.add('active');
    }
  }
    // Show player view, hide library
  libraryContainer.classList.add('hidden');
  playerContainer.classList.remove('hidden');
  mainContent.scrollTo(0, 0);
  //mainContent.style.marginTop = '15px';
}

// Return to library view
function backToLibrary() {
  playerContainer.classList.add('hidden');
  libraryContainer.classList.remove('hidden');
  mainContent.scrollTo(0, 0);
  changeBackgroundGradient(background.style.getPropertyPriority('--defaultBackgroundColor'))
  //mainContent.style.marginTop = '0px';
}
