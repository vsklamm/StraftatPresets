import assert from "node:assert/strict";
import test from "node:test";
import { sampleHalloweenCinematic, sampleHalloweenDrive } from "../src/seasonal/halloween/cinematic";

test("the opening allows the car scene after thirteen seconds of flying grenades", () => {
  assert.equal(sampleHalloweenCinematic(12.99).active, false);
  assert.equal(sampleHalloweenCinematic(13).active, true);
  assert.equal(sampleHalloweenCinematic(13).age, 0);
});

test("the drive is twenty percent faster and Cochin enters one second after the car exits", () => {
  assert.ok(Math.abs(sampleHalloweenDrive(1) - .6) < .00001);
  assert.ok(Math.abs(sampleHalloweenCinematic(19.166666666666668).pigTime + 1) < .00001);
  assert.ok(sampleHalloweenCinematic(20.16).pigTime < 0);
  assert.ok(sampleHalloweenCinematic(20.17).pigTime > 0);
  const impact = sampleHalloweenCinematic(18.61111111111111);
  assert.ok(Math.abs(impact.impactAge) < .00001);
  assert.ok(Math.abs(sampleHalloweenDrive(impact.carTime) - 2 / 3) < .00001);
});

test("a flying pumpkin settles, charges for several seconds, then bursts into pulp before Cochin follows", () => {
  assert.equal(sampleHalloweenCinematic(12.99).active, false);
  const entrance = sampleHalloweenCinematic(13.6);
  assert.equal(entrance.active, true);
  assert.ok(entrance.approach > 0 && entrance.approach < 1);
  const anticipation = sampleHalloweenCinematic(16);
  assert.equal(anticipation.approach, 1);
  assert.ok(anticipation.impactAge < 0);
  assert.ok(anticipation.charge > .5);
  assert.ok(anticipation.carTime < 0);
  assert.ok(anticipation.pigTime < 0);
  const nearExplosion = sampleHalloweenCinematic(17.4);
  assert.ok(nearExplosion.charge > .75);
  assert.ok(nearExplosion.carTime < 0);
  const impact = sampleHalloweenCinematic(19.4);
  assert.ok(impact.impactAge > 0);
  assert.equal(impact.charge, 0);
  const follow = sampleHalloweenCinematic(20.9);
  assert.ok(follow.carTime > 2);
  assert.ok(follow.pigTime > 0);
  assert.equal(sampleHalloweenCinematic(24).active, false);
});

test("the car and Cochin cover equal world distances in equal time, including at impact", () => {
  assert.equal(sampleHalloweenDrive(0), 0);
  assert.equal(sampleHalloweenDrive(5 / 3), 1);
  assert.equal(sampleHalloweenDrive(5 / 6), .5);
  for (const time of [.2, .6, 1, 1.4]) {
    assert.ok(Math.abs(sampleHalloweenDrive(time + .2) - sampleHalloweenDrive(time) - .12) < .00001);
  }
  const car = sampleHalloweenCinematic(18.1);
  const pig = sampleHalloweenCinematic(20.766666666666666);
  assert.ok(Math.abs(sampleHalloweenDrive(car.carTime) - sampleHalloweenDrive(pig.pigTime)) < .00001);
});

test("braking preserves the original path and retains a tiny forward drift during the spin", () => {
  const start = sampleHalloweenCinematic(13);
  const entering = sampleHalloweenCinematic(13.001);
  assert.equal(start.approach, 0);
  assert.equal(start.flightAdvance, 0);
  assert.ok(Math.abs(entering.flightAdvance / .001 - 1) < .002);
  const settling = sampleHalloweenCinematic(13.999);
  const settled = sampleHalloweenCinematic(14);
  assert.ok(Math.abs((settled.flightAdvance - settling.flightAdvance) / .001 - .02) < .001);
  assert.equal(settled.approach, 1);
  assert.equal(settled.flightAdvance, .51);
  assert.equal(sampleHalloweenCinematic(15).flightAdvance, .53);
  for (let step = 0; step < 10; step++) {
    const time = 13 + step / 10;
    assert.ok(sampleHalloweenCinematic(time + .1).flightAdvance > sampleHalloweenCinematic(time).flightAdvance);
  }
});

test("spin accelerates smoothly to 42 radians per second within 0.55 seconds, before the car enters", () => {
  const speedAt = (time: number) => (sampleHalloweenCinematic(time + .0001).spin - sampleHalloweenCinematic(time).spin) / .0001;
  assert.ok(Math.abs(speedAt(14) - .48) < .001);
  const midway = speedAt(14.275);
  assert.ok(Math.abs(midway - 21.24) < .02);
  assert.ok(speedAt(14.1) < midway);
  assert.ok(speedAt(14.45) > midway);
  assert.ok(Math.abs(speedAt(14.5499) - speedAt(14.55)) < .001);
  const spinning = sampleHalloweenCinematic(14.55);
  assert.ok(Math.abs(spinning.charge - 1) < .00001);
  assert.ok(spinning.carTime < 0);
  assert.ok(Math.abs(speedAt(14.55) - 42) < .001);
  assert.ok(Math.abs(speedAt(17.5) - 42) < .001);
});

test("the charging pumpkin tumbles forward on all axes and its shake follows spin acceleration", () => {
  const start = sampleHalloweenCinematic(14);
  assert.equal(start.spinX, 0);
  assert.equal(start.spinZ, 0);
  assert.equal(start.charge, 0);
  for (const time of [14.1, 14.275, 14.45, 14.55, 15, 17]) {
    const pose = sampleHalloweenCinematic(time);
    const next = sampleHalloweenCinematic(time + .0001);
    assert.ok(next.spinX > pose.spinX);
    assert.ok(next.spin > pose.spin);
    assert.ok(next.spinZ > pose.spinZ);
    const speed = (next.spin - pose.spin) / .0001;
    assert.ok(Math.abs(pose.charge - (speed - .48) / 41.52) < .001);
  }
  const spinning = sampleHalloweenCinematic(14.55);
  const next = sampleHalloweenCinematic(14.5501);
  assert.ok(Math.abs((next.spinX - spinning.spinX) / .0001 - 24.912) < .001);
  assert.ok(Math.abs((next.spinZ - spinning.spinZ) / .0001 - 14.532) < .001);
  assert.equal(sampleHalloweenCinematic(18.7).charge, 0);
});

test("the surrounding burst and smooth enlargement start together after braking, with a longer spin before the car", () => {
  const braking = sampleHalloweenCinematic(13.9);
  assert.equal(braking.burstOthers, false);
  assert.equal(braking.growth, 0);
  const burst = sampleHalloweenCinematic(14);
  assert.equal(burst.burstOthers, true);
  assert.equal(burst.growth, 0);
  const growing = sampleHalloweenCinematic(15.5);
  assert.ok(growing.growth > 0 && growing.growth < 1);
  const enlarged = sampleHalloweenCinematic(17);
  assert.equal(enlarged.growth, 1);
  assert.ok(sampleHalloweenCinematic(17.49).carTime < 0);
  assert.equal(sampleHalloweenCinematic(17.5).carTime, 0);
  const impact = sampleHalloweenCinematic(18.61111111111111);
  assert.ok(Math.abs(impact.flightAdvance - impact.impactFlightAdvance) < .00001);
});

test("growth and braking ease into their boundaries, and the final dust fades after Cochin exits", () => {
  const sample = sampleHalloweenCinematic;
  assert.ok(sample(14.01).growth < .000001);
  assert.ok(1 - sample(16.99).growth < .000001);
  const incoming = (sample(13.01).flightAdvance - sample(13).flightAdvance) / .01;
  assert.ok(Math.abs(incoming - 1) < .00001);
  const outgoing = (sample(14).flightAdvance - sample(13.99).flightAdvance) / .01;
  assert.ok(Math.abs(outgoing - .02) < .00001);
  assert.equal(sample(21.8).returning, false);
  assert.equal(sample(21.9).returning, true);
  assert.equal(sample(21.9).active, true);
  assert.equal(sample(23.2).active, true);
  assert.equal(sample(23.4).active, false);
});

test("ambient flights wait four and a half seconds after Cochin exits", () => {
  assert.ok(Math.abs(sampleHalloweenCinematic(21.833333333333332).ambientDelay - 4.5) < .00001);
  assert.ok(Math.abs(sampleHalloweenCinematic(23.333333333333332).ambientDelay - 3) < .00001);
  const quiet = sampleHalloweenCinematic(26.32);
  assert.equal(quiet.active, false);
  assert.equal(quiet.settled, true);
  assert.ok(quiet.ambientDelay > 0);
  assert.equal(sampleHalloweenCinematic(26.34).ambientDelay, 0);
  assert.equal(sampleHalloweenCinematic(3660).ambientDelay, 0);
});

test("the car scene plays once, then stays in quiet ambient mode until the page reloads", () => {
  assert.equal(sampleHalloweenCinematic(21.8).settled, false);
  assert.equal(sampleHalloweenCinematic(21.9).settled, true);
  for (const elapsed of [24, 88, 94.4, 163, 3660]) {
    const stage = sampleHalloweenCinematic(elapsed);
    assert.equal(stage.active, false);
    assert.equal(stage.settled, true);
    assert.equal(stage.charge, 0);
    assert.equal(stage.burstOthers, false);
  }
  assert.equal(sampleHalloweenCinematic(0).settled, false);
  assert.equal(sampleHalloweenCinematic(13.6).active, true);
});

test("cameos ship with embedded paint, spinning wheel pivots, and no rig or decoder", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const [name, limit, meshCount] of [["zastava", 500_000, 5], ["cochin", 100_000, 1]] as const) {
    const file = await readFile(new URL(`../public/halloween/${name}.glb`, import.meta.url));
    assert.ok(file.length < limit, `${name} stays within its download budget`);
    const bytes = new Uint8Array(file);
    const jsonLength = new DataView(bytes.buffer).getUint32(12, true);
    const model = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    assert.equal(model.meshes.length, meshCount);
    assert.equal(model.images.length, 1);
    assert.equal(model.images[0].mimeType, "image/jpeg");
    assert.ok(Number.isInteger(model.images[0].bufferView));
    assert.ok(model.buffers.every((buffer: { uri?: string }) => !buffer.uri));
    assert.equal(model.skins?.length ?? 0, 0);
    assert.equal(model.animations?.length ?? 0, 0);
    assert.equal(model.extensionsRequired?.length ?? 0, 0);
    if (name === "zastava") {
      assert.equal(model.nodes.filter((node: { name: string }) => node.name.includes("Wheel")).length, 4);
    }
  }
});
