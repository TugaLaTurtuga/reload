async function playLoadedAudioFromSettings() {
  if (settings.currentPlayingAlbum && settings.currentTrackIndex >= 0) {
    const opts = {
      pushPrev: null,
      playFromStart: settings.playFromStart,
      firstLoad: true,
    };
    await playTrack(
      settings.currentTrackIndex,
      settings.currentPlayingAlbum,
      opts,
    );
  }
}

// Play track by index
//// TODO: Make the audioSources work on the backend so its able to play without any window opened

function getCompressedInfo(album) {
  return { path: album.path };
}

async function getLessCompressedInfo(album, index) {
  // Keep only essential album info

  if (!album?.info?.trackList) {
    album = await getUncompressedInfo(album, index);
  }

  const compressedAlbum = {
    path: album.path,
    info: {
      description: album.info.description,
    },
    tracks: [],
  };

  for (let i = 0; i < index.length - 1; i++) {
    compressedAlbum.tracks.push(null);
  }
  compressedAlbum.tracks.push(album.tracks[index]);

  return compressedAlbum;
}

async function getUncompressedInfo(album, index) {
  if (album?.info?.trackList) return album; // already uncompressed
  const tries = 10;
  const timeout = 50;
  for (let i = 0; i < tries; i++) {
    try {
      const ready = songsMap && songsMap.size > 0;
      if (ready) {
        return check(album);
      }
    } catch (err) {
      // songsMap is not defiened for now.
    }

    if (i < tries - 1) {
      await new Promise((resolve) => setTimeout(resolve, timeout));
    }
  }
  return null; // fallback

  function check(album) {
    // get the uncompressed album
    const fullAlbum = songsMap.get(album.path);
    if (fullAlbum) {
      album = fullAlbum;
    }
    return album;
  }
}

async function playTrack(
  index,
  album = settings.currentPlayingAlbum,
  opts = {},
) {
  const { pushPrev = true, playFromStart = true, firstLoad = false } = opts;

  if (!album) return;

  album = await getUncompressedInfo(album);

  if (!album?.tracks[index]) return;

  let sourcesToUpdate = [true, true, true];
  let sources = [0, 1, 2];
  let done = false;
  for (let i = 0; i < audioSources.length; ++i) {
    if (done) break;
    const src = audioSources[i];
    // if it misses a attribute, no need to check for attribute 💯
    if (!src.hasAttribute("data-index") || !src.hasAttribute("data-album-path"))
      continue; // skips.
    const srcIndex = parseInt(src.getAttribute("data-index"), 10);
    const srcAlbumPath = src.getAttribute("data-album-path");

    if (srcIndex === index && srcAlbumPath === album.path) {
      switch (i) {
        case 0:
          audioSource = audioSources[0];
          audioSources[0].id = "curr";
          audioSources[1].id = "prev";
          audioSources[2].id = "next";
          sourcesToUpdate[0] = false;
          sourcesToUpdate[1] = false;

          sources[0] = 1;
          sources[1] = 0;
          sources[2] = 2;
          done = true;
          break;
        case 1: {
          audioPlayer.currentTime = 0;
          audioPlayer.play().catch((err) => {
            console.error("Playback error:", err);
          });
          playPauseButton.textContent = "⏸";
          settings.isPlayingMusic = true;
          return; // no need to update anything (as coded for now)
        }
        case 2: {
          audioSource = audioSources[2];
          audioSources[0].id = "next";
          audioSources[1].id = "prev";
          audioSources[2].id = "curr";
          sourcesToUpdate[1] = false;
          sourcesToUpdate[2] = false;

          sources[0] = 2;
          sources[1] = 0;
          sources[2] = 1;
          done = true;
          break;
        }
      }
    }
  }

  // Save current into history before switching (unless we're explicitly navigating "back")
  // the null is when its loaded from saves, as the thing that I saving here is the saved track playing to go back or forward.
  // bc I assume the track is different from the saved one, or the user clicked on it again.
  if (settings.currentPlayingAlbum && settings.currentTrackIndex >= 0) {
    if (pushPrev && pushPrev !== null) {
      settings.previousTracks.push({
        album: getCompressedInfo(settings.currentPlayingAlbum),
        index: settings.currentTrackIndex,
      });
      settings.previousTracks = settings.previousTracks.slice(-50); // limit previousTracks size
    } else if (pushPrev !== null) {
      settings.nextTracks.unshift({
        album: getCompressedInfo(settings.currentPlayingAlbum),
        index: settings.currentTrackIndex,
      });
      settings.nextTracks = settings.nextTracks.slice(-50); // limit nextTracks size
    }
  }

  settings.currentPlayingAlbum = await getUncompressedInfo(album, index);
  settings.currentTrackIndex = index;

  // Update track highlight (works when the album view is the one currently open)
  if (settings.currentAlbum !== null) {
    document
      .querySelectorAll(".track-item")
      .forEach((item) => item.classList.remove("active"));
    if (settings.currentAlbum.path === album.path) {
      const activeEl = document.querySelector(
        `.track-item[data-index="${index}"]`,
      );
      if (activeEl) activeEl.classList.add("active");
    }
  } // no need to remove any track-item active mode if settings.currentAlbum is null
  const currTrack = album.tracks[index];
  let alreadyLoadedTrack = false;

  updateMediaSessionMetadata(
    currTrack,
    settings.currentPlayingAlbum.info.description,
  );

  for (let i = 0; i < sources.length; ++i) {
    if (sources[i] === 1) {
      if (!sourcesToUpdate[i]) {
        loadTrack(currTrack, playFromStart, firstLoad);
        alreadyLoadedTrack = true;
      } else {
        break;
      }
    }
  }

  for (let i = 0; i < sourcesToUpdate.length; ++i) {
    sourceUpdate = sourcesToUpdate[sources[i]];
    if (!sourceUpdate) continue; // skips.

    let albumPathAndIndex = [null, null];
    let track = null;
    switch (i) {
      case 0: // prev
        if (settings.previousTracks.length === 0) continue;
        const prev =
          settings.previousTracks[settings.previousTracks.length - 1];
        if (!prev || !prev.album || prev.index == null) continue;

        prev.album = await getLessCompressedInfo(prev.album, prev.index);
        albumPathAndIndex[0] = prev.album.path;
        albumPathAndIndex[1] = prev.index;
        track = prev.album.tracks[prev.index];
        break;
      case 1: // curr
        albumPathAndIndex[0] = album.path;
        albumPathAndIndex[1] = index;
        track = currTrack;
        break;
      case 2: // next
        if (settings.nextTracks.length === 0) continue;
        const next = settings.nextTracks[0];
        if (!next || !next.album || next.index == null) continue;
        next.album = await getLessCompressedInfo(next.album, next.index);
        albumPathAndIndex[0] = next.album.path;
        albumPathAndIndex[1] = next.index;
        track = next.album.tracks[next.index];
    }

    if (track !== null && track?.path) {
      // load track to audioSource
      loadTrackToAudioSource(track, albumPathAndIndex, audioSources[i]);
      if (track === currTrack && !alreadyLoadedTrack) {
        loadTrack(currTrack, playFromStart, firstLoad);
      }
    }
  }

  getAudioSource();
}

function loadTrack(currTrack, playFromStart, firstLoad) {
  audioSource = audioPlayer.querySelector("#curr");
  audioPlayer.src = audioSource.src;

  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  audioPlayer.load();

  // if it ins't playing from the start, put the tracked time from settings to the audio player.
  if (!playFromStart && !isNaN(settings.tracksTimer)) {
    audioPlayer.currentTime = settings.tracksTimer;
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  }

  audioPlayer.addEventListener("canplay", function handleCanPlay() {
    audioPlayer.removeEventListener("canplay", handleCanPlay); // cleanup
    if (!settings.isPlayingMusic && firstLoad) {
      audioPlayer.pause();
      playPauseButton.textContent = "▶";
    } else {
      audioPlayer.play().catch((err) => {
        console.error("Playback error:", err);
      });
      settings.isPlayingMusic = true;
      playPauseButton.textContent = "⏸";
    }
  });

  // Update now playing info
  nowPlayingTitle.textContent = getTrackName(currTrack);
  nowPlayingArtist.textContent =
    settings.currentPlayingAlbum.info.description.author;

  updateOverflowsOnNowPlaying();

  if (settings.currentPlayingAlbum.info.description.cover) {
    nowPlayingArtSmall.style.backgroundImage = `url('${settings.currentPlayingAlbum.info.description.cover}')`;
    if (
      nowPlayingArtSmall.style.backgroundImage !==
      `url("${settings.currentPlayingAlbum.info.description.cover}")`
    )
      nowPlayingArtSmall.style.backgroundImage = "none";
  } else {
    nowPlayingArtSmall.style.backgroundImage = "none";
  }

  totalTimeEl.textContent = currTrack.duration
    ? formatTime(currTrack.duration)
    : "--:--";
  initAudioGraph();
}

async function loadTrackToAudioSource(track, albumPathAndIndex, src) {
  const ext = track.path.split(".").pop().toLowerCase();
  let url = track.path.replace(/\\/g, "/");

  switch (ext) {
    case "mp3":
      src.type = "audio/mpeg";
      break;
    case "m4a":
    case "aac":
      src.type = "audio/mp4";
      break;
    case "wav":
      src.type = "audio/wav";
      break;
    case "ogg":
      src.type = "audio/ogg";
      break;
    case "m4p": {
      src.type = "audio/mp4";
      let decoded = _decodedM4pCache.get(track.path);
      if (!decoded) {
        try {
          decoded = await ipcRenderer.invoke("decode-m4p", track.path);
          _decodedM4pCache.set(track.path, decoded);
        } catch (err) {
          console.error("Error decoding m4p file:", err);
          return;
        }
      }
      url = decoded;
      break;
    }
    default:
      console.error("Unsupported audio format:", ext);
      return;
  }

  // Only poke the DOM when the value actually changes.
  if (src.src !== url) src.src = url;

  src.setAttribute("data-album-path", albumPathAndIndex[0]);
  src.setAttribute("data-index", albumPathAndIndex[1]);
}

// Web Audio API context and filter
let audioCtx;
let sourceNode;
let filterNode;
let isMuffled = false;

function initAudioGraph() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(audioPlayer);

    // Create a low-pass filter
    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = "lowpass";
    filterNode.frequency.value = 20000; // start clear
    filterNode.Q.value = 1;

    // Connect: source -> filter -> destination
    sourceNode.connect(filterNode);
    filterNode.connect(audioCtx.destination);
  }
}

function getMimeTypeFromUrl(url) {
  const ext = url.split(".").pop().toLowerCase().split("?")[0].split("#")[0];
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/*";
  }
}

function getImgBase64AndMimeType(filePath) {
  const mime = getMimeTypeFromUrl(filePath);
  const data = fs.readFileSync(filePath);
  const base64 = data.toString("base64");
  return [`data:${mime};base64,${base64}`, mime];
}

function updateMediaSessionMetadata(track, albumDescription) {
  if (!("mediaSession" in navigator)) return;

  let cover = "";
  let mimeType = "image/*";

  if (albumDescription?.cover) {
    // If you wrote getImgBase64AndMimeType(filePath) to return [dataUrl, mime]
    [cover, mimeType] = getImgBase64AndMimeType(albumDescription.cover);
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: getTrackName(track, true),
    artist: albumDescription?.author || "",
    album: albumDescription?.title || "",
    artwork: cover
      ? [
          { src: cover, sizes: "512x512", type: mimeType },
          { src: cover, sizes: "256x256", type: mimeType },
        ]
      : [],
  });
}

if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => {
    if (!settings.isPlayingMusic) togglePlayPause();
  });

  navigator.mediaSession.setActionHandler("pause", () => {
    if (settings.isPlayingMusic) togglePlayPause();
  });

  navigator.mediaSession.setActionHandler("previoustrack", () => {
    playPrevious();
  });

  navigator.mediaSession.setActionHandler("nexttrack", () => {
    playNext();
  });

  // Optional: seek handlers
  navigator.mediaSession.setActionHandler("seekbackward", (details) => {
    audioPlayer.currentTime = Math.max(
      audioPlayer.currentTime - (details.seekOffset || 10),
      0,
    );
  });

  navigator.mediaSession.setActionHandler("seekforward", (details) => {
    audioPlayer.currentTime = Math.min(
      audioPlayer.currentTime + (details.seekOffset || 10),
      audioPlayer.duration,
    );
  });

  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (details.fastSeek && "fastSeek" in audioPlayer) {
      audioPlayer.fastSeek(details.seekTime);
      return;
    }
    audioPlayer.currentTime = details.seekTime;
  });
}

// Apply muffling effect
function muffleAudio(time = 0.5) {
  if (isMuffled || !audioCtx) return;
  const now = audioCtx.currentTime;
  filterNode.frequency.cancelScheduledValues(now);
  filterNode.frequency.setValueAtTime(filterNode.frequency.value, now);
  filterNode.frequency.linearRampToValueAtTime(175, now + time);
  isMuffled = true;
}

// Remove muffling effect
function unmuffleAudio() {
  if (!isMuffled || !audioCtx) return;
  const now = audioCtx.currentTime;
  filterNode.frequency.cancelScheduledValues(now);
  filterNode.frequency.setValueAtTime(filterNode.frequency.value, now);
  filterNode.frequency.linearRampToValueAtTime(20000, now + 1.5);
  isMuffled = false;
}

// Toggle play/pause
function togglePlayPause() {
  if (settings.isPlayingMusic) {
    audioPlayer.pause();
    playPauseButton.textContent = "▶";
  } else {
    if (settings.currentTrackIndex === -1) {
      playRandomSong();
      settings.isPlayingMusic = !settings.isPlayingMusic; // this makes sense... (that how you know it wasn't AI generated)
    }
    audioPlayer.play();
    playPauseButton.textContent = "⏸";
  }

  settings.isPlayingMusic = !settings.isPlayingMusic;
}

// Play previous track (uses history stack)
function playPrevious() {
  if (settings.previousTracks.length === 0) return;
  const prev = settings.previousTracks.pop();
  if (!prev || !prev.album || prev.index == null) return;

  playTrack(prev.index, prev.album, { pushPrev: false });
}

// Play next track (uses upcoming queue; random fallback)
function playNext() {
  if (settings.nextTracks.length > 0) {
    const { album, index } = settings.nextTracks.shift();
    playTrack(index, album, { pushPrev: true });
  } else {
    // Nothing queued — pick a random song
    playRandomSong();
  }
}

// ---------- NEW QUEUE/STACK HELPERS ----------
function setNextTracksFromAlbum(album, startIndex) {
  // Build the upcoming queue as all tracks after the selected index
  settings.nextTracks = [];
  if (!album || !album.tracks) return;
  for (let i = startIndex + 1; i < album.tracks.length; i++) {
    settings.nextTracks.push({ album: getCompressedInfo(album), index: i });
  }
}

//// TODO: Make a algorithm that bases the next song based on track rating, current track genre, and other factors
async function playRandomSong() {
  let previousAlbumIndex = -1;
  if (settings.currentPlayingAlbum?.tracks?.length > 0) {
    previousAlbumIndex = songs.findIndex(
      (a) => a.jsonPath === settings.currentPlayingAlbum.jsonPath,
    );
  }

  let randomIndex = Math.floor(Math.random() * songs.length);
  if (randomIndex === previousAlbumIndex && songs.length > 1) {
    randomIndex = (randomIndex + 1) % songs.length; // pick next album if same as previous
  }

  setNextTracksFromAlbum(songs[randomIndex], 0);
  playTrack(0, songs[randomIndex], { pushPrev: true });
}

// When user changes slider
let hasReachedEndOfProgressBar = false;
function seek() {
  if (audioPlayer.src) {
    try {
      if (progressBar.value >= 0.95 && settings.isPlayingMusic) {
        togglePlayPause();
        hasReachedEndOfProgressBar = true;
      } else if (hasReachedEndOfProgressBar && progressBar.value < 0.95) {
        settings.isPlayingMusic = false;
        hasReachedEndOfProgressBar = false;
        togglePlayPause();
      }

      audioPlayer.currentTime = progressBar.value * audioPlayer.duration;
    } catch (error) {
      // something went REALLY WRONG
      progressBar.value = 0; // put slider in the start
    }
  } else {
    progressBar.value = 0; // no music being played
  }
}

function unseek() {
  if (hasReachedEndOfProgressBar) {
    settings.isPlayingMusic = false;
    hasReachedEndOfProgressBar = false;
    togglePlayPause();
  }
}

// Toggle mute
function toggleMute() {
  audioPlayer.muted = !audioPlayer.muted;
  muteButton.textContent = audioPlayer.muted ? "🔇" : "🔊";
}

// Set volume
function setVolume() {
  audioPlayer.volume = easeIn(volumeSlider.value);
  settings.volume = volumeSlider.value;
}

function addVolume(plus) {
  // Convert slider value (string) to number
  let newVal = parseFloat(volumeSlider.value) + parseFloat(plus);

  // Clamp between 0 and 1
  newVal = Math.max(0, Math.min(1, newVal));

  volumeSlider.value = newVal;
  console.log(newVal, plus);
  setVolume();
  sController.updateSlider(volumeSlider);
}

function addProgress(plus) {
  // Convert slider value (string) to number
  audioPlayer.currentTime += plus;
  progressBar.value = audioPlayer.currentTime / audioPlayer.duration;
  sController.updateSlider(progressBar);
}

function getAudioSource(id = "") {
  audioSources = document.querySelectorAll(".audio-source");
  organizedAudioSources = [null, null, null];
  for (let i = 0; i < audioSources.length; ++i) {
    const src = audioSources[i];
    switch (src.id) {
      case "prev":
        organizedAudioSources[0] = src;
        break;
      case "curr":
        organizedAudioSources[1] = src;
        addEventListeners = true;
        break;
      case "next":
        organizedAudioSources[2] = src;
        break;
    }
  }
  audioSources = organizedAudioSources;

  switch (id) {
    case 0:
    case "prev":
      return audioSources[0];
    case 1:
    case "curr":
      return audioSources[1];
    case 2:
    case "next":
      return audioSources[2];
    default:
      return audioSources;
  }
}
