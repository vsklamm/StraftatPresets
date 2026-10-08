/** Pick once per launch. Coordinates adapt to the viewport without rerolling the path. */
export function createHalloweenFlight(random: () => number, flyThrough = false) {
  const edge = Math.floor(random() * 4);
  const alongEdge = random() * 1.6 - .8;
  const endX = random() * .7 - .35;
  const endY = random() * .6 - .3;
  const startZ = random() * 6 - 5;
  const endZ = random() * 6 - 2;
  const curved = random() < .65;
  const bendX = curved ? (random() - .5) * .35 : 0;
  const bendY = curved ? (random() - .5) * .65 : 0;
  const bendZ = curved ? (random() - .5) * 4 : 0;
  const tiltX = (random() - .5) * 1.3;
  const tiltZ = (random() - .5) * 1.4;

  return (progress: number, halfWidth: number, halfHeight: number) => {
    const t = Math.max(0, Math.min(1, progress));
    const startDepth = (24 - startZ) / 24;
    const endDepth = (24 - endZ) / 24;
    // Leave enough room for the entire rotating model, not just its center.
    const startX = edge < 2 ? (edge === 0 ? -1 : 1) * (halfWidth * startDepth + 2.5) : alongEdge * halfWidth * startDepth;
    const startY = edge >= 2 ? (edge === 2 ? -1 : 1) * (halfHeight * startDepth + 2.5) : alongEdge * halfHeight * startDepth;
    const targetX = flyThrough && edge < 2 ? (edge === 0 ? 1 : -1) * (halfWidth * endDepth + 2.5) : endX * halfWidth * endDepth;
    const targetY = flyThrough && edge >= 2 ? (edge === 2 ? 1 : -1) * (halfHeight * endDepth + 2.5) : endY * halfHeight * endDepth;
    const arc = 4 * t * (1 - t);
    return {
      x: startX * (1 - t) + targetX * t + bendX * halfWidth * arc,
      y: startY * (1 - t) + targetY * t + bendY * halfHeight * arc,
      z: startZ * (1 - t) + endZ * t + bendZ * arc,
      tiltX,
      tiltZ,
    };
  };
}
