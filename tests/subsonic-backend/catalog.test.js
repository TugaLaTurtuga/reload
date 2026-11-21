const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  fetchAllAlbumSummaries,
  fetchAlbumDetails,
  listAllAlbumsAndSingles,
} = require("../../electron/subsonic-backend");

describe("Subsonic Backend - Catalog Retrieval", () => {
  test("fetchAllAlbumSummaries handles pagination until list ends", async () => {
    let callCount = 0;
    const mockFetch = async (url) => {
      callCount++;
      const u = new URL(url);
      const offset = parseInt(u.searchParams.get("offset") || "0", 10);

      // Return 500 items on first page, 2 items on second page
      let albums = [];
      if (offset === 0) {
        albums = Array.from({ length: 500 }, (_, i) => ({
          id: `alb-${i}`,
          name: `Album ${i}`,
          artist: "Artist A",
        }));
      } else if (offset === 500) {
        albums = [
          { id: "alb-500", name: "Album 500", artist: "Artist B" },
          { id: "alb-501", name: "Album 501", artist: "Artist B" },
        ];
      }

      return {
        ok: true,
        json: async () => ({
          "subsonic-response": {
            status: "ok",
            albumList2: { album: albums },
          },
        }),
      };
    };

    const config = {
      serverUrl: "http://127.0.0.1:4533",
      user: "u",
      password: "p",
      fetch: mockFetch,
    };

    const summaries = await fetchAllAlbumSummaries(config);
    assert.strictEqual(summaries.length, 502);
    assert.strictEqual(callCount, 2);
  });

  test("fetchAllAlbumSummaries handles single album response object (not array)", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        "subsonic-response": {
          status: "ok",
          albumList2: {
            album: { id: "alb-single", name: "Solo Album", artist: "Artist X" },
          },
        },
      }),
    });

    const config = {
      serverUrl: "http://127.0.0.1:4533",
      user: "u",
      password: "p",
      fetch: mockFetch,
    };

    const summaries = await fetchAllAlbumSummaries(config);
    assert.strictEqual(summaries.length, 1);
    assert.strictEqual(summaries[0].id, "alb-single");
  });

  test("fetchAlbumDetails returns detailed metadata and tracklist", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        "subsonic-response": {
          status: "ok",
          album: {
            id: "alb-123",
            name: "Masterpiece",
            artist: "Legend",
            artistId: "art-1",
            coverArt: "cov-123",
            duration: 600,
            year: 2024,
            genre: "Rock",
            song: [
              { id: "s-1", title: "Track 1", track: 1, duration: 300 },
              { id: "s-2", title: "Track 2", track: 2, duration: 300 },
            ],
          },
        },
      }),
    });

    const config = {
      serverUrl: "http://127.0.0.1:4533",
      user: "u",
      password: "p",
      fetch: mockFetch,
    };

    const details = await fetchAlbumDetails("alb-123", config);
    assert.strictEqual(details.id, "alb-123");
    assert.strictEqual(details.name, "Masterpiece");
    assert.strictEqual(details.artist, "Legend");
    assert.strictEqual(details.songCount, 2);
    assert.strictEqual(details.isAlbum, true);
    assert.strictEqual(details.isSingle, false);
    assert.strictEqual(details.songs.length, 2);
  });

  test("fetchAlbumDetails identifies single track release as isSingle", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        "subsonic-response": {
          status: "ok",
          album: {
            id: "single-1",
            name: "Hit Song",
            artist: "Star",
            song: [{ id: "s-1", title: "Hit Song", track: 1 }],
          },
        },
      }),
    });

    const config = {
      serverUrl: "http://127.0.0.1:4533",
      user: "u",
      password: "p",
      fetch: mockFetch,
    };

    const details = await fetchAlbumDetails("single-1", config);
    assert.strictEqual(details.songCount, 1);
    assert.strictEqual(details.isAlbum, false);
    assert.strictEqual(details.isSingle, true);
  });

  test("fetchAlbumDetails throws if album is not found", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        "subsonic-response": {
          status: "ok",
        },
      }),
    });

    const config = {
      serverUrl: "http://127.0.0.1:4533",
      user: "u",
      password: "p",
      fetch: mockFetch,
    };

    await assert.rejects(
      () => fetchAlbumDetails("nonexistent", config),
      /Album with ID nonexistent not found/,
    );
  });

  test("listAllAlbumsAndSingles partitions items into albums and singles correctly", async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        "subsonic-response": {
          status: "ok",
          albumList2: {
            album: [
              { id: "a1", name: "Album 1", artist: "Artist 1", songCount: 10 },
              { id: "s1", name: "Single 1", artist: "Artist 2", songCount: 1 },
              { id: "s2", name: "Single 2", artist: "Artist 3", albumType: "single", songCount: 2 },
            ],
          },
        },
      }),
    });

    const config = {
      serverUrl: "http://127.0.0.1:4533",
      user: "u",
      password: "p",
      fetch: mockFetch,
    };

    const catalog = await listAllAlbumsAndSingles(config);
    assert.strictEqual(catalog.total, 3);
    assert.strictEqual(catalog.albums.length, 1);
    assert.strictEqual(catalog.albums[0].id, "a1");
    assert.strictEqual(catalog.singles.length, 2);
    assert.deepStrictEqual(catalog.singles.map((s) => s.id), ["s1", "s2"]);
  });
});
