import { describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { isPrivateIp } from "@/lib/ssrf";
import { resolveApiKey } from "@/lib/keys";
import { ApiKeyRequiredError } from "@/lib/errors";
import { MASTER_PROMPT } from "@/lib/ai/master-prompt";
import { createGuardedClient } from "@/lib/ai/guarded-client";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("sk-secret", KEY);
    expect(decryptSecret(a, KEY)).toBe("sk-secret");
    expect(encryptSecret("sk-secret", KEY)).not.toBe(a);
  });
  it("rejects tampering and wrong keys", () => {
    const a = encryptSecret("sk-secret", KEY);
    const parts = a.split(".");
    parts[4] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), KEY)).toThrow();
    expect(() => decryptSecret(a, Buffer.alloc(32, 1).toString("base64"))).toThrow();
  });
});

describe("ssrf guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"])(
    "blocks %s",
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1"])("allows %s", (ip) => expect(isPrivateIp(ip)).toBe(false));
});

describe("resolveApiKey", () => {
  const base = { serverKeys: { spicyapi: "server-key" } };
  it("prefers the user's own key", async () => {
    const r = await resolveApiKey({ ...base, loadUserKey: async () => "mine", isAdmin: async () => true }, "u", "spicyapi");
    expect(r).toEqual({ key: "mine", source: "byok" });
  });
  it("falls back to the server key for admins only", async () => {
    const admin = await resolveApiKey({ ...base, loadUserKey: async () => null, isAdmin: async () => true }, "u", "spicyapi");
    expect(admin).toEqual({ key: "server-key", source: "server" });
    await expect(
      resolveApiKey({ ...base, loadUserKey: async () => null, isAdmin: async () => false }, "u", "spicyapi"),
    ).rejects.toMatchObject({ redirectTo: "/settings/api-keys?provider=spicyapi" });
  });
  it("errors when an admin has no server key either", async () => {
    await expect(
      resolveApiKey({ serverKeys: {}, loadUserKey: async () => null, isAdmin: async () => true }, "u", "spicyapi"),
    ).rejects.toBeInstanceOf(ApiKeyRequiredError);
  });
});

describe("master prompt guard", () => {
  it("always prepends the master prompt", async () => {
    const complete = vi.fn(async (_a: { system: string; text: string; images?: string[]; apiKey: string }) => ({ text: "ok" }));
    const client = createGuardedClient({ id: "x", complete }, "k");
    await client.run({ instructions: "Write a prompt.", text: "hi", images: ["u"] });
    const call = complete.mock.calls[0]![0];
    expect(call.system.startsWith(MASTER_PROMPT)).toBe(true);
    expect(call.system).toContain("Write a prompt.");
    expect(call.apiKey).toBe("k");
  });

  it("returns the text, reports token use, and never lets tracking break the call", async () => {
    const onUsage = vi.fn(async () => {
      throw new Error("ledger down");
    });
    const client = createGuardedClient({ id: "x", complete: async () => ({ text: "done", usage: { inputTokens: 10, outputTokens: 2 } }) }, "k", { onUsage });
    expect(await client.run({ instructions: "i", text: "t" })).toBe("done");
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 10, outputTokens: 2 });

    const seen = vi.fn();
    const quiet = createGuardedClient({ id: "x", complete: async () => ({ text: "ok" }) }, "k", { onUsage: seen });
    await quiet.run({ instructions: "i", text: "t" });
    expect(seen).toHaveBeenCalledWith(undefined); // still counted as a call
  });
});
