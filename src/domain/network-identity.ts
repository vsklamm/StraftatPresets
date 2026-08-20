function normalizeIpv4(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

function normalizeIpv6(value: string) {
  const withoutZone = value.toLowerCase().split("%")[0];
  const halves = withoutZone.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[a-f0-9]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = halves.length === 2 ? [...left, ...Array.from({ length: missing }, () => "0"), ...right] : left;
  if (parts.length !== 8) return null;
  return `${parts.slice(0, 4).map((part) => part.padStart(4, "0")).join(":")}::/64`;
}

export function normalizeNetworkPrefix(value: string | null) {
  if (!value) return null;
  const address = value.trim().replace(/^\[|\]$/g, "");
  if (!address) return null;
  if (address.includes(".")) {
    const mapped = address.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    return normalizeIpv4(mapped ?? address);
  }
  return normalizeIpv6(address);
}
