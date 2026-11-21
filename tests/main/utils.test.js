const { test, describe } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const {
  rgbToHex,
  toScreenCoords,
  isMiniPlayerPath,
  getOpenedWindowPath,
  extractVarFromBlock,
  getPlacementInfo,
  changePlacementInfo,
  toggleHidden,
  _state,
} = require("../../electron/main");

describe("Main Process - Utils & Geometry", () => {
  describe("rgbToHex", () => {
    test("converts { _r, _g, _b } object to hex string", () => {
      assert.strictEqual(rgbToHex({ _r: 255, _g: 0, _b: 128 }), "#FF0080");
      assert.strictEqual(rgbToHex({ _r: 0, _g: 0, _b: 0 }), "#000000");
      assert.strictEqual(rgbToHex({ _r: 255, _g: 255, _b: 255 }), "#FFFFFF");
    });

    test("converts [r, g, b] array to hex string", () => {
      assert.strictEqual(rgbToHex([0, 128, 255]), "#0080FF");
      assert.strictEqual(rgbToHex([50, 100, 150]), "#326496");
    });

    test("converts comma-separated RGB string to hex string", () => {
      assert.strictEqual(rgbToHex("255, 99, 71"), "#FF6347");
      assert.strictEqual(rgbToHex("  0 , 255 , 0 "), "#00FF00");
    });

    test("converts comma-separated RGBA string to hex string (ignores alpha)", () => {
      assert.strictEqual(rgbToHex("120, 200, 50, 255"), "#78C832");
    });
  });

  describe("toScreenCoords", () => {
    test("converts relative coords to absolute screen coords using window bounds", () => {
      const mockWin = {
        getBounds: () => ({ x: 150, y: 250, width: 800, height: 600 }),
      };

      const coords = toScreenCoords(mockWin, 50, 75);
      assert.deepStrictEqual(coords, { x: 200, y: 325 });
    });

    test("handles non-integer and default zero coordinates", () => {
      const mockWin = {
        getBounds: () => ({ x: 100, y: 100, width: 800, height: 600 }),
      };

      const coords = toScreenCoords(mockWin, "25.6", null);
      assert.deepStrictEqual(coords, { x: 126, y: 100 });
    });
  });

  describe("isMiniPlayerPath", () => {
    test("returns true for miniPlayer.html path", () => {
      const miniPath = path.resolve(__dirname, "../../app/html/miniPlayer.html");
      assert.strictEqual(isMiniPlayerPath(miniPath), true);
    });

    test("returns false for other HTML paths", () => {
      assert.strictEqual(isMiniPlayerPath("/some/other/path.html"), false);
      assert.strictEqual(isMiniPlayerPath("settings.html"), false);
    });
  });

  describe("getOpenedWindowPath", () => {
    test("finds window path for registered window instance", () => {
      const openedWindows = _state.getOpenedWindows();
      const mockWin = { id: 1 };
      const winPath = "/path/to/window.html";

      openedWindows.set(winPath, mockWin);
      assert.strictEqual(getOpenedWindowPath(mockWin), winPath);

      openedWindows.delete(winPath);
    });

    test("returns null if window instance is not registered", () => {
      assert.strictEqual(getOpenedWindowPath({ id: 999 }), null);
    });
  });

  describe("extractVarFromBlock", () => {
    const cssBlock = `
[theme="pywal"] {
  --colorBlend: 0.75;
  --font: 'Helvetica Neue', sans-serif;
  --activeColor: #ff5500;
}
`;

    test("extracts value of existing CSS variable in block", () => {
      assert.strictEqual(extractVarFromBlock(cssBlock, "--colorBlend"), "0.75");
      assert.strictEqual(extractVarFromBlock(cssBlock, "--font"), "'Helvetica Neue', sans-serif");
      assert.strictEqual(extractVarFromBlock(cssBlock, "--activeColor"), "#ff5500");
    });

    test("returns null for non-existing CSS variable", () => {
      assert.strictEqual(extractVarFromBlock(cssBlock, "--missingVar"), null);
    });
  });

  describe("getPlacementInfo", () => {
    test("extracts disc, idx, and name from 'disc-idx title'", () => {
      const info = getPlacementInfo("1-05 Bohemian Rhapsody");
      assert.deepStrictEqual(info, {
        disc: 1,
        idx: 5,
        name: "Bohemian Rhapsody",
      });
    });

    test("extracts idx and name from 'idx title'", () => {
      const info = getPlacementInfo("02 Hotel California");
      assert.deepStrictEqual(info, {
        disc: null,
        idx: 2,
        name: "Hotel California",
      });
    });

    test("extracts idx and name from 'idx. title'", () => {
      const info = getPlacementInfo("3. Stairway to Heaven");
      assert.deepStrictEqual(info, {
        disc: null,
        idx: 3,
        name: "Stairway to Heaven",
      });
    });

    test("extracts idx and name from 'idx - title'", () => {
      const info = getPlacementInfo("04 - Imagine");
      assert.deepStrictEqual(info, {
        disc: null,
        idx: 4,
        name: "Imagine",
      });
    });

    test("handles titles without leading disc/track numbers", () => {
      const info = getPlacementInfo("Comfortably Numb");
      assert.deepStrictEqual(info, {
        disc: null,
        idx: null,
        name: "Comfortably Numb",
      });
    });
  });

  describe("changePlacementInfo", () => {
    test("updates placement info with disc and index", () => {
      // changePlacementInfo modifies disc/idx representation
      assert.doesNotThrow(() => {
        changePlacementInfo("/music/track", 2, 5, "My Song");
      });
    });

    test("updates placement info with index only", () => {
      assert.doesNotThrow(() => {
        changePlacementInfo("/music/track", null, 7, "My Song");
      });
    });
  });

  describe("toggleHidden", () => {
    test("adds 'hidden' class to element with existing classes when shouldHide is true", () => {
      const html = '<div id="player-container" class="active flex">';
      const result = toggleHidden(html, "player-container", true);
      assert.strictEqual(result, '<div id="player-container" class="active flex hidden">');
    });

    test("does not duplicate 'hidden' if already present when shouldHide is true", () => {
      const html = '<div id="player-container" class="active hidden flex">';
      const result = toggleHidden(html, "player-container", true);
      assert.strictEqual(result, '<div id="player-container" class="active hidden flex">');
    });

    test("removes 'hidden' class when shouldHide is false", () => {
      const html = '<div id="player-container" class="active hidden flex">';
      const result = toggleHidden(html, "player-container", false);
      assert.strictEqual(result, '<div id="player-container" class="active flex">');
    });

    test("adds class='hidden' to element without existing class attribute when shouldHide is true", () => {
      const html = '<div id="player-container" style="color: blue;">';
      const result = toggleHidden(html, "player-container", true);
      assert.strictEqual(result, '<div id="player-container" style="color: blue;" class="hidden">');
    });

    test("preserves element without class when shouldHide is false", () => {
      const html = '<div id="player-container" style="color: blue;">';
      const result = toggleHidden(html, "player-container", false);
      assert.strictEqual(result, '<div id="player-container" style="color: blue;">');
    });

    test("returns unchanged HTML if id is not found", () => {
      const html = '<div id="other-container" class="test"></div>';
      const result = toggleHidden(html, "player-container", true);
      assert.strictEqual(result, html);
    });
  });
});
