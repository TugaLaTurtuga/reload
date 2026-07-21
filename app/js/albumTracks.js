(function (global) {
  function getAlbumTrackList(album) {
    if (Array.isArray(album?.info?.trackList)) return album.info.trackList;
    return [];
  }

  function getAlbumTrack(album, index) {
    return getAlbumTrackList(album)[index] || null;
  }

  function getAlbumTrackCount(album) {
    return getAlbumTrackList(album).length;
  }

  function getTrackInfo(title) {
    const match = title.match(
      /^(?:(\d+)-(\d+)|(\d+))\s*\.?\s*-?\s*(.+)$/i
    );

    if (!match) {
      return {
        disc: null,
        idx: null,
        name: title.trim(),
      };
    }

    return {
      disc: match[1] ? Number(match[1]) : null,
      idx: Number(match[2] ?? match[3]),
      name: match[4].trim(),
    };
  }


  global.getAlbumTrackList = getAlbumTrackList;
  global.getAlbumTrack = getAlbumTrack;
  global.getAlbumTrackCount = getAlbumTrackCount;
  global.getTrackInfo = getTrackInfo;
})(window);
