const MAX_ENCODED_BYTES = 500_000;
const MAX_DECODED_BYTES = 1_000_000;

function decodeBase64String(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized || normalized.length > MAX_ENCODED_BYTES || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("Invalid base64 string.");
  }
  try {
    return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  } catch {
    throw new Error("Invalid base64 string.");
  }
}

async function readBounded(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_DECODED_BYTES) throw new Error("Decoded data is too large.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

async function decompressGzip(bytes: Uint8Array) {
  const input = new Blob([bytes as BlobPart]).stream();
  try {
    return await readBounded(input.pipeThrough(new DecompressionStream("gzip")));
  } catch (error) {
    if (error instanceof Error && error.message === "Decoded data is too large.") throw error;
    throw new Error("Invalid compressed data.");
  }
}

async function decodeCompressedBase64(encodedValue: string): Promise<Uint8Array> {
  const bytes = decodeBase64String(encodedValue);
  const decodedBytes = bytes[0] === 0x1f && bytes[1] === 0x8b ? await decompressGzip(bytes) : bytes;
  if (decodedBytes.byteLength > MAX_DECODED_BYTES) throw new Error("Decoded data is too large.");
  return decodedBytes;
}

export async function decodeCompressedJson(encodedValue: string, label: string): Promise<unknown> {
  const decodedBytes = await decodeCompressedBase64(encodedValue).catch((error) => {
    if (error instanceof Error && error.message === "Decoded data is too large.") throw new Error(`${label} is too large.`);
    if (error instanceof Error && error.message.includes("compressed")) throw new Error(`Invalid compressed ${label}.`);
    throw new Error(`Invalid ${label}.`);
  });

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodedBytes));
  } catch {
    throw new Error(`${label} does not contain valid JSON.`);
  }
}

export async function encodeCompressedJson(value: unknown): Promise<string> {
  const jsonString = JSON.stringify(value);
  const inputBytes = new TextEncoder().encode(jsonString);
  const stream = new Blob([inputBytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    chunks.push(chunk);
  }
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const compressed = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }
  let binary = "";
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary);
}
