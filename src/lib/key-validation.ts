// API keys are plain printable ASCII. Anything else (for example the dots a dashboard uses to
// hide a key) means the wrong text was copied and would later break HTTP headers.
export function validateApiKey(raw: string): { ok: true; key: string } | { ok: false; error: string } {
  const key = raw.trim();
  if (key.length < 8) return { ok: false, error: "That key looks too short" };
  if (!/^[\x21-\x7e]+$/.test(key)) {
    return {
      ok: false,
      error: "The key has hidden or non-standard characters. Copy it again with the provider's copy button.",
    };
  }
  return { ok: true, key };
}
