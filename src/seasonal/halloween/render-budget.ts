export function halloweenRenderBudget(width: number, height: number, devicePixelRatio: number, cores: number) {
  return {
    count: width < 700 || cores <= 4 ? 6 : 12,
    ambientCount: width < 700 || cores <= 4 ? 1 : 2,
    pixelRatio: Math.min(devicePixelRatio, 1.25, Math.sqrt(900_000 / Math.max(1, width * height))),
  };
}
