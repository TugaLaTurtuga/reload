async function tryGetComputedStyle(name) {
  const tries = 10;
  const timeout = 50;
  for (let i = 0; i < tries; i++) {
    const result = await getComputedStyle(document.body)
      .getPropertyValue(name)
      .trim();
    if (result) {
      return result;
    }

    if (i < tries - 1) {
      await new Promise((resolve) => setTimeout(resolve, timeout));
    }
  }
  return null; // fallback
}

async function getCSSVarRGB(varName) {
  let value = await tryGetComputedStyle(varName);

  if (!value) return null;

  // rgb() or rgba()
  if (value.startsWith("rgb")) {
    const match = value.match(
      /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i,
    );
    if (match) {
      return [
        parseInt(match[1], 10),
        parseInt(match[2], 10),
        parseInt(match[3], 10),
        match[4] !== undefined ? parseFloat(match[4]) : 1, // alpha if present
      ];
    }
  }

  // Hex formats: #rgb, #rrggbb, #rrggbbaa
  if (value.startsWith("#")) {
    if (value.length === 4) {
      return [
        parseInt(value[1] + value[1], 16),
        parseInt(value[2] + value[2], 16),
        parseInt(value[3] + value[3], 16),
        1,
      ];
    } else if (value.length === 7) {
      return [
        parseInt(value.substr(1, 2), 16),
        parseInt(value.substr(3, 2), 16),
        parseInt(value.substr(5, 2), 16),
        1,
      ];
    } else if (value.length === 9) {
      return [
        parseInt(value.substr(1, 2), 16),
        parseInt(value.substr(3, 2), 16),
        parseInt(value.substr(5, 2), 16),
        parseInt(value.substr(7, 2), 16) / 255,
      ];
    }
  }

  // fallback
  return Array(4).fill(0);
}

async function changeBackGroundColorFromNewAlbum(color) {
  const [bg2, colorgepper] = await Promise.all([
    getCSSVarRGB("--bg-2"),
    tryGetComputedStyle("--colorBlend"),
  ]);

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
  if (playerContainer) {
    playerContainer.style.setProperty("--backgroundColor", color);
  }
}

function changeBackgroundGradient(color) {
  background.style.setProperty("--backgroundColor", color);
}
