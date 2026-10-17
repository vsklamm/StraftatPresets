import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { WeaponMix } from "../app/weapon-mix";

test("weapon atmospheres filter unknown assets, order by weight and leave their input unchanged", () => {
  const weapons = [
    { name: "Katana", weight: 1 },
    { name: "Unknown weapon", weight: 200 },
    { name: "AK", weight: 100 },
    { name: "Taser", weight: 25 },
  ];
  Object.freeze(weapons);
  for (const variant of ["randomized", "swapper"] as const) {
    const html = renderToStaticMarkup(createElement(WeaponMix, { weapons, variant }));
    const images = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(images, ["/weapons/256/ak.webp?v=norm7", "/weapons/256/taser.webp?v=norm7", "/weapons/256/katana.webp?v=norm7"]);
  }
  assert.deepEqual(weapons.map((weapon) => weapon.name), ["Katana", "Unknown weapon", "AK", "Taser"]);
});
