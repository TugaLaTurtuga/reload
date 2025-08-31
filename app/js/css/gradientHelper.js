// TODO: normalize the color and make a min max on the theme itself.

function getCSSVarRGB(varName) {
  let value = getComputedStyle(document.body).getPropertyValue(varName).trim();

  // If it's already rgb()
  if (value.startsWith("rgb")) {
    const match = value.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (match) {
      return [
        parseInt(match[1], 10),
        parseInt(match[2], 10),
        parseInt(match[3], 10),
      ];
    }
  }

  // If it's hex (#rrggbb or #rgb)
  if (value.startsWith("#")) {
    if (value.length === 7) {
      return [
        parseInt(value.substr(1, 2), 16),
        parseInt(value.substr(3, 2), 16),
        parseInt(value.substr(5, 2), 16),
      ];
    } else if (value.length === 4) {
      return [
        parseInt(value[1] + value[1], 16),
        parseInt(value[2] + value[2], 16),
        parseInt(value[3] + value[3], 16),
      ];
    }
  }

  // Fallback → gray
  return [128, 128, 128];
}

function isLightBackground() {
  const rgb1 = getCSSVarRGB("--bg-1");
  const rgb2 = getCSSVarRGB("--bg-2");
  const total = rgb1[0] + rgb1[1] + rgb1[2] + rgb2[0] + rgb2[1] + rgb2[2];
  const threshold = 255 * 6 * 0.85;
  return total > threshold;
}

function changeBackGroundColorFromNewAlbum(color) {
  if (isLightBackground()) {
    // multiply the color x1.2
    let minColor = 160;
    let maxColor = 220;
    // Assume color is in hex format: #rrggbb
    if (color && color.startsWith("#") && color.length === 7) {
      let r = parseInt(color.substr(1, 2), 16);
      let g = parseInt(color.substr(3, 2), 16);
      let b = parseInt(color.substr(5, 2), 16);
      r = Math.max(minColor, Math.min(maxColor, Math.round(r * 1.2)));
      g = Math.max(minColor, Math.min(maxColor, Math.round(g * 1.2)));
      b = Math.max(minColor, Math.min(maxColor, Math.round(b * 1.2)));
      color = `rgb(${r},${g},${b})`;
    } else if (color && color.startsWith("rgb")) {
      // Assume color is in rgb(r,g,b) or rgb(r, g, b) format
      const match = color.match(
        /rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i,
      );
      if (match) {
        let r = parseInt(color.substr(1, 2), 16);
        let g = parseInt(color.substr(3, 2), 16);
        let b = parseInt(color.substr(5, 2), 16);
        r = Math.max(minColor, Math.min(maxColor, Math.round(r * 1.2)));
        g = Math.max(minColor, Math.min(maxColor, Math.round(g * 1.2)));
        b = Math.max(minColor, Math.min(maxColor, Math.round(b * 1.2)));
        color = `rgb(${r},${g},${b})`;
      }
    }
  }
  changeBackgroundGradient(color);
}

function changeBackgroundGradient(color) {
  background.style.setProperty("--backgroundColor", color);
}
