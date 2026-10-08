# Halloween Gland Grenade

Source: [STRAFTAT-Public by Lemaitre Logiciels](https://github.com/Lemaitre-Logiciels/STRAFTAT-Public):

- `STRAFTAT/Assets/Weapons/GlandGrenade/SM_Gland_Grenade_02.fbx`: body and original pin.
- `STRAFTAT/Assets/Weapons/GlandGrenade/T_GralndGrenade_00_BC.png`: original rusty color variation, sampled into vertex colors and shifted toward pumpkin orange.
- `STRAFTAT/Assets/Character/Aboubi/StaticMeshes/SM_Aboubi00.fbx`: head surface sampled for the long nose and facial relief. The rest of the character is discarded.

Game-derived artwork is excluded from this repository's MIT license.

`gland-pumpkin.glb` combines a ribbed pumpkin body, orange grenade hardware, Aboubi facial relief, heavy eyelids, blank ivory eyes, and a crooked carved grin. No decimation, compression decoder, or runtime textures. Six meshes, 7,810 triangles, 205,648 bytes. `gland-pumpkin.webp` is a 512px Blender render for the static fallback.

Rebuild from the project root with Blender 5.2:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build-halloween-model.py -- ~/dev/STRAFTAT-Public
node --input-type=module -e 'import sharp from "sharp"; import os from "node:os"; import path from "node:path"; await sharp(path.join(os.tmpdir(), "straftat-gland-pumpkin.png")).webp({quality:85}).toFile("public/halloween/gland-pumpkin.webp")'
```

The conversion leaves the source checkout untouched. Blender writes the GLB here and an intermediate PNG into the system temporary directory.

## Preview and behavior

Run `npm run dev`, then visit `http://localhost:3000/` during October 10 through November 5 in the visitor's local calendar. The animation and its pause/play control appear only during that period, checked each minute. There are no URL overrides.

The main-page foreground overlay sits above the cards and header, below modal dialogs, and dynamically imports Three.js only when visible and permitted to animate. WebGL2 renders 12 instanced pumpkins (6 on narrow screens or devices reporting at most 4 logical cores), with a 30 fps cap, at most 900,000 drawing-buffer pixels, and 200 thin white rays per opening explosion, batched into one line draw call (at most 2,400 rays). Rays appear at full length in random directions in all three dimensions. Each opening burst starts at full brightness on its first rendered frame, then fades exponentially at rate 9 over a 0.5-second tail. The public game checkout supplies `LineFade.speed = 9` but omits `LineFade.cs`, so the fade curve is an approximation. The 200-ray count and white straight-line appearance reference the game’s Gland Grenade prefab and `PhysicsGrenade.RenderObject`; there are no orange sparks or shockwave rings. No shadow maps, postprocessing, physics engine, or animation library. Sustained slow rendering reduces the workload, then switches to the still if necessary.

The bottom-left icon button matches the project-information control on the right. It toggles pause/play with an accessible label and tooltip, and saves the preference in localStorage across reloads. Detonations add a 200 ms shake capped at 4 CSS pixels during the opening and cinematic. After Cochin exits, ambient pumpkins cross the screen without explosions, rays or shake. The header and preset list move independently so the overlay remains anchored to the viewport. Hidden tabs, offscreen canvases, and open modal dialogs stop the render loop and cancel any active shake; preset dialogs remain still. Reduced-motion CSS also suppresses shake immediately. Reduced motion and data-saving preferences use the still and do not fetch the 3D model. Failed or lost graphics contexts and failed asset downloads also use the still. The overlay never handles pointer input. The renderer, observers, animation frames, and GPU resources are disposed on unmount.

This is a WebGL2 effect. Browsers without usable WebGL2 keep the static decoration; there is no CPU 3D rasterizer. Change or remove its entry in `src/seasonal/registry.ts` to adjust the window or retire it. The effect's code and scoped styles live in `src/seasonal/halloween/`; the seasonal loader waits for the main preset view, page load, visible images and browser idle time before importing them. See `src/seasonal/README.md` for the loading lifecycle and adding another effect.

## Zastava and Cochin cinematic

Every ordinary grenade starts at full size beyond a random viewport edge. Each launch samples a new direction, straight or parabolic path, depth and tilt, then follows that path without rerolling it per frame. Flights use 6–10-second cycles, including the 0.9-second explosion interval. Initial launches are staggered instead of starting partway through a flight.

A roughly 10.33-second cinematic begins after at least 13 seconds of ordinary flight and plays once per page load. It selects a flying grenade whose existing trajectory is approaching the center. The grenade brakes for one second along that same trajectory, retaining 2% of its flight speed as a tiny forward drift. The other flying grenades continue until braking completes, then all burst together with the existing white rays and one shared shake. At that same moment the main grenade starts growing over three seconds, to as much as 1.8 times its incoming size, capped for the viewport and car. It accelerates to 42 radians per second (about 6.7 turns per second) in 0.55 seconds while the page shake builds to 4 CSS pixels. Pitch and roll accelerate with the main spin to make the pumpkin tumble around all three axes, with each angle advancing continuously in the same direction. Shake amplitude follows the normalized spin speed, and its frequency follows the accumulated rotation, so both rise with the spin. Braking, growth and spin acceleration use quintic curves with smooth endpoint velocities and accelerations; the grenade retains its original tilt and path. The page and model lighting retain their normal brightness, with no dimming, letterboxing or blur. After half a second at full size, the Zastava begins its pass (4.5 seconds after braking starts). It crosses the route in 1.67 seconds without steering or slowing and hits the grenade 1.11 seconds into that pass. The level route passes through the grenade's predicted position at impact and angles into the foreground; perspective changes the car's apparent speed and size. Contact replaces the pumpkin with a brief orange pulp and rind splash. Cochin starts the identical route and speed one second after the car exits. Both dust trails fade independently, so the pig's arrival does not erase the car's dust. The final dust fades naturally, then the scene stays quiet until 4.5 seconds after Cochin exits. The next wave starts entering from offscreen after that breather, with at most two grenades on desktop or one on narrow screens and devices reporting at most four logical cores. The ambient paths retain random straight or parabolic motion, depth and tilt, but finish fully beyond the opposite viewport edge. Crossings take 12–20 seconds to keep movement gentle. Slots are reused only after exiting; models and GPU buffers remain shared, so repeated flights do not accumulate objects. This quiet ambient animation continues without another car/pig scene until reload. The pig stays in a static riding pose; the car's four source wheels rotate.

The cameo assets load after the ordinary decoration begins. Failed or late cameo downloads keep the ordinary pumpkin animation running until a complete scene can start. One renderer owns the entire sequence. The car and pig share the same larger, denser, billowing dust animation: at most 80 procedural point sprites (40 per actor), capped at 96 drawing-buffer pixels each, in one draw call; the splash uses 28 instanced low-poly pieces in one draw call for 1.15 seconds. There are no particle textures, physics, extra canvas, or postprocessing pipeline. Only the selected pumpkin is drawn between the group explosion and the returning wave. Opening any modal, pausing, hiding the tab, or requesting reduced motion stops animation and cancels shake; all movement uses the same paused clock.

Source assets:

- `STRAFTAT/Assets/Environment/Props/SM_ZastavaCar_00.fbx`
- `STRAFTAT/Assets/Environment/Props/Materials/Textures/Zastava/T_Zastava_00_BC.jpg`
- `STRAFTAT/Assets/Character/NPCs/Cochin/SK_Cochin00.fbx`
- `STRAFTAT/Assets/Character/NPCs/Cochin/T_Cochin00_BC.png`

Rebuild with `/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build-halloween-cameos.py -- ~/dev/STRAFTAT-Public`. There is no mesh decimation. Paint textures are capped at 512 pixels and embedded as JPEG. Zastava has 13,463 triangles; Cochin has 1,008. Their GLBs together are about 460 KB. Blender also writes inspection renders into the system temporary directory.
