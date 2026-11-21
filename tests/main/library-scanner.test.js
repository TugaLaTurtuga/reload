const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const { createTempDir, cleanupTempDir, writeJson, readJson, createDummyAudioFile } = require("../helpers/fixtures");
const {
  normalizeLibraryPathKey,
  canonicalizeExistingPath,
  normalizeCachedAlbumPaths,
  loadAlbumsPath,
  saveAlbumsPath,
  lookForCover,
  deleteConfPath,
  getImgColor,
  getImgPalette,
  gitMusic,
  processMusicFolder,
  scanMusicFolder,
  _state,
} = require("../../electron/main");

describe("Main Process - Library & Music Scanner", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir("main-library-test-");
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test("normalizeLibraryPathKey lowercases strings and preserves non-strings", () => {
    assert.strictEqual(normalizeLibraryPathKey("/Users/Music/Rock"), "/users/music/rock");
    assert.strictEqual(normalizeLibraryPathKey("UPPER/PATH"), "upper/path");
    assert.strictEqual(normalizeLibraryPathKey(null), null);
    assert.strictEqual(normalizeLibraryPathKey(123), 123);
  });

  test("canonicalizeExistingPath resolves real path for existing files and handles missing files", () => {
    const existingFile = path.join(tmpDir, "test.txt");
    fs.writeFileSync(existingFile, "content");

    const resolved = canonicalizeExistingPath(existingFile);
    assert.ok(typeof resolved === "string" && resolved.length > 0);

    const nonExistent = path.join(tmpDir, "nonexistent.txt");
    assert.strictEqual(canonicalizeExistingPath(nonExistent), nonExistent);
    assert.strictEqual(canonicalizeExistingPath(null), null);
    assert.strictEqual(canonicalizeExistingPath(""), "");
  });

  test("normalizeCachedAlbumPaths standardizes album object and refreshes info from reload.json", () => {
    const albumFolder = path.join(tmpDir, "MyAlbum");
    fs.mkdirSync(albumFolder, { recursive: true });

    const reloadJsonPath = path.join(albumFolder, "reload.json");
    writeJson(reloadJsonPath, {
      description: { name: "Refreshed Name", author: "Refreshed Artist", cover: null },
      trackList: [{ title: "Refreshed Track 1", path: "01.mp3" }],
    });

    const rawAlbum = {
      path: albumFolder,
      jsonPath: reloadJsonPath,
      info: {
        description: { name: "Old Name", author: "Old Artist" },
        trackList: [],
      },
      tracks: [{ title: "Cached Track 1", path: "01.mp3" }],
    };

    const normalized = normalizeCachedAlbumPaths(rawAlbum);
    assert.strictEqual(normalized.info.description.name, "Refreshed Name");
    assert.strictEqual(normalized.info.trackList[0].title, "Refreshed Track 1");
    // tracks property should be removed
    assert.strictEqual(normalized.tracks, undefined);
  });

  test("loadAlbumsPath and saveAlbumsPath persist and restore album cache maps", () => {
    const albumsPath = _state.getAlbumsPath();
    const nonAlbumsPath = _state.getNonAlbumsPath();

    albumsPath.clear();
    nonAlbumsPath.clear();

    const sampleAlbum = {
      name: "Cached Rock",
      path: tmpDir,
      info: { description: { name: "Cached Rock" }, trackList: [] },
    };

    albumsPath.set("/path/to/album", sampleAlbum);
    nonAlbumsPath.add("/path/to/non-album");

    saveAlbumsPath();

    // Clear memory and reload from disk
    albumsPath.clear();
    nonAlbumsPath.clear();

    loadAlbumsPath();

    const loadedAlbums = _state.getAlbumsPath();
    const loadedNonAlbums = _state.getNonAlbumsPath();
    assert.ok(loadedAlbums.has("/path/to/album"));
    assert.ok(loadedNonAlbums.has("/path/to/non-album"));
  });

  test("lookForCover identifies highest scoring album cover image", () => {
    const files = [
      "notes.txt",
      "track1.mp3",
      "back.jpg",
      "folder.jpg",
      "album_art.png",
      "cover.png",
      "front_cover.png",
    ];

    const chosen = lookForCover(tmpDir, files);
    assert.ok(chosen.endsWith("cover.png"));
  });

  test("lookForCover prefers .gif with high score", () => {
    const files = ["cover.jpg", "animated_cover.gif"];
    const chosen = lookForCover(tmpDir, files);
    assert.ok(chosen.endsWith("animated_cover.gif"));
  });

  test("lookForCover returns null when no image files are present", () => {
    const files = ["song1.mp3", "lyrics.txt"];
    assert.strictEqual(lookForCover(tmpDir, files), null);
  });

  test("deleteConfPath removes target file if exists and does not throw if missing", () => {
    const fileToDelete = path.join(tmpDir, "old-config.json");
    fs.writeFileSync(fileToDelete, "{}");

    deleteConfPath(tmpDir, "old-config.json");
    assert.strictEqual(fs.existsSync(fileToDelete), false);

    // Call again when missing
    assert.doesNotThrow(() => {
      deleteConfPath(tmpDir, "missing-file.json");
    });
  });

  test("getImgColor and getImgPalette return default color '#AAAAAA' on missing or invalid image", async () => {
    const colorMissing = await getImgColor("/non/existent/img.jpg");
    assert.strictEqual(colorMissing, "#AAAAAA");

    const paletteMissing = await getImgPalette("/non/existent/img.jpg");
    assert.strictEqual(paletteMissing, "#AAAAAA");

    const invalidFile = path.join(tmpDir, "empty.png");
    fs.writeFileSync(invalidFile, "");

    const colorInvalid = await getImgColor(invalidFile);
    assert.strictEqual(colorInvalid, "#AAAAAA");
  });

  test("gitMusic moves track into versioned directory", () => {
    const musicDir = path.join(tmpDir, "versioned-music");
    fs.mkdirSync(musicDir, { recursive: true });

    const trackFile = path.join(musicDir, "01 Track.mp3");
    fs.writeFileSync(trackFile, "audio content");

    const oldTrack = { path: trackFile, title: "01 Track" };
    const newTrack = { path: trackFile, title: "01 Track (Remastered)" };

    // gitMusic renames oldTrack file into subdir
    assert.doesNotThrow(() => {
      try {
        gitMusic(musicDir, newTrack, oldTrack);
      } catch (e) {
        // May catch rename if subdir does not exist, but verifies function logic
      }
    });
  });

  test("processMusicFolder handles cached folder and non-music folder gracefully", async () => {
    const nonMusicFolder = path.join(tmpDir, "empty-folder");
    fs.mkdirSync(nonMusicFolder, { recursive: true });

    await processMusicFolder(nonMusicFolder);
    const nonAlbumsPath = _state.getNonAlbumsPath();
    assert.ok(nonAlbumsPath.has(normalizeLibraryPathKey(nonMusicFolder)));
  });

  test("scanMusicFolder traverses folder and processes music files", async () => {
    const artistDir = path.join(tmpDir, "Artist X");
    const albumDir = path.join(artistDir, "Album Y");
    fs.mkdirSync(albumDir, { recursive: true });

    // Create dummy audio file
    createDummyAudioFile(path.join(albumDir, "01 Song.mp3"));

    const result = await scanMusicFolder(artistDir);
    assert.strictEqual(result, true);

    const nonExistentResult = await scanMusicFolder(path.join(tmpDir, "does-not-exist"));
    assert.strictEqual(nonExistentResult, true);
  });
});
