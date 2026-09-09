import { isIP } from "node:net";

export function isSafePublicUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return false;
  if (isIP(host) !== 4) return true;
  const octets = host.split(".").map(Number);
  const [first, second] = octets;
  return !(
    first === 10 ||
    first === 127 ||
    first === 169 && second === 254 ||
    first === 192 && second === 168 ||
    first === 172 && second >= 16 && second <= 31
  );
}