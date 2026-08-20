import type { ThumbnailProcessor } from "@/src/application/ports";
import { MAX_THUMBNAIL_UPLOAD_BYTES } from "@/src/domain/thumbnail-policy";
import { sha256Hex } from "@/src/lib/crypto-utils";

const MAX_THUMBNAIL_DIMENSION = 10_000;
const MAX_THUMBNAIL_PIXELS = 24_000_000;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export async function prepareThumbnail(file: Pick<File, "arrayBuffer" | "size" | "type">, processor: ThumbnailProcessor) {
  if (!allowedTypes.has(file.type)) throw new Error("Upload a JPEG, PNG, or WebP image.");
  if (file.size <= 0 || file.size > MAX_THUMBNAIL_UPLOAD_BYTES) throw new Error("Thumbnail must be no larger than 2 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const actualType = detectImageType(bytes);
  if (actualType !== file.type) throw new Error("Thumbnail type does not match its file contents.");

  const { width, height } = actualType === "image/png"
    ? readPngDimensions(bytes)
    : actualType === "image/webp"
    ? readWebpDimensions(bytes)
    : readJpegDimensions(bytes);
  if (width < 320 || height < 180) throw new Error("Thumbnail must be at least 320×180 pixels.");
  if (width > MAX_THUMBNAIL_DIMENSION || height > MAX_THUMBNAIL_DIMENSION || width * height > MAX_THUMBNAIL_PIXELS) {
    throw new Error("Thumbnail has too many pixels.");
  }

  const sha256 = await sha256Hex(bytes);
  const optimized = await processor.transform(bytes);
  if (!isWebp(optimized)) throw new Error("Thumbnail could not be converted to WebP.");
  return {
    bytes: optimized,
    contentType: "image/webp" as const,
    extension: "webp" as const,
    width,
    height,
    sha256,
  };
}

function isWebp(bytes: Uint8Array) {
  return bytes.length >= 12 && readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP";
}

function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (isWebp(bytes)) return "image/webp";
  throw new Error("Thumbnail file could not be decoded as JPEG, PNG, or WebP.");
}

function readPngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24 || readAscii(bytes, 12, 4) !== "IHDR") throw new Error("Thumbnail PNG is invalid.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readWebpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30) throw new Error("Thumbnail WebP is invalid.");
  const chunkType = readAscii(bytes, 12, 4);
  if (chunkType === "VP8 ") {
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    return { width, height };
  }
  if (chunkType === "VP8L") {
    if (bytes[20] !== 0x2f) throw new Error("Thumbnail WebP is invalid.");
    const b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
    const width = 1 + (((b1 & 0x3f) << 8) | bytes[21]);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  if (chunkType === "VP8X") {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }
  throw new Error("Thumbnail WebP format is unsupported.");
}

function readJpegDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("Thumbnail JPEG is invalid.");
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) throw new Error("Thumbnail JPEG is invalid.");
    if (isStartOfFrame(marker)) {
      if (segmentLength < 7) throw new Error("Thumbnail JPEG is invalid.");
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    }
    offset += segmentLength;
  }
  throw new Error("Thumbnail JPEG dimensions could not be read.");
}

function isStartOfFrame(marker: number) {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
