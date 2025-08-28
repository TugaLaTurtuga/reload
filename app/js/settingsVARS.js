// default settings
let settings = {
  currentPlayingAlbum: null,    // the album the music is currently playing from
  currentTrackIndex: -1,       // the place on the album where the track is
  previousTracks: [],         // stack of { album, index }
  nextTracks: [],            // queue of { album, index }
  tracksTimer: null,        // the current time of the music being played (only changed on exit)
  playFromStart: false,    // if true, when opeing the app, the latest music played will start from the start, else if starts from the tracksTimer
  isPlayingMusic: false,  // is the audio being played
  currentAlbum: null,    // the album thats currently opened
  volume: 0.8,          // audio volume
  theme: '',           // app's theme
  showFeatures: true, // shows features from a track, if false hides this: (feat: someone)
}
const nonMusicSettings = {theme: 0, showFeatures: 0};
