const clamp = (value: number) => Math.max(0, Math.min(1, value));
// Quintic easing has zero velocity and acceleration at both ends.
const smooth = (value: number) => { const t = clamp(value); return t ** 3 * (10 + t * (-15 + 6 * t)); };
const integratedSmooth = (t: number) => t ** 4 * (2.5 + t * (-3 + t));
const CAR_START = 4.5;
const SPIN_RAMP_SECONDS = .55;
export const HALLOWEEN_OPENING_SECONDS = 13;
export const HALLOWEEN_DRIVE_SECONDS = 2 / 1.2;
export const HALLOWEEN_DUST_SECONDS = 1.4;
const PIG_START = CAR_START + HALLOWEEN_DRIVE_SECONDS + 1;
const AMBIENT_START = PIG_START + HALLOWEEN_DRIVE_SECONDS + 4.5;
const CINEMATIC_END = PIG_START + HALLOWEEN_DRIVE_SECONDS + HALLOWEEN_DUST_SECONDS + .1;
const IMPACT = CAR_START + HALLOWEEN_DRIVE_SECONDS * (2 / 3);

/** Constant world speed. Perspective supplies the apparent acceleration. */
export function sampleHalloweenDrive(time: number): number {
  return clamp(time / HALLOWEEN_DRIVE_SECONDS);
}

/** A paused scene clock drives the whole sequence. No timers survive a closed tab. */
export function sampleHalloweenCinematic(elapsed: number, start = HALLOWEEN_OPENING_SECONDS) {
  const age = elapsed < start ? -1 : elapsed - start;
  const active = age >= 0 && age < CINEMATIC_END;
  const settled = age >= PIG_START + HALLOWEEN_DRIVE_SECONDS;
  const braking = clamp(age);
  const charging = Math.max(0, age - 1);
  const spinRamp = clamp(charging / SPIN_RAMP_SECONDS);
  // Integrate the same acceleration for each axis; angles never reverse or jump.
  const tumble = 41.52 * (SPIN_RAMP_SECONDS * integratedSmooth(spinRamp) + Math.max(0, charging - SPIN_RAMP_SECONDS));
  return {
    active,
    settled,
    age,
    approach: smooth(braking),
    burstOthers: active && age >= 1,
    growth: smooth(charging / 3),
    returning: active && settled,
    ambientDelay: Math.max(0, AMBIENT_START - age),
    // Retiming the existing trajectory preserves its direction and curvature.
    flightAdvance: braking - .98 * integratedSmooth(braking) + .02 * charging,
    impactFlightAdvance: .51 + .02 * (IMPACT - 1),
    // Integrate a 0.55-second velocity ramp from 0.48 to 42 radians/second.
    spin: .48 * Math.max(0, age) + tumble,
    spinX: tumble * .6,
    spinZ: tumble * .35,
    charge: active && age < IMPACT ? smooth(spinRamp) : 0,
    impactAge: age - IMPACT,
    carTime: age - CAR_START,
    pigTime: age - PIG_START,
  };
}
