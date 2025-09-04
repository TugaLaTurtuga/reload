//// TODO: normalize the color and make a min max on the theme itself.

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

function changeBackGroundColorFromNewAlbum(color) {
  const bg2 = getCSSVarRGB("--bg-2");
  const colorgepper = 0.5;

  let normalizedColor = [0, 0, 0];
  let r = parseInt(color.substr(1, 2), 16);
  let g = parseInt(color.substr(3, 2), 16);
  let b = parseInt(color.substr(5, 2), 16);

  // Assume color is in hex format: #rrggbb
  if (color && color.startsWith("#") && color.length === 7) {
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
  } else if (color && color.startsWith("rgb")) {
    // Assume color is in rgb(r,g,b) or rgb(r, g, b) format
    const match = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (match) {
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
    }
  }

  // Interpolate between bg2 (when colorgepper=0) and original rgb (when colorgepper=1)
  const finalR = Math.round(bg2[0] * (1 - colorgepper) + r * colorgepper);
  const finalG = Math.round(bg2[1] * (1 - colorgepper) + g * colorgepper);
  const finalB = Math.round(bg2[2] * (1 - colorgepper) + b * colorgepper);

  color = `rgb(
      ${Math.max(0, Math.min(255, finalR))},
      ${Math.max(0, Math.min(255, finalG))},
      ${Math.max(0, Math.min(255, finalB))}
    )`;
  changeBackgroundGradient(color);
}

function changeBackgroundGradient(color) {
  background.style.setProperty("--backgroundColor", color);
}
