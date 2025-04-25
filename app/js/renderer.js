
// DOM Elements
const audioPlayer = document.getElementById('audio-player');
const playPauseButton = document.getElementById('play-pause-button');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const volumeSlider = document.getElementById('volume-slider');
const muteButton = document.getElementById('mute-button');
const nowPlayingTitle = document.getElementById('now-playing-title');
const nowPlayingArtist = document.getElementById('now-playing-artist');
const nowPlayingArtSmall = document.getElementById('now-playing-art-small');
const albumsSection = document.getElementById('albums-section');
const singlesSection = document.getElementById('singles-section');
const loading = document.getElementById('loading');
const navItems = document.querySelectorAll('.nav-item');
const libraryContainer = document.getElementById('library-container');
const playerContainer = document.getElementById('player-container');
const backButton = document.getElementById('player-header');
const albumArt = document.getElementById('album-art');
const albumTitle = document.getElementById('album-title');
const albumArtist = document.getElementById('album-artist');
const albumYear = document.getElementById('album-year');
const albumGenre = document.getElementById('album-genre');
const albumDescription = document.getElementById('album-description');
const trackList = document.getElementById('track-list');

// App State
let songs = [];
let currentAlbum = null;
let currentTrackIndex = -1;
let isPlaying = false;
let lastPlayedInfo = null;

// Format time in MM:SS
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function saveLastPlayed() {
  if (!currentAlbum || currentTrackIndex < 0) return;
  
  const info = {
    albumName: currentAlbum.name,
    trackIndex: currentTrackIndex,
    volume: audioPlayer.volume,
    currentTime: audioPlayer.currentTime
  };
  
  await ipcRenderer.invoke('save-last-played', info);
}

// Load music library
async function loadLibrary() {
  try {
    songs = await ipcRenderer.invoke('get-library');
    renderLibrary();
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
        <div class="album-title">${album.name}</div>
        <div class="album-artist">${album.author}</div>
      </div>
    `;
    albumCard.addEventListener('click', () => openAlbum(album));
    albumsSection.appendChild(albumCard);
  });
}

// Open album view
function openAlbum(album) {
  currentAlbum = album;
  
  // Set album details
  albumArt.src = album.cover;
  albumTitle.textContent = album.name;
  albumArtist.textContent = album.author;
  albumYear.textContent = album.year;
  albumGenre.textContent = album.genre;
  albumDescription.textContent = album.description;
  
  // Background color from album
  if (album.color) {
    document.documentElement.style.setProperty('--album-color', album.color);
  }
  
  // Render track list
  trackList.innerHTML = '';
  album.tracks.forEach((track, index) => {
    const trackItem = document.createElement('div');
    trackItem.className = 'track-item';
    trackItem.dataset.index = index;
    if (index % 2 === 0) trackItem.classList.add('odd-color')
    console.log(track);
    
    // Format track duration
    const durationStr = track.duration ? formatTime(track.duration) : '--:--';
    
    trackItem.innerHTML = `
      <div class="track-number">${index + 1}</div>
      <div class="track-title">${track.title}</div>
      <div class="track-duration">${durationStr}</div>
    `;
    trackItem.addEventListener('click', () => playTrack(index));
    trackList.appendChild(trackItem);
  });
  
  // Show player view, hide library
  libraryContainer.classList.add('hidden');
  playerContainer.classList.remove('hidden');
}

// Return to library view
function backToLibrary() {
  playerContainer.classList.add('hidden');
  libraryContainer.classList.remove('hidden');
}

// Restore last played track
function restoreLastPlayed() {
  if (!lastPlayedInfo || !library) return;
  
  try {
    const { albumType, albumName, trackIndex, volume, currentTime } = lastPlayedInfo;
    
    // Find the album in the library
    const albums = albumType === 'albums' ? library.albums : library.singles;
    const albumIndex = albums.findIndex(album => album.name === albumName);
    
    if (albumIndex >= 0) {
      // Switch to correct section
      switchSection(albumType);
      
      // Open the album
      openAlbum(albums[albumIndex], albumType);
      
      // Set volume
      if (typeof volume === 'number') {
        audioPlayer.volume = volume;
        volumeFilled.style.width = `${volume * 100}%`;
      }
      
      // Play the track
      playTrack(trackIndex);
      
      // Set time position
      if (typeof currentTime === 'number') {
        audioPlayer.currentTime = currentTime;
      }
    }
  } catch (error) {
    console.error('Error restoring last played track:', error);
  }
}

// Play track by index
function playTrack(index) {
  if (!currentAlbum || !currentAlbum.tracks[index]) return;
  
  currentTrackIndex = index;
  const track = currentAlbum.tracks[index];
  
  // Update track highlight
  document.querySelectorAll('.track-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`.track-item[data-index="${index}"]`).classList.add('active');
  
  // Update audio source
  audioPlayer.src = track.path.replace(/\\/g, '/');
  audioPlayer.play();
  isPlaying = true;
  playPauseButton.textContent = '⏸';
  
  // Update now playing info
  nowPlayingTitle.textContent = track.title;
  nowPlayingArtist.textContent = currentAlbum.author;
  
  if (currentAlbum.cover) {
    nowPlayingArtSmall.style.backgroundImage = `url('${currentAlbum.cover}')`;
  } else {
    nowPlayingArt.style.backgroundImage = 'url("placeholder.png")';
    nowPlayingArtSmall.style.backgroundImage = 'url("placeholder.png")';
  }

  totalTimeEl.textContent = formatTime(track.duration);
  saveLastPlayed();
}

// Toggle play/pause
function togglePlayPause() {
  if (!currentAlbum || currentTrackIndex < 0) return;
  
  if (isPlaying) {
    audioPlayer.pause();
    playPauseButton.textContent = '▶';
  } else {
    audioPlayer.play();
    playPauseButton.textContent = '⏸';
  }
  
  isPlaying = !isPlaying;
}

// Play previous track
function playPrevious() {
  if (!currentAlbum || currentTrackIndex <= 0) return;
  playTrack(currentTrackIndex - 1);
}

// Play next track
function playNext() {
  if (!currentAlbum || currentTrackIndex >= currentAlbum.tracks.length - 1) return;
  playTrack(currentTrackIndex + 1);
}

// Format time helper
function formatTime(time) {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// Update progress bar as audio plays
function updateProgress() {
  if (!isNaN(audioPlayer.duration)) {
    progressBar.value = audioPlayer.currentTime / audioPlayer.duration;
    sController._updateSliderBackground(progressBar);  // Update the background with the new value
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  }
}

// When user changes slider
function seek() {
  try {
    audioPlayer.currentTime = progressBar.value * audioPlayer.duration;
  } catch (error) { // this happens when there's no music being played
    progressBar.value = 0; // put slider in the start
  }
}

// Toggle mute
function toggleMute() {
  audioPlayer.muted = !audioPlayer.muted;
  muteButton.textContent = audioPlayer.muted ? '🔇' : '🔊';
}

// Set volume
function setVolume() {
  audioPlayer.volume = easeIn(volumeSlider.value);
}

// Event listeners
playPauseButton.addEventListener('click', togglePlayPause);
prevButton.addEventListener('click', playPrevious);
nextButton.addEventListener('click', playNext);
progressBar.addEventListener('input', seek);
muteButton.addEventListener('click', toggleMute);
volumeSlider.addEventListener('input', setVolume);
backButton.addEventListener('click', backToLibrary);

audioPlayer.addEventListener('timeupdate', updateProgress);
audioPlayer.addEventListener('ended', playNext);

navItems.forEach(item => {
  item.addEventListener('click', () => switchSection(item.dataset.section));
});

// Initialize app
loadLibrary();
restoreLastPlayed();
