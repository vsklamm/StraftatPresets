// Match the game during the opening and cinematic.
export const GLAND_BURST_RAYS = 200;

/** Sample with the scene's paused clock, so hidden tabs cannot skip or replay an impact. */
export function createGlandBurst(onDetonate: () => void) {
  let startedAt: number | null = null;
  return (flying: boolean, now: number): number => {
    if (flying) {
      startedAt = null;
      return 0;
    }
    if (startedAt === null) {
      startedAt = now;
      onDetonate();
    }
    const age = now - startedAt;
    // PhysicsGrenade configures LineFade.speed = 9, but the public checkout omits
    // LineFade.cs. This exponential fade approximates it with a short visible tail.
    return age < .5 ? Math.exp(-9 * age) : 0;
  };
}
