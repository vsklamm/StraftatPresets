import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const rawDir = path.join(process.cwd(), "game-data", "raw-weapons");
const targetDir = path.join(process.cwd(), "public", "weapons");
const sourceDir = fs.existsSync(rawDir) ? rawDir : targetDir;
const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".webp"));

const ALIAS_MAP: Record<string, string[]> = {
  "the-katana.webp": ["katana.webp"],
  "godsword.webp": ["god-sword.webp"],
  "aaa-12.webp": ["aaa12.webp"],
  "flashlight.webp": ["flash-light.webp"],
  "hand-canon.webp": ["hand-cannon.webp"],
  "javal-mahmaerd.webp": ["jahval-mahmaerd.webp"],
};

interface WeaponAnalysis {
  filename: string;
  sourceFilePath: string;
  targetFilePath: string;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  bboxW: number;
  bboxH: number;
  aspect: number;
  rawAlpha: number;
  opticalMass: number;
}

async function analyzeWeapon(filename: string): Promise<WeaponAnalysis> {
  const sourceFilePath = path.join(sourceDir, filename);
  const targetFilePath = path.join(targetDir, filename);
  const { data, info } = await sharp(sourceFilePath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let rawAlpha = 0;
  let totalOpticalMass = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = channels === 4 ? data[idx + 3] : 255;

      if (a > 15) {
        const normA = a / 255;
        rawAlpha += normA;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        // sRGB Luminance in linear space
        const rLin = Math.pow(r / 255, 2.2);
        const gLin = Math.pow(g / 255, 2.2);
        const bLin = Math.pow(b / 255, 2.2);
        const Y = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;

        // Contrast and saturation weighting
        const Lstar = 116 * Math.pow(Math.max(0, Y), 1 / 3) - 16;
        const contrast = Math.max(0, Lstar - 0.87);
        const wc = 0.35 + 0.65 * Math.pow(contrast / 100, 0.65);

        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
        const wSat = 1.0 + 0.35 * sat;

        totalOpticalMass += normA * wc * wSat;
      }
    }
  }

  const bboxW = Math.max(1, maxX - minX + 1);
  const bboxH = Math.max(1, maxY - minY + 1);
  const aspect = bboxW / bboxH;

  return {
    filename,
    sourceFilePath,
    targetFilePath,
    width,
    height,
    minX,
    maxX,
    minY,
    maxY,
    bboxW,
    bboxH,
    aspect,
    rawAlpha: Math.round(rawAlpha),
    opticalMass: Math.round(totalOpticalMass),
  };
}

async function main() {
  console.log(`Analyzing ${files.length} weapons from ${path.relative(process.cwd(), sourceDir)}...`);
  const analyses = await Promise.all(files.map(analyzeWeapon));
  analyses.sort((a, b) => b.opticalMass - a.opticalMass);

  const CANVAS_SIZE = 512;
  const TARGET_LONG_DIM = 460; // Max dimension for elongated/horizontal weapons and diagonal blades
  const TARGET_SQUARE_DIM = 410; // Max dimension for compact square/round objects (mines, grenades)

  for (const w of analyses) {
    // For elongated vertical blades/poles/weapons (aspect <= 0.45), rotate 45 deg diagonally
    const isVerticalWeapon = w.aspect <= 0.45;

    let sourceBuffer = await sharp(w.sourceFilePath)
      .extract({
        left: w.minX,
        top: w.minY,
        width: w.bboxW,
        height: w.bboxH,
      })
      .toBuffer();

    let curW = w.bboxW;
    let curH = w.bboxH;

    if (isVerticalWeapon) {
      const rotated = await sharp(sourceBuffer)
        .rotate(45, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer({ resolveWithObject: true });
      sourceBuffer = rotated.data;
      curW = rotated.info.width;
      curH = rotated.info.height;
    }

    // Determine target dimension based on resulting aspect ratio
    const postAspect = curW / curH;
    const isCompactShape = postAspect >= 0.75 && postAspect <= 1.35;
    const targetBaseDim = isCompactShape ? TARGET_SQUARE_DIM : TARGET_LONG_DIM;

    const maxBBoxDim = Math.max(curW, curH);
    let finalScale = targetBaseDim / maxBBoxDim;

    // Ensure it strictly stays within canvas safe area
    if (curW * finalScale > 470) finalScale = 470 / curW;
    if (curH * finalScale > 470) finalScale = 470 / curH;

    const targetW = Math.max(1, Math.round(curW * finalScale));
    const targetH = Math.max(1, Math.round(curH * finalScale));

    const resizedBuffer = await sharp(sourceBuffer)
      .resize(targetW, targetH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .toBuffer();

    const leftOffset = Math.round((CANVAS_SIZE - targetW) / 2);
    const topOffset = Math.round((CANVAS_SIZE - targetH) / 2);

    const finalImageBuffer = await sharp({
      create: {
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: resizedBuffer, left: leftOffset, top: topOffset }])
      .webp({ quality: 95, alphaQuality: 100, effort: 6 })
      .toBuffer();

    await sharp(finalImageBuffer).toFile(w.targetFilePath);

    // Also write canonical aliases if present
    if (ALIAS_MAP[w.filename]) {
      for (const alias of ALIAS_MAP[w.filename]) {
        await sharp(finalImageBuffer).toFile(path.join(targetDir, alias));
      }
    }

    console.log(
      `✓ ${w.filename}${ALIAS_MAP[w.filename] ? ` (+ ${ALIAS_MAP[w.filename].join(", ")})` : ""}: ${w.bboxW}x${w.bboxH} (aspect ${w.aspect.toFixed(2)}${isVerticalWeapon ? ", 45° rot" : ""}) -> ${targetW}x${targetH} centered on ${CANVAS_SIZE}x${CANVAS_SIZE}`,
    );
  }

  console.log("All 72 weapon images and aliases normalized and centered successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
