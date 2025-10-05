const { ipcRenderer, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function easeIn(t) {
  return t * t;
}

function easeOut(t) {
  return t * (2 - t);
}

// DOM Elements
const audioPlayer = document.getElementById("audio-player");
let audioSources = null; // go to starter.js to see what this is
let audioSource = null;
const playPauseButton = document.getElementById("play-pause-button");
const prevButton = document.getElementById("prev-button");
const nextButton = document.getElementById("next-button");
const progressBar = document.getElementById("progress-bar");
const currentTimeEl = document.getElementById("current-time");
const totalTimeEl = document.getElementById("total-time");
const volumeSlider = document.getElementById("volume-slider");
const muteButton = document.getElementById("mute-button");
const nowPlayingTitleWrapper = document.getElementById(
  "now-playing-title-wrapper",
);
const nowPlayingTitle = document.getElementById("now-playing-title");
const nowPlayingArtistWrapper = document.getElementById(
  "now-playing-artist-wrapper",
);
const nowPlayingArtist = document.getElementById("now-playing-artist");
const nowPlayingArtSmall = document.getElementById("now-playing-art-small");
const albumsSection = document.getElementById("albums-section");
const loading = document.getElementById("loading");
const navItems = document.querySelectorAll(".nav-item");
const libraryContainer = document.getElementById("library-container");
const playerContainer = document.getElementById("player-container");
const backButton = document.getElementById("back-button");
const editButton = document.getElementById("edit-button");
const albumArt = document.getElementById("album-art");
const albumTitle = document.getElementById("album-title");
const albumArtist = document.getElementById("album-artist");
const albumYear = document.getElementById("album-year");
const albumGenre = document.getElementById("album-genre");
const albumDescription = document.getElementById("album-description");
const trackList = document.getElementById("track-list");
const background = document.getElementById("app");
const mainContent = document.getElementById("main-content");
const playerControls = document.getElementById("player-controls");

// App State
let songs = []; // the fetched albums/comps/eps/singles
let songsMap = new Map();

let settings = {
  currentPlayingAlbum: null, // the album the music is currently playing from
  currentTrackIndex: -1, // the place on the album where the track is
  previousTracks: [], // stack of { album, index }
  nextTracks: [], // queue of { album, index }
  tracksTimer: null, // the current time of the music being played (only changed on exit)
  playFromStart: false, // if true, when opeing the app, the latest music played will start from the start, else if starts from the tracksTimer
  isPlayingMusic: false, // is the audio being played
  currentAlbum: null, // the album thats currently opened
  volume: 0.8, // audio volume
  sfxVolume: 0.8, // audio volume
  theme: { dark: "", light: "light" }, // app's theme
  themeMode: "dark", // dark or light
  getSystemTheme: false, // if true, the theme will be set to the system theme
  showFeatures: true, // shows features from a track, if false hides this: (feat: someone)
  maxSavedTracks: 50,
  controller: {
    cursorSensitifity: 20,
    keepMouseBetweenBounds: true,
    scrollSensitifity: 20,
    invertScroll: false,
    cursorAceleration: 1.2,
  },
  favourites: {
    openAlbum: true,
    startPlaying: true,
  },
  algorithm: {
    onlyPlayCopyrightFreeSongs: false,
    preferAlbumsOverSingleTracks: 0.5,
    preferAuthor: 0.3,
    preferGenre: 0.2,
    preferYear: 0.1,
    preferLabel: 0.1,
    ratingImportance: 0.6,
  },
};

const funcsSaveFilePath = path.join(__dirname, "../electron/data/func.json");
