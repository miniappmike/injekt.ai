import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { UnsafeUrlError } from "./errors";

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

// Resolves the host and rejects anything that is not a public https endpoint.
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("Only https URLs are allowed");
  const addrs = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("URL resolves to a private address");
  }
  return url;
}

// Fetch with the guard, a size cap, and manual redirect handling (each hop re-checked).
export async function safeFetchBytes(raw: string, maxBytes = 25 * 1024 * 1024, hops = 3) {
  let current = raw;
  for (let i = 0; i <= hops; i++) {
    const url = await assertPublicHttpsUrl(current);
    const res = await fetch(url, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new UnsafeUrlError("Response too large");
    return { bytes: buf, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  }
  throw new UnsafeUrlError("Too many redirects");
}
