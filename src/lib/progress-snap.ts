/** Snap a 0–100 progress value to the nearest 10% step. */
export function snapProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value / 10) * 10));
}

export function progressFromClientX(clientX: number, rect: DOMRect): number {
  if (rect.width <= 0) return 0;
  const ratio = (clientX - rect.left) / rect.width;
  return snapProgress(ratio * 100);
}
