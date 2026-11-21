const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");
const { createTempDir, cleanupTempDir, readJson } = require("../helpers/fixtures");
const {
  sanitizePathSegment,
  DownloadManager,
} = require("../../electron/subsonic-backend");

describe("Subsonic Backend - Downloader Engine & DownloadManager", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir("subsonic-dl-test-");
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test("sanitizePathSegment cleans illegal filesystem characters", () => {
    assert.strictEqual(sanitizePathSegment(""), "Unknown");
    assert.strictEqual(sanitizePathSegment(null), "Unknown");
    assert.strictEqual(sanitizePathSegment("AC/DC: Live"), "AC_DC_ Live");
    assert.strictEqual(sanitizePathSegment("What? * < > | "), "What_ _ _ _ _");
    assert.strictEqual(sanitizePathSegment("Ending with dots..."), "Ending with dots");
    assert.strictEqual(sanitizePathSegment("   Spaces around   "), "Spaces around");
  });

  test("DownloadManager constructor initializes default idle state", () => {
    const dm = new DownloadManager();
    const status = dm.getStatus();

    assert.strictEqual(status.status, "idle");
    assert.strictEqual(status.totalItems, 0);
    assert.strictEqual(status.downloadedTracks, 0);
    assert.strictEqual(status.skippedTracks, 0);
    assert.strictEqual(status.failedTracks, 0);
    assert.deepStrictEqual(status.log, []);
  });

  test("addLog formats timestamp and maintains maximum 200 log entries", () => {
    const dm = new DownloadManager();
    dm.addLog("First entry");
    assert.strictEqual(dm.state.log.length, 1);
    assert.ok(dm.state.log[0].includes("First entry"));

    // Push 250 log entries
    for (let i = 0; i < 250; i++) {
      dm.addLog(`Entry ${i}`);
    }
    assert.strictEqual(dm.state.log.length, 200);
    assert.ok(dm.state.log[199].includes("Entry 249"));
  });

  test("cancel sets cancelRequested flag when downloading or scanning", () => {
    const dm = new DownloadManager();
    assert.strictEqual(dm.cancel(), false); // idle cannot be cancelled

    dm.state.status = "downloading";
    assert.strictEqual(dm.cancel(), true);
    assert.strictEqual(dm.cancelRequested, true);
  });

  test("downloadFile streams body to temp file and renames atomically", async () => {
    const dm = new DownloadManager();
    const targetFile = path.join(tmpDir, "sample.txt");

    const mockFetch = async () => ({
      ok: true,
      body: Readable.from(["Hello ", "world", " from stream!"]),
    });

    await dm.downloadFile("http://fake/file", targetFile, mockFetch);
    assert.strictEqual(fs.existsSync(targetFile), true);
    assert.strictEqual(fs.readFileSync(targetFile, "utf8"), "Hello world from stream!");
  });

  test("downloadFile throws if fetch response is not ok", async () => {
    const dm = new DownloadManager();
    const targetFile = path.join(tmpDir, "failed.txt");

    const mockFetch = async () => ({
      ok: false,
      status: 404,
    });

    await assert.rejects(
      () => dm.downloadFile("http://fake/file", targetFile, mockFetch),
      /Failed to download file \(HTTP 404\)/,
    );
  });

  test("downloadCoverArt downloads image or handles errors gracefully", async () => {
    const dm = new DownloadManager();
    const coverPath = path.join(tmpDir, "cover.jpg");

    // Empty coverArtId returns false
    const resEmpty = await dm.downloadCoverArt({}, "", coverPath);
    assert.strictEqual(resEmpty, false);

    // Successful download
    const mockFetch = async () => ({
      ok: true,
      body: Readable.from([Buffer.from([0xff, 0xd8, 0xff, 0xe0])]),
    });
    const config = {
      serverUrl: "http://127.0.0.1:4533",
      user: "u",
      password: "p",
      fetch: mockFetch,
    };

    const resSuccess = await dm.downloadCoverArt(config, "cov-1", coverPath);
    assert.strictEqual(resSuccess, true);
    assert.strictEqual(fs.existsSync(coverPath), true);
  });

  test("downloadTrack skips existing non-empty file when forceOverwrite is false", async () => {
    const dm = new DownloadManager();
    const trackPath = path.join(tmpDir, "track.mp3");
    fs.writeFileSync(trackPath, "existing-audio-bytes");

    const config = { serverUrl: "http://fake", user: "u", password: "p" };
    const song = { id: "song-1", title: "My Song" };

    const result = await dm.downloadTrack(config, song, trackPath, false);
    assert.strictEqual(result, "skipped");
  });

  test("downloadTrack downloads file and falls back from download.view to stream.view", async () => {
    const dm = new DownloadManager();
    const trackPath = path.join(tmpDir, "track2.mp3");

    let downloadAttempts = [];
    const mockFetch = async (url) => {
      downloadAttempts.push(url);
      if (url.includes("download.view")) {
        return { ok: false, status: 500 };
      }
      return {
        ok: true,
        body: Readable.from(["audio-stream-content"]),
      };
    };

    const config = {
      serverUrl: "http://127.0.0.1:4533",
      user: "u",
      password: "p",
      fetch: mockFetch,
    };
    const song = { id: "song-2", title: "Fallback Song" };

    const result = await dm.downloadTrack(config, song, trackPath, true);
    assert.strictEqual(result, "downloaded");
    assert.strictEqual(downloadAttempts.length, 2);
    assert.ok(downloadAttempts[0].includes("download.view"));
    assert.ok(downloadAttempts[1].includes("stream.view"));
    assert.strictEqual(fs.readFileSync(trackPath, "utf8"), "audio-stream-content");
  });

  test("downloadSingleAlbum creates folder structure, downloads tracks, and writes reload.json", async () => {
    const dm = new DownloadManager();
    const destDir = path.join(tmpDir, "music-library");

    const mockFetch = async (url) => {
      if (url.includes("getAlbum.view")) {
        return {
          ok: true,
          json: async () => ({
            "subsonic-response": {
              status: "ok",
              album: {
                id: "album-99",
                name: "Test Album",
                artist: "Test Artist",
                year: 2025,
                genre: "Synthwave",
                coverArt: "cover-99",
                song: [
                  { id: "s-10", title: "Intro", track: 1, suffix: "mp3" },
                  { id: "s-11", title: "Outro", track: 2, suffix: "flac" },
                ],
              },
            },
          }),
        };
      }
      // Cover art & track stream
      return {
        ok: true,
        body: Readable.from(["mock-binary-data"]),
      };
    };

    const config = {
      serverUrl: "http://127.0.0.1:4533",
      user: "u",
      password: "p",
      fetch: mockFetch,
    };

    const result = await dm.downloadSingleAlbum("album-99", {
      config,
      destination: destDir,
      forceOverwrite: true,
    });

    assert.strictEqual(result.id, "album-99");
    assert.strictEqual(result.name, "Test Album");
    assert.strictEqual(result.artist, "Test Artist");
    assert.strictEqual(result.tracks, 2);

    const albumFolder = path.join(destDir, "Test Artist", "Test Album");
    assert.strictEqual(fs.existsSync(albumFolder), true);
    assert.strictEqual(fs.existsSync(path.join(albumFolder, "01 - Intro.mp3")), true);
    assert.strictEqual(fs.existsSync(path.join(albumFolder, "02 - Outro.flac")), true);
    assert.strictEqual(fs.existsSync(path.join(albumFolder, "cover.jpg")), true);

    const reloadJsonPath = path.join(albumFolder, "reload.json");
    assert.strictEqual(fs.existsSync(reloadJsonPath), true);
    const reloadData = readJson(reloadJsonPath);
    assert.strictEqual(reloadData.description.name, "Test Album");
    assert.strictEqual(reloadData.description.author, "Test Artist");
    assert.strictEqual(reloadData.description.year, "2025");
    assert.strictEqual(reloadData.trackList.length, 2);
  });

  test("downloadAll iterates all catalog albums and handles cancellation", async () => {
    const dm = new DownloadManager();
    const destDir = path.join(tmpDir, "full-download");

    let getAlbumCalls = 0;
    const mockFetch = async (url) => {
      if (url.includes("getAlbumList2.view")) {
        return {
          ok: true,
          json: async () => ({
            "subsonic-response": {
              status: "ok",
              albumList2: {
                album: [
                  { id: "alb-1", name: "Album 1", artist: "Art 1" },
                  { id: "alb-2", name: "Album 2", artist: "Art 2" },
                ],
              },
            },
          }),
        };
      }
      if (url.includes("getAlbum.view")) {
        getAlbumCalls++;
        return {
          ok: true,
          json: async () => ({
            "subsonic-response": {
              status: "ok",
              album: {
                id: "alb-x",
                name: "Alb",
                artist: "Art",
                song: [{ id: "s-1", title: "Song 1", track: 1 }],
              },
            },
          }),
        };
      }
      return {
        ok: true,
        body: Readable.from(["audio-data"]),
      };
    };

    const config = {
      serverUrl: "http://127.0.0.1:4533",
      user: "u",
      password: "p",
      fetch: mockFetch,
    };

    const promise = dm.downloadAll({ config, destination: destDir });
    // Cancel immediately
    dm.cancel();
    const finalStatus = await promise;

    assert.ok(["cancelled", "completed"].includes(finalStatus.status));
    assert.ok(finalStatus.finishedAt !== null);
  });
});
