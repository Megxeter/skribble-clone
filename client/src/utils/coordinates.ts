/**
 * Converts mouse or touch event coordinates to normalized relative floats [0.0 - 1.0].
 * This guarantees resolution-independent drawing across responsive canvas dimensions.
 */
export function getNormalizedCoordinates(
  event: MouseEvent | Touch,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const rawX = event.clientX - rect.left;
  const rawY = event.clientY - rect.top;

  const x = Math.max(0, Math.min(1, rawX / rect.width));
  const y = Math.max(0, Math.min(1, rawY / rect.height));

  return {
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
  };
}

/**
 * Multiplies normalized coordinates [0.0 - 1.0] by canvas dimensions to obtain local pixel coordinates.
 */
export function getCanvasCoordinates(
  norm: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  return {
    x: norm.x * canvasWidth,
    y: norm.y * canvasHeight,
  };
}
