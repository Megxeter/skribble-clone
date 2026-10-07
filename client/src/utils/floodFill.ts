/**
 * Utility for performing 4-way flood fill on an HTML5 2D Canvas.
 * - Handles normalized coordinates converted to canvas pixels.
 * - Preserves shape outlines by stopping when pixel color difference exceeds tolerance.
 * - Correctly fills open areas to canvas bounds.
 * - Uses 32-bit packed integer stack for high performance and zero stack overflow risk.
 * - Returns true if a fill was performed, false if no-op or out of bounds.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseHexColor(color: string): RGBA {
  let hex = color.trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: 255,
    };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
      a: 255,
    };
  }
  return { r: 0, g: 0, b: 0, a: 255 };
}

export function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColorHex: string,
  width: number = 960,
  height: number = 540,
  tolerance: number = 32
): boolean {
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);

  if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) {
    return false;
  }

  const fillRgba = parseHexColor(fillColorHex);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const startIdx = (y0 * width + x0) * 4;
  const startA = data[startIdx + 3];
  // If alpha is 0 (transparent canvas), treat as white
  const startR = startA === 0 ? 255 : data[startIdx];
  const startG = startA === 0 ? 255 : data[startIdx + 1];
  const startB = startA === 0 ? 255 : data[startIdx + 2];

  // If start color already matches fill color within tolerance, nothing to do
  if (
    Math.abs(startR - fillRgba.r) <= 15 &&
    Math.abs(startG - fillRgba.g) <= 15 &&
    Math.abs(startB - fillRgba.b) <= 15
  ) {
    return false;
  }

  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const stack = new Int32Array(totalPixels);
  let stackPtr = 0;

  // Push start pixel
  stack[stackPtr++] = (y0 << 16) | x0;
  visited[y0 * width + x0] = 1;

  while (stackPtr > 0) {
    const coord = stack[--stackPtr];
    const cx = coord & 0xffff;
    const cy = coord >>> 16;
    const idx = (cy * width + cx) * 4;

    // Apply fill color
    data[idx] = fillRgba.r;
    data[idx + 1] = fillRgba.g;
    data[idx + 2] = fillRgba.b;
    data[idx + 3] = 255;

    // West
    if (cx > 0) {
      const nidx = cy * width + (cx - 1);
      if (!visited[nidx]) {
        const pidx = nidx * 4;
        const pa = data[pidx + 3];
        const pr = pa === 0 ? 255 : data[pidx];
        const pg = pa === 0 ? 255 : data[pidx + 1];
        const pb = pa === 0 ? 255 : data[pidx + 2];
        if (
          Math.abs(pr - startR) <= tolerance &&
          Math.abs(pg - startG) <= tolerance &&
          Math.abs(pb - startB) <= tolerance
        ) {
          visited[nidx] = 1;
          stack[stackPtr++] = (cy << 16) | (cx - 1);
        }
      }
    }

    // East
    if (cx < width - 1) {
      const nidx = cy * width + (cx + 1);
      if (!visited[nidx]) {
        const pidx = nidx * 4;
        const pa = data[pidx + 3];
        const pr = pa === 0 ? 255 : data[pidx];
        const pg = pa === 0 ? 255 : data[pidx + 1];
        const pb = pa === 0 ? 255 : data[pidx + 2];
        if (
          Math.abs(pr - startR) <= tolerance &&
          Math.abs(pg - startG) <= tolerance &&
          Math.abs(pb - startB) <= tolerance
        ) {
          visited[nidx] = 1;
          stack[stackPtr++] = (cy << 16) | (cx + 1);
        }
      }
    }

    // North
    if (cy > 0) {
      const nidx = (cy - 1) * width + cx;
      if (!visited[nidx]) {
        const pidx = nidx * 4;
        const pa = data[pidx + 3];
        const pr = pa === 0 ? 255 : data[pidx];
        const pg = pa === 0 ? 255 : data[pidx + 1];
        const pb = pa === 0 ? 255 : data[pidx + 2];
        if (
          Math.abs(pr - startR) <= tolerance &&
          Math.abs(pg - startG) <= tolerance &&
          Math.abs(pb - startB) <= tolerance
        ) {
          visited[nidx] = 1;
          stack[stackPtr++] = ((cy - 1) << 16) | cx;
        }
      }
    }

    // South
    if (cy < height - 1) {
      const nidx = (cy + 1) * width + cx;
      if (!visited[nidx]) {
        const pidx = nidx * 4;
        const pa = data[pidx + 3];
        const pr = pa === 0 ? 255 : data[pidx];
        const pg = pa === 0 ? 255 : data[pidx + 1];
        const pb = pa === 0 ? 255 : data[pidx + 2];
        if (
          Math.abs(pr - startR) <= tolerance &&
          Math.abs(pg - startG) <= tolerance &&
          Math.abs(pb - startB) <= tolerance
        ) {
          visited[nidx] = 1;
          stack[stackPtr++] = ((cy + 1) << 16) | cx;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return true;
}
