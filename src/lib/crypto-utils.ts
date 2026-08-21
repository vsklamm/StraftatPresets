export function bytesToHex(bytes: Uint8Array | ArrayBuffer): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: string | Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return bytesToHex(digest);
}

export async function constantTimeStringEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}
