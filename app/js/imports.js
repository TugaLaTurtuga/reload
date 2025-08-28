const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

function easeInOut(t) {
    return t < 0.5
        ? 2 * t * t
        : -1 + (4 - 2 * t) * t;
}
 
function easeIn(t) {
    return t * t;
}

function easeOut(t) {
    return t * (2 - t);
}

// DOM Elements
const audioPlayer = document.getElementById('audio-player')
let audioSources = null; // go to starter.js to see what this is
let audioSource = null;
const playPauseButton = document.getElementById('play-pause-button');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const volumeSlider = document.getElementById('volume-slider');
const muteButton = document.getElementById('mute-button');
const nowPlayingTitleWrapper = document.getElementById("now-playing-title-wrapper");
const nowPlayingTitle = document.getElementById('now-playing-title');
const nowPlayingArtistWrapper = document.getElementById("now-playing-artist-wrapper");
const nowPlayingArtist = document.getElementById('now-playing-artist');
const nowPlayingArtSmall = document.getElementById('now-playing-art-small');
const albumsSection = document.getElementById('albums-section');
const loading = document.getElementById('loading');
const navItems = document.querySelectorAll('.nav-item');
const libraryContainer = document.getElementById('library-container');
const playerContainer = document.getElementById('player-container');
const backButton = document.getElementById('back-button');
const editButton = document.getElementById('edit-button');
const albumArt = document.getElementById('album-art');
const albumTitle = document.getElementById('album-title');
const albumArtist = document.getElementById('album-artist');
const albumYear = document.getElementById('album-year');
const albumGenre = document.getElementById('album-genre');
const albumDescription = document.getElementById('album-description');
const trackList = document.getElementById('track-list');
const background = document.getElementById('app');
const mainContent = document.getElementById('main-content');

// App State
let songs = [];                   // the fetched albums/comps/eps/singles
let songsMap = new Map()
let jsonWatchers = new Map(); // Store file watchers
