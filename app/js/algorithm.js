async function playRandomSong() {
  settings.previousTracks = settings.previousTracks.slice(
    -settings.maxSavedTracks,
  );

  const clamper = 1 / Math.pow(settings.previousTracks.length, 4);
  const reducer = 2;

  settings.nextTracks = settings.nextTracks.slice(-settings.maxSavedTracks);

  let possibleSongs = songs.flatMap((album) =>
    album.tracks.map((track, index) => ({ album, track, index })),
  );

  // Filter copyright first
  if (settings.algorithm.onlyPlayCopyrightFreeSongs) {
    possibleSongs = possibleSongs.filter(
      (song) => song.album.info.description.copyrightFree,
    );
    console.log("Filtered copyright-free songs");
  }

  for (let i = settings.previousTracks.length - 1; i >= 0; --i) {
    console.log(settings.previousTracks[i].album.path, i);
  }

  const scoredSongs = possibleSongs.map((song) => {
    if (song.album.path === settings.currentPlayingAlbum.path)
      return { song, score: 0 };
    else {
      console.log(song.album.path, settings.currentPlayingAlbum.path);
    }

    let score = 1;
    const currentTrack =
      settings.currentPlayingAlbum &&
      settings.currentPlayingAlbum.tracks &&
      settings.currentPlayingAlbum.tracks[
        settings.currentPlayingAlbum.currTrack
      ];

    // Prefer similar attributes to the currently playing song
    if (currentTrack) {
      const currentDescription = settings.currentPlayingAlbum.info.description;
      const songDescription = song.album.info.description;

      if (currentDescription.artist !== songDescription.artist) {
        score *= 1 - settings.algorithm.authorImportance;
      }
      if (currentDescription.genre !== songDescription.genre) {
        score *= 1 - settings.algorithm.yearImportance;
      }
      if (currentDescription.year !== songDescription.year) {
        score *= 1 - settings.algorithm.yearImportance;
      }
      if (currentDescription.label !== songDescription.label) {
        score *= 1 - settings.algorithm.labelImportance;
      }
    }

    // Rating importance
    score +=
      song.album.info.description.rating * settings.algorithm.ratingImportance;

    // Reduce score for recently played songs
    // grath in some graths/previousTracksReduction.ggb
    for (let i = settings.previousTracks.length - 1; i >= 0; --i) {
      if (settings.previousTracks[i].album.path === song.album.path) {
        score *= 1 - reducer * clamper * Math.pow(i + 1, 4);
        break;
      }
    }

    return { song, score };
  });

  // Weighted random selection
  const totalScore = scoredSongs.reduce((sum, s) => sum + s.score, 0);
  let random = Math.random() * totalScore;
  let chosenSong = null;

  for (const scoredSong of scoredSongs) {
    if (scoredSong.score <= 0) continue;
    random -= scoredSong.score;
    if (random <= 0) {
      chosenSong = scoredSong.song;
      console.log(chosenSong, scoredSong.score);
      break;
    }
  }

  if (!chosenSong && scoredSongs.length > 0) {
    chosenSong =
      scoredSongs[Math.floor(Math.random() * scoredSongs.length)].song;
  }

  if (chosenSong) {
    const isAlbum =
      Math.random() <= settings.algorithm.preferAlbumsOverSingleTracks;
    if (isAlbum) {
      setNextTracksFromAlbum(chosenSong.album, 0);
      playTrack(0, chosenSong.album, { pushPrev: true });
    } else {
      playTrack(chosenSong.index, chosenSong.album, { pushPrev: true });
    }
  } else {
    console.warn(
      "No songs available to play based on the current algorithm settings.",
    );
  }
}
