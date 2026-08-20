import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const rawDir = path.join(process.cwd(), "game-data", "raw-weapons");
const targetDir = path.join(process.cwd(), "public", "weapons");
const sourceDir = fs.existsSync(rawDir) ? rawDir : targetDir;
const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".webp"));

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

        // CIELAB L* perceptual lightness difference from #09090b (L*_bg ≈ 0.87)
        const Lstar = 116 * Math.pow(Math.max(0, Y), 1 / 3) - 16;
        const contrast = Math.max(0, Lstar - 0.87);
        const wc = 0.35 + 0.65 * Math.pow(contrast / 100, 0.65);

        // Color saturation boost
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

  const medianOptMass = analyses[Math.floor(analyses.length / 2)].opticalMass;
  console.log(`Median Optical Mass: ${medianOptMass}`);

  const CANVAS_SIZE = 512;
  const MAX_DIM = 460;

  for (const w of analyses) {
    // Optical mass scaling factor (damped power-law, clamped to [0.65, 1.40])
    const optRatio = medianOptMass / w.opticalMass;
    const optScale = Math.pow(optRatio, 0.30);
    const clampedScale = Math.min(1.40, Math.max(0.65, optScale));

    // For elongated vertical blades/poles (aspect < 0.25), rotate 45 deg diagonally
    const isBlade = w.aspect < 0.25;

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

    if (isBlade) {
      const rotated = await sharp(sourceBuffer)
        .rotate(45, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer({ resolveWithObject: true });
      sourceBuffer = rotated.data;
      curW = rotated.info.width;
      curH = rotated.info.height;
    }

    const maxBBoxDim = Math.max(curW, curH);
    const fitScale = MAX_DIM / maxBBoxDim;
    let finalScale = fitScale * clampedScale;
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
      .webp({ quality: 92, alphaQuality: 100, effort: 6 })
      .toBuffer();

    await sharp(finalImageBuffer).toFile(w.targetFilePath);
    console.log(
      `✓ ${w.filename}: ${w.bboxW}x${w.bboxH} (OptMass ${w.opticalMass}, scale ${clampedScale.toFixed(2)}x) -> ${targetW}x${targetH} centered on ${CANVAS_SIZE}x${CANVAS_SIZE}`,
    );
  }

  console.log("All weapon images normalized successfully with unified optical mass!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
