const { test, describe } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const {
  buildAuthParams,
  buildQueryString,
  subsonicRequest,
  pingServer,
} = require("../../electron/subsonic-backend");

describe("Subsonic Backend - API Client & Auth", () => {
  const dummyConfig = {
    serverUrl: "http://127.0.0.1:4533",
    user: "testuser",
    password: "testpassword",
    clientName: "ReloadTest",
    apiVersion: "1.16.1",
  };

  test("buildAuthParams generates valid salt, token, and auth parameters", () => {
    const auth = buildAuthParams(dummyConfig);

    assert.strictEqual(auth.u, "testuser");
    assert.strictEqual(auth.c, "ReloadTest");
    assert.strictEqual(auth.v, "1.16.1");
    assert.strictEqual(auth.f, "json");
    assert.ok(typeof auth.s === "string" && auth.s.length === 16); // 8 bytes in hex

    // Verify token matches md5(password + salt)
    const expectedToken = crypto
      .createHash("md5")
      .update(dummyConfig.password + auth.s)
      .digest("hex");
    assert.strictEqual(auth.t, expectedToken);
  });

  test("buildAuthParams uses default apiVersion and clientName if omitted", () => {
    const auth = buildAuthParams({ user: "u", password: "p" });
    assert.strictEqual(auth.v, "1.16.1");
    assert.strictEqual(auth.c, "Reload");
  });

  test("buildQueryString formats parameters correctly and skips null/undefined", () => {
    const qs = buildQueryString({
      foo: "bar",
      num: 42,
      empty: "",
      skipNull: null,
      skipUndef: undefined,
      bool: true,
    });

    const parsed = new URLSearchParams(qs);
    assert.strictEqual(parsed.get("foo"), "bar");
    assert.strictEqual(parsed.get("num"), "42");
    assert.strictEqual(parsed.get("empty"), "");
    assert.strictEqual(parsed.get("bool"), "true");
    assert.strictEqual(parsed.has("skipNull"), false);
    assert.strictEqual(parsed.has("skipUndef"), false);
  });

  test("subsonicRequest executes request with custom fetch and returns json", async () => {
    let requestedUrl = null;

    const mockFetch = async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          "subsonic-response": {
            status: "ok",
            version: "1.16.1",
            type: "navidrome",
          },
        }),
      };
    };

    const config = { ...dummyConfig, fetch: mockFetch };
    const res = await subsonicRequest("ping", {}, config);

    assert.ok(requestedUrl.startsWith("http://127.0.0.1:4533/rest/ping.view?"));
    assert.ok(requestedUrl.includes("u=testuser"));
    assert.ok(requestedUrl.includes("f=json"));
    assert.strictEqual(res["subsonic-response"].status, "ok");
    assert.strictEqual(res["subsonic-response"].type, "navidrome");
  });

  test("subsonicRequest throws on HTTP error status", async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    });

    const config = { ...dummyConfig, fetch: mockFetch };
    await assert.rejects(
      () => subsonicRequest("ping", {}, config),
      /Subsonic HTTP error: 502 Bad Gateway/,
    );
  });

  test("subsonicRequest throws on missing subsonic-response root", async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: "Not subsonic" }),
    });

    const config = { ...dummyConfig, fetch: mockFetch };
    await assert.rejects(
      () => subsonicRequest("ping", {}, config),
      /Invalid Subsonic response: missing subsonic-response root/,
    );
  });

  test("subsonicRequest throws on Subsonic API error (status: failed)", async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        "subsonic-response": {
          status: "failed",
          error: {
            code: 40,
            message: "Wrong username or password",
          },
        },
      }),
    });

    const config = { ...dummyConfig, fetch: mockFetch };
    await assert.rejects(
      () => subsonicRequest("ping", {}, config),
      /Subsonic API error \(40\): Wrong username or password/,
    );
  });

  test("pingServer returns status ok, version, type, and serverUrl", async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        "subsonic-response": {
          status: "ok",
          version: "1.16.1",
          type: "navidrome",
        },
      }),
    });

    const config = { ...dummyConfig, fetch: mockFetch };
    const ping = await pingServer(config);

    assert.deepStrictEqual(ping, {
      ok: true,
      version: "1.16.1",
      type: "navidrome",
      serverUrl: "http://127.0.0.1:4533",
    });
  });
});
