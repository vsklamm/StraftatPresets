import {
  ACESFilmicToneMapping, AdditiveBlending, BufferGeometry, Color, DirectionalLight, DynamicDrawUsage, Float32BufferAttribute, HemisphereLight,
  IcosahedronGeometry, InstancedMesh, LineBasicMaterial, LineSegments, Material, Mesh, MeshStandardMaterial,
  Object3D, PerspectiveCamera, Points, Scene, ShaderMaterial, Texture, TextureLoader, Vector3, WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { halloweenRenderBudget } from "./render-budget";
import { GLAND_BURST_RAYS, createGlandBurst } from "./burst";
import { createHalloweenFlight } from "./flight";
import { HALLOWEEN_DRIVE_SECONDS, HALLOWEEN_DUST_SECONDS, HALLOWEEN_OPENING_SECONDS, sampleHalloweenCinematic, sampleHalloweenDrive } from "./cinematic";

const MAX_PUMPKINS = 12;
const FRAME_MS = 1000 / 30;
const BURST_SECONDS = .9;

/** One canvas, shared model geometry, bounded particles, no React work per frame. */
export async function createHalloweenScene(canvas: HTMLCanvasElement, signal: AbortSignal, onUnavailable: () => void, onDetonate: () => void, onCinematic: (active: boolean) => void, onCharge: (strength: number, phase: number) => void) {
  const renderer = new WebGLRenderer({
    canvas, alpha: true, antialias: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, .1, 60);
  camera.position.z = 24;
  const fill = new HemisphereLight(0xffe7bb, 0x252e32, 2.4);
  scene.add(fill);
  const key = new DirectionalLight(0xffc47f, 3.5);
  key.position.set(-3, 5, 8);
  const rim = new DirectionalLight(0x839cb5, 2);
  rim.position.set(4, 2, -3);
  scene.add(key, rim);

  const instances: InstancedMesh[] = [];
  const geometries = new Set<import("three").BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  let disposed = false;
  let running = false;
  let frame = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let ambientElapsed = 0;
  let cinematic = false;
  let cinematicStarted = false;
  let impacted = false;
  let cameosRequested = false;
  let car: Object3D | null = null;
  let pig: Object3D | null = null;
  const wheels: Object3D[] = [];
  let cinematicStart = HALLOWEEN_OPENING_SECONDS;
  let width = 1;
  let height = 1;
  let count = MAX_PUMPKINS;
  let ambientCount = 2;
  let degraded = false;
  let slowFrames = 0;
  let warmupFrames = 30;

  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    canvas.removeEventListener("webglcontextlost", contextLost);
    signal.removeEventListener("abort", dispose);
    for (const mesh of instances) mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    onCinematic(false);
    renderer.dispose();
  }
  function unavailable() {
    dispose();
    onUnavailable();
  }
  function contextLost(event: Event) {
    event.preventDefault();
    unavailable();
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const budget = halloweenRenderBudget(width, height, window.devicePixelRatio || 1, navigator.hardwareConcurrency || 4);
    count = degraded ? Math.min(6, budget.count) : budget.count;
    ambientCount = budget.ambientCount;
    renderer.setPixelRatio(budget.pixelRatio * (degraded ? .7 : 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  canvas.addEventListener("webglcontextlost", contextLost);
  signal.addEventListener("abort", dispose, { once: true });
  if (signal.aborted) {
    dispose();
    throw new DOMException("Aborted", "AbortError");
  }

  async function loadModel(path: string) {
    const response = await fetch(path, { signal, priority: "low" });
    if (!response.ok) throw new Error("Halloween model unavailable");
    const loader = new GLTFLoader().register((parser) => {
      // Embedded images use img-src blob:, already allowed by the site policy.
      // ImageBitmapLoader fetches those blobs through the stricter connect-src.
      parser.textureLoader = new TextureLoader(parser.options.manager);
      return { name: "HalloweenEmbeddedImages" };
    });
    const model = await loader.parseAsync(await response.arrayBuffer(), "");
    model.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      if (disposed || signal.aborted) object.geometry.dispose();
      else geometries.add(object.geometry);
      for (const material of meshMaterials) {
        if (disposed || signal.aborted) material.dispose();
        else materials.add(material);
        for (const value of Object.values(material)) {
          if (!(value instanceof Texture)) continue;
          if (disposed || signal.aborted) value.dispose();
          else textures.add(value);
        }
      }
    });
    if (disposed || signal.aborted) throw new DOMException("Aborted", "AbortError");
    return model.scene;
  }

  try {
    const model = await loadModel("/halloween/gland-pumpkin.glb");
    model.updateMatrixWorld(true);
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      // The exported model is texture-free; every instance shares these resources.
      object.geometry.applyMatrix4(object.matrixWorld);
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      const mesh = new InstancedMesh(object.geometry, object.material, MAX_PUMPKINS);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      instances.push(mesh);
      scene.add(mesh);
    });
    // Parsing can complete after an unmount. Dispose the newly parsed resources too.
    if (disposed || signal.aborted) {
      for (const mesh of instances) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      throw new DOMException("Aborted", "AbortError");
    }
  } catch (error) {
    dispose();
    throw error;
  }

  const pumpkinMeshes = [...instances];
  // Native line segments stay hair-thin without cylinders, particles or extra draw calls.
  const rayGeometry = new BufferGeometry();
  const rayPositions = new Float32BufferAttribute(MAX_PUMPKINS * GLAND_BURST_RAYS * 6, 3).setUsage(DynamicDrawUsage);
  const rayColors = new Float32BufferAttribute(MAX_PUMPKINS * GLAND_BURST_RAYS * 6, 3).setUsage(DynamicDrawUsage);
  rayGeometry.setAttribute("position", rayPositions);
  rayGeometry.setAttribute("color", rayColors);
  rayGeometry.setDrawRange(0, 0);
  const rayMaterial = new LineBasicMaterial({
    color: 0xffffff, vertexColors: true, transparent: true, opacity: .8,
    blending: AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const rays = new LineSegments(rayGeometry, rayMaterial);
  rays.frustumCulled = false;
  geometries.add(rayGeometry);
  materials.add(rayMaterial);
  scene.add(rays);
  const directions = Array.from({ length: GLAND_BURST_RAYS }, () => {
    // Uniform random directions on a sphere, like the game's fragmentation rays.
    const angle = Math.random() * Math.PI * 2;
    const vertical = 2 * Math.random() - 1;
    const radial = Math.sqrt(1 - vertical * vertical);
    const length = 7.5;
    return [Math.cos(angle) * radial * length, vertical * length, Math.sin(angle) * radial * length];
  });
  const transform = new Object3D();
  const seeds = Array.from({ length: MAX_PUMPKINS }, (_, i) => ({
    phase: Math.random() * Math.PI * 2,
    cycle: 6 + (i * 7 % 5),
    scale: .52 + (i * 3 % 7) * .07,
    launchAt: i * .25 + Math.random() * .2,
    flight: createHalloweenFlight(Math.random),
    burst: createGlandBurst(onDetonate),
  }));
  const flightPoses = seeds.map(() => new Object3D());
  const ensembleMembers = seeds.map(() => false);
  const ensembleBurst = createGlandBurst(onDetonate);

  // Both actors share the same bounded, soft dust emitter. No texture downloads.
  const DUST_PER_ACTOR = 40;
  const DUST_COUNT = DUST_PER_ACTOR * 2;
  const dustGeometry = new BufferGeometry();
  const dustPositions = new Float32BufferAttribute(DUST_COUNT * 3, 3).setUsage(DynamicDrawUsage);
  const dustSizes = new Float32BufferAttribute(DUST_COUNT, 1).setUsage(DynamicDrawUsage);
  const dustFades = new Float32BufferAttribute(DUST_COUNT, 1).setUsage(DynamicDrawUsage);
  dustGeometry.setAttribute("position", dustPositions);
  dustGeometry.setAttribute("size", dustSizes);
  dustGeometry.setAttribute("fade", dustFades);
  const dustMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { projectionScale: { value: 1 } },
    vertexShader: `
      attribute float size;
      attribute float fade;
      uniform float projectionScale;
      varying float particleFade;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(size * projectionScale / max(1.0, -viewPosition.z), 1.0, 96.0);
        particleFade = fade;
      }`,
    fragmentShader: `
      varying float particleFade;
      void main() {
        float radius = length(gl_PointCoord - .5) * 2.0;
        float softEdge = 1.0 - smoothstep(.1, 1.0, radius);
        gl_FragColor = vec4(.72, .65, .53, softEdge * particleFade * .68);
      }`,
  });
  const dust = new Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  dust.visible = false;
  scene.add(dust);
  geometries.add(dustGeometry);
  materials.add(dustMaterial);
  const direction = new Vector3();
  const forward = new Vector3(0, 0, 1);
  const heroTarget = new Vector3(0, .3, 3);
  const heroRotation = new Vector3();
  const heroPose = new Object3D();
  let heroIndex = -1;
  let heroFlightAge = 0;
  let heroScale = 1;
  let heroPeakScale = 1;
  let waveResuming = false;

  // A compact splash of orange flesh and rind replaces the whole pumpkin at contact.
  const pulpGeometry = new IcosahedronGeometry(.12, 0);
  const pulpMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: .75, transparent: true, depthWrite: false });
  const pulp = new InstancedMesh(pulpGeometry, pulpMaterial, 28);
  pulp.instanceMatrix.setUsage(DynamicDrawUsage);
  pulp.frustumCulled = false;
  pulp.visible = false;
  for (let i = 0; i < pulp.count; i++) pulp.setColorAt(i, new Color(i % 3 ? 0xff8a12 : 0xffc34b));
  scene.add(pulp);
  instances.push(pulp);
  geometries.add(pulpGeometry);
  materials.add(pulpMaterial);

  function requestCameos() {
    if (cameosRequested) return;
    cameosRequested = true;
    // Optional assets arrive after the ordinary decoration is already running.
    // A failed cameo download leaves the pumpkin animation available.
    void Promise.all([loadModel("/halloween/zastava.glb"), loadModel("/halloween/cochin.glb")])
      .then(([carModel, pigModel]) => {
        if (disposed || signal.aborted) return;
        car = carModel;
        pig = pigModel;
        car.visible = pig.visible = false;
        car.traverse((object) => { if (object.name.includes("Wheel")) wheels.push(object); });
        scene.add(car, pig);
      }).catch(() => { /* The short scene is optional; shared cleanup owns any parsed resources. */ });
  }

  function drivePosition(time: number, slope: number, scale: number, target: Vector3) {
    const travel = sampleHalloweenDrive(time);
    const z = heroTarget.z - 32 + travel * 48;
    // The front bumper reaches the pumpkin at travel 2/3. Ground height is fixed.
    return target.set(heroTarget.x + (z - heroTarget.z) * slope, heroTarget.y - .3 - .85 * scale, z).addScaledVector(direction, -2.1 * scale);
  }

  function drawCameos(stage: ReturnType<typeof sampleHalloweenCinematic>, halfWidth: number) {
    if (!car || !pig) return;
    const slope = halfWidth * .075;
    direction.set(slope, 0, 1).normalize();
    const scale = Math.min(1.5, halfWidth * .23);
    for (const [actor, time, multiplier] of [[car, stage.carTime, 1], [pig, stage.pigTime, 1.5]] as const) {
      actor.visible = stage.active && time >= 0 && time < HALLOWEEN_DRIVE_SECONDS;
      if (!actor.visible) continue;
      drivePosition(time, slope, scale, actor.position);
      actor.quaternion.setFromUnitVectors(forward, direction);
      actor.scale.setScalar(scale * multiplier);
    }
    for (const wheel of wheels) wheel.rotation.x = -sampleHalloweenDrive(stage.carTime) * 100;
    // The two passes use identical particle ages, route samples and spreading.
    dust.visible = stage.active && stage.carTime >= 0 && stage.pigTime < HALLOWEEN_DRIVE_SECONDS + HALLOWEEN_DUST_SECONDS;
    if (!dust.visible) return;
    dustMaterial.uniforms.projectionScale.value = height * renderer.getPixelRatio() / (2 * Math.tan(Math.PI / 9));
    for (let i = 0; i < DUST_COUNT; i++) {
      // Keep the car's existing trail alive when the pig starts its identical pass.
      const time = i < DUST_PER_ACTOR ? stage.carTime : stage.pigTime;
      const particle = i % DUST_PER_ACTOR;
      const age = ((time + particle * HALLOWEEN_DUST_SECONDS / DUST_PER_ACTOR) % HALLOWEEN_DUST_SECONDS);
      const emittedAt = time - age;
      const alive = time >= 0 && emittedAt >= 0 && emittedAt < HALLOWEEN_DRIVE_SECONDS;
      drivePosition(emittedAt, slope, scale, transform.position);
      transform.position.addScaledVector(direction, -1.9 * scale);
      const scatter = Math.sin(particle * 12.9898);
      const billow = Math.sin(particle * 2.4 + age * 3) * age * .2;
      dustPositions.setXYZ(i, transform.position.x + scatter * age * 1.25 + billow,
        transform.position.y + age * .9 + Math.cos(particle * 7.1) * .16,
        transform.position.z + Math.cos(particle * 4.7) * age * 1.05 - billow);
      dustSizes.setX(i, (.9 + age * 2.4) * scale);
      dustFades.setX(i, alive ? (1 - age / HALLOWEEN_DUST_SECONDS) ** 1.4 : 0);
    }
    dustPositions.needsUpdate = dustSizes.needsUpdate = dustFades.needsUpdate = true;
  }

  function drawPulp(age: number, scale: number) {
    pulp.visible = age >= 0 && age < 1.15;
    if (!pulp.visible) return;
    pulpMaterial.opacity = Math.min(1, (1.15 - age) / .35);
    for (let i = 0; i < pulp.count; i++) {
      const angle = i * 2.39996;
      const speed = 2 + (i % 5) * .65;
      transform.position.copy(heroTarget).addScaledVector(direction, age * 5);
      transform.position.x += Math.cos(angle) * speed * age * scale;
      transform.position.y += (.5 + (i % 7) * .6) * age * scale - 5 * age * age;
      transform.position.z += Math.sin(angle) * speed * age * scale;
      transform.rotation.set(i + age * 5, angle + age * 3, age * 7);
      transform.scale.set(scale * (.6 + i % 3 * .4), scale * (i % 4 ? .7 : 2), scale * .6);
      transform.updateMatrix();
      pulp.setMatrixAt(i, transform.matrix);
    }
    pulp.instanceMatrix.needsUpdate = true;
  }

  function draw(delta: number) {
    const halfHeight = Math.tan(Math.PI / 9) * 24;
    const halfWidth = halfHeight * camera.aspect;
    if (elapsed > .5) requestCameos();
    // Wait for loaded actors and a naturally arriving grenade before starting once.
    if (!cinematicStarted && elapsed >= cinematicStart) cinematicStart = elapsed;
    let stage = sampleHalloweenCinematic(elapsed, cinematicStart);
    if (heroIndex >= 0 && (stage.returning || !stage.active) && !waveResuming) {
      // Schedule the quiet wave after a breather, using the same paused clock.
      for (let i = 0; i < seeds.length; i++) {
        seeds[i].launchAt = ambientElapsed + stage.ambientDelay + i * 2 + Math.random() * .2;
        seeds[i].flight = createHalloweenFlight(Math.random, true);
      }
      waveResuming = true;
    }
    if (!stage.active) heroIndex = -1;
    if (stage.active && heroIndex < 0 && car && pig) {
      let candidates = 0;
      for (let i = 0; i < Math.min(count, 6); i++) {
        const pose = flightPoses[i];
        const seed = seeds[i];
        const stopAge = ambientElapsed - seed.launchAt + stage.impactFlightAdvance;
        const stop = seed.flight(stopAge / (seed.cycle - BURST_SECONDS), halfWidth, halfHeight);
        const depth = (24 - stop.z) / 24;
        const nearCenter = pose.scale.x > .4 && stopAge < seed.cycle - BURST_SECONDS
          && Math.abs(stop.x) < halfWidth * depth * .36 && Math.abs(stop.y) < halfHeight * depth * .32;
        if (nearCenter && Math.random() < 1 / ++candidates) heroIndex = i;
      }
      if (heroIndex >= 0) {
        cinematicStarted = true;
        waveResuming = false;
        for (let i = 0; i < seeds.length; i++) ensembleMembers[i] = i < count && flightPoses[i].scale.x > 0;
        // Wait for an actually visible grenade, then give it the complete buildup.
        cinematicStart += stage.age;
        stage = sampleHalloweenCinematic(elapsed, cinematicStart);
        const pose = flightPoses[heroIndex];
        const seed = seeds[heroIndex];
        heroFlightAge = ambientElapsed - seed.launchAt;
        heroRotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z);
        heroScale = pose.scale.x;
        heroPeakScale = Math.max(heroScale * 1.35, Math.min(1.4, halfWidth * .3, heroScale * 1.8));
        const stop = seed.flight((heroFlightAge + stage.impactFlightAdvance) / (seed.cycle - BURST_SECONDS), halfWidth, halfHeight);
        heroTarget.set(stop.x, stop.y, stop.z);
      }
    }
    const active = stage.active && heroIndex >= 0 && car !== null && pig !== null;
    if (active !== cinematic) {
      cinematic = active;
      onCinematic(active);
    }
    if (!active) {
      ambientElapsed += delta;
      impacted = false;
    } else if (stage.impactAge >= 0 && !impacted) {
      impacted = true;
      onDetonate();
    }
    // Ordinary grenades keep moving until the coordinated burst, then its origins stay fixed.
    if (active && (!stage.burstOthers || stage.returning)) ambientElapsed += delta;
    const ensembleFade = ensembleBurst(!(active && stage.burstOthers), elapsed);
    onCharge(active ? stage.charge : 0, stage.spin);
    const visibleCount = stage.settled ? Math.min(count, ambientCount) : count;
    rays.visible = !stage.settled;
    let rayVertex = 0;
    for (let i = 0; i < visibleCount; i++) {
      const seed = seeds[i];
      // A crossing takes twice as long as the old trip to the center, keeping its speed gentle.
      const cycle = stage.settled ? seed.cycle * 2 : seed.cycle;
      if ((!active || stage.returning) && ambientElapsed - seed.launchAt >= cycle) {
        // Reuse this instance slot only after the whole pumpkin has left the viewport.
        seed.launchAt = stage.settled ? ambientElapsed : seed.launchAt + cycle;
        seed.flight = createHalloweenFlight(Math.random, stage.settled);
        seed.phase = Math.random() * Math.PI * 2;
      }
      const age = ambientElapsed - seed.launchAt;
      const flight = stage.settled ? cycle : cycle - BURST_SECONDS;
      const flying = active && !stage.returning ? ensembleMembers[i] : age >= 0 && age < flight;
      const fade = stage.settled ? 0 : active ? (i !== heroIndex && flying ? ensembleFade : 0) : seed.burst(age < flight, ambientElapsed);
      const t = Math.max(0, Math.min(age, flight));
      const { x, y, z, tiltX, tiltZ } = seed.flight(t / flight, halfWidth, halfHeight);
      const swell = stage.settled ? 1 : 1 + .08 * Math.max(0, t - flight + .6) / .6;
      transform.position.set(x, y, z);
      transform.rotation.set(tiltX + Math.sin(t * .37 + seed.phase) * .2, t * .48 + seed.phase, tiltZ + Math.sin(t * .32 + seed.phase) * .15);
      transform.scale.setScalar(flying ? seed.scale * swell : 0);
      if (!active) {
        flightPoses[i].copy(transform, false);
      }
      if (active && i === heroIndex && !stage.returning) {
        const flightTime = heroFlightAge + stage.flightAdvance;
        const position = seed.flight(flightTime / flight, halfWidth, halfHeight);
        transform.position.set(position.x, position.y, position.z);
        transform.scale.setScalar(stage.impactAge < 0 ? heroScale + (heroPeakScale - heroScale) * stage.growth : 0);
        transform.rotation.set(position.tiltX + Math.sin(flightTime * .37 + seed.phase) * .2 + stage.spinX,
          heroRotation.y + stage.spin, position.tiltZ + Math.sin(flightTime * .32 + seed.phase) * .15 + stage.spinZ);
        heroPose.copy(transform, false);
      } else {
        if (active && stage.burstOthers && !stage.returning) transform.scale.setScalar(0);
      }
      transform.updateMatrix();
      for (const mesh of pumpkinMeshes) mesh.setMatrixAt(i, transform.matrix);

      if (fade > 0) {
        const cos = Math.cos(seed.phase);
        const sin = Math.sin(seed.phase);
        for (let ray = 0; ray < GLAND_BURST_RAYS; ray++) {
          const [dx, dy, dz] = directions[ray];
          rayPositions.setXYZ(rayVertex, x, y, z);
          rayPositions.setXYZ(rayVertex + 1, x + dx * cos - dz * sin, y + dy, z + dx * sin + dz * cos);
          rayColors.setXYZ(rayVertex, fade, fade, fade);
          rayColors.setXYZ(rayVertex + 1, fade, fade, fade);
          rayVertex += 2;
        }
      }
    }
    drawCameos({ ...stage, active }, halfWidth);
    drawPulp(active ? stage.impactAge : -1, heroPeakScale);
    for (const mesh of pumpkinMeshes) {
      mesh.count = visibleCount;
      if (active && stage.approach === 1 && !stage.returning) {
        heroPose.updateMatrix();
        mesh.setMatrixAt(0, heroPose.matrix);
        mesh.count = stage.impactAge >= 0 ? 0 : 1;
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    rayGeometry.setDrawRange(0, rayVertex);
    if (rayVertex) {
      rayPositions.needsUpdate = true;
      rayColors.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  function tick(now: number) {
    if (!running || disposed) return;
    frame = requestAnimationFrame(tick);
    if (lastFrame && now - lastFrame < FRAME_MS - 1) return;
    const gap = lastFrame ? now - lastFrame : FRAME_MS;
    lastFrame = now;
    elapsed += Math.min(gap, 70) / 1000;
    const start = performance.now();
    try {
      draw(Math.min(gap, 70) / 1000);
    } catch {
      unavailable();
      return;
    }
    if (warmupFrames > 0) {
      warmupFrames--;
      return;
    }
    slowFrames = gap > 65 || performance.now() - start > 14 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames >= 45) {
      if (degraded) {
        unavailable();
      } else {
        degraded = true;
        slowFrames = 0;
        warmupFrames = 30;
        resize();
      }
    }
  }
  resizeObserver.observe(canvas);
  resize();
  return {
    setRunning(value: boolean) {
      if (disposed || running === value) return;
      running = value;
      lastFrame = 0;
      slowFrames = 0;
      cancelAnimationFrame(frame);
      if (!running) {
        cinematic = false;
        onCinematic(false);
      }
      if (running) frame = requestAnimationFrame(tick);
    },
    dispose,
  };
}
