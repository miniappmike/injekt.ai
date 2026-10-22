import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Envelope format: v1.<keyId>.<iv>.<tag>.<ciphertext> (base64url parts).
// The key lives in env/KMS, never in the database.
const VERSION = "v1";

function toKey(b64: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return key;
}

export function encryptSecret(plaintext: string, keyB64: string, keyId = "1"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", toKey(keyB64), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, keyId, iv, tag, ct]
    .map((p) => (Buffer.isBuffer(p) ? p.toString("base64url") : p))
    .join(".");
}

export function decryptSecret(envelope: string, keyB64: string): string {
  const [version, , iv, tag, ct] = envelope.split(".");
  if (version !== VERSION || !iv || !tag || !ct) throw new Error("Malformed secret envelope");
  const decipher = createDecipheriv("aes-256-gcm", toKey(keyB64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export const last4 = (secret: string) => secret.slice(-4);
