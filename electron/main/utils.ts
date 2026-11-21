export type WindowBounds = { x: number; y: number };

export interface WindowWithBounds {
  getBounds(): WindowBounds;
}

/** Convert renderer-relative coordinates to operating-system screen coordinates. */
export function toScreenCoords(
  window: WindowWithBounds,
  x: number | string | null | undefined,
  y: number | string | null | undefined,
): { x: number; y: number } {
  const bounds = window.getBounds();
  return {
    x: Math.round(bounds.x + Number(x || 0)),
    y: Math.round(bounds.y + Number(y || 0)),
  };
}

type RgbObject = { _r?: number; _g?: number; _b?: number };
type RgbInput = RgbObject | [number, number, number] | string;

/** Normalize Electron, array, and CSS RGB values to an uppercase hex color. */
export function rgbToHex(rgb: RgbInput): string {
  let { _r: r, _g: g, _b: b } = rgb as RgbObject;

  if (r === undefined || r === null) {
    if (Array.isArray(rgb)) {
      [r, g, b] = rgb;
    } else {
      const rgbParts = (rgb as string).split(",");
      [r, g, b] = rgbParts.slice(0, 3).map((part) => parseInt(part.trim(), 10));
    }
  }

  return `#${((1 << 24) + (r! << 16) + (g! << 8) + b!)
    .toString(16)
    .slice(1)
    .toUpperCase()}`;
}

/** Return a CSS custom property's value from a single CSS block. */
export function extractVarFromBlock(block: string, variableName: string): string | null {
  const regex = new RegExp(`${variableName}:\\s*([^;]+);`);
  const match = block.match(regex);
  return match ? match[1].trim() : null;
}
