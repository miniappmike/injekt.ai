import { describe, expect, it, vi } from "vitest";
import { defaultModelFor, detectProvider, SPICY_IMAGE_MODEL, SPICY_TEXT_MODEL } from "@/lib/ai/providers/detect";
import { effectiveRole, isSpicyHost, providerSupports, shareRole } from "@/lib/ai/roles";
import { resolveRoleSetup } from "@/lib/ai/role-setup";
import { getTextBackend } from "@/lib/ai/providers/text";
import { toFailure } from "@/lib/ai/failure";
import { UserFacingError } from "@/lib/errors";

// Hostnames resolve to a public address so tests never touch real DNS.
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34" }]) }));

describe("SpicyAPI keys", () => {
  it("are recognised before the generic sk- rule, so they are not called OpenAI", () => {
    expect(detectProvider("sk-spicy-abc123")?.id).toBe("spicyapi");
    expect(detectProvider("sk-abc123")?.id).toBe("openai");
    expect(detectProvider("sk-ant-abc")?.id).toBe("anthropic");
  });

  it("prefill the right model for each job", () => {
    const d = detectProvider("sk-spicy-abc")!;
    expect(defaultModelFor(d, "vision")).toBe(SPICY_TEXT_MODEL);
    expect(defaultModelFor(d, "llm")).toBe(SPICY_TEXT_MODEL);
    expect(defaultModelFor(d, "image")).toBe(SPICY_IMAGE_MODEL);
    expect(SPICY_IMAGE_MODEL).toBe("bytedance/seedream-5.0-pro/edit");
    expect(defaultModelFor(detectProvider("sk-ant-abc")!, "image")).toBe("");
  });

  it("only count api.spicyapi.ai style hosts, not lookalikes", () => {
    expect(isSpicyHost("https://api.spicyapi.ai/v1")).toBe(true);
    expect(isSpicyHost("https://spicyapi.ai")).toBe(true);
    expect(isSpicyHost("https://evilspicyapi.ai/v1")).toBe(false);
    expect(isSpicyHost("https://spicyapi.ai.evil.com/v1")).toBe(false);
    expect(isSpicyHost("not a url")).toBe(false);
    expect(isSpicyHost(undefined)).toBe(false);
  });

  it("run text jobs through their own request shape", () => {
    expect(getTextBackend("spicyapi", SPICY_TEXT_MODEL).id).toBe("spicyapi");
    expect(getTextBackend("custom", "m", "https://evilspicyapi.ai/v1").id).toBe("custom");
  });
});

describe("the Image job", () => {
  it("only accepts SpicyAPI keys, and has no 'other provider' path", async () => {
    const ok = await resolveRoleSetup({ key: "sk-spicy-abcdefgh", role: "image" });
    expect(ok).toMatchObject({ ok: true, config: { provider: "spicyapi", model: SPICY_IMAGE_MODEL } });
    for (const key of ["sk-ant-abcdefgh", "sk-abcdefgh12", "unknownkey12345"]) {
      const r = await resolveRoleSetup({ key, role: "image", custom: true, baseUrl: "https://1.1.1.1/v1", model: "m" });
      expect(r).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toContain("SpicyAPI");
    }
  });

  it("lets the person pick a different image model", async () => {
    expect(await resolveRoleSetup({ key: "sk-spicy-abcdefgh", role: "image", model: "bytedance/other/edit" })).toMatchObject({
      ok: true,
      config: { model: "bytedance/other/edit" },
    });
    expect((await resolveRoleSetup({ key: "sk-spicy-abcdefgh", role: "image", model: "bad model!" })).ok).toBe(false);
  });

  it("gives SpicyAPI keys the text model on the Vision and Text jobs", async () => {
    for (const role of ["vision", "llm"] as const) {
      expect(await resolveRoleSetup({ key: "sk-spicy-abcdefgh", role })).toMatchObject({
        ok: true,
        config: { provider: "spicyapi", model: SPICY_TEXT_MODEL },
      });
    }
  });

  it("knows which providers can generate images", () => {
    expect(providerSupports({ provider: "spicyapi" }, "image")).toBe(true);
    expect(providerSupports({ provider: "custom", baseUrl: "https://api.spicyapi.ai/v1" }, "image")).toBe(true);
    expect(providerSupports({ provider: "custom", baseUrl: "https://api.groq.com/v1" }, "image")).toBe(false);
    expect(providerSupports({ provider: "anthropic" }, "image")).toBe(false);
    expect(providerSupports({ provider: "anthropic" }, "vision")).toBe(true);
  });

  it("can borrow a SpicyAPI key from Vision, but not a key that cannot generate images", () => {
    const spicy = { provider: "spicyapi", model: SPICY_TEXT_MODEL };
    const shared = shareRole({ vision: spicy }, "image", "vision", SPICY_IMAGE_MODEL);
    expect(shared).toMatchObject({ ok: true });
    if (!shared.ok) throw new Error("unreachable");
    expect(effectiveRole(shared.roles, "image")).toEqual({ cfg: { ...spicy, model: SPICY_IMAGE_MODEL }, keyRole: "vision" });

    const refused = shareRole({ vision: { provider: "anthropic", model: "m" } }, "image", "vision", "m");
    expect(refused).toMatchObject({ ok: false });
    expect((refused as { error: string }).error).toContain("SpicyAPI");
  });

  it("can share the other way: Vision borrows the Image key", () => {
    const img = { provider: "spicyapi", model: SPICY_IMAGE_MODEL };
    expect(shareRole({ image: img }, "vision", "image", SPICY_TEXT_MODEL)).toMatchObject({ ok: true });
  });

  it("has no stand-in when empty: Image never falls back to Vision or Text", () => {
    expect(effectiveRole({ vision: { provider: "spicyapi", model: "m" } }, "image")).toBeNull();
    expect(effectiveRole({ image: { provider: "spicyapi", model: "m" } }, "vision")).toBeNull();
  });
});

describe("user-facing errors", () => {
  it("show their message as written", () => {
    expect(toFailure(new UserFacingError("Confirm your email address to use your free image."))).toEqual({
      ok: false,
      error: "Confirm your email address to use your free image.",
    });
  });
});

import { readRoles } from "@/lib/ai/roles";

describe("a job's own price", () => {
  const own = { provider: "openai", model: "gpt-4o" };

  it("is read from saved settings when it is two sensible numbers", () => {
    expect(readRoles({ roles: { vision: { ...own, price: { input: 2.5, output: 10 } } } }).vision).toEqual({ ...own, price: { input: 2.5, output: 10 } });
    expect(readRoles({ roles: { vision: { ...own, price: { input: "2", output: 10 } } } }).vision).toEqual(own);
    expect(readRoles({ roles: { vision: { ...own, price: { input: -1, output: 10 } } } }).vision).toEqual(own);
    expect(readRoles({ roles: { vision: { ...own, price: { input: 5000, output: 10 } } } }).vision).toEqual(own);
    expect(readRoles({ roles: { llm: { keyFrom: "vision", model: "m", price: { input: 1, output: 2 } } } }).llm).toEqual({ keyFrom: "vision", model: "m", price: { input: 1, output: 2 } });
  });

  it("does not leak from the job whose key is borrowed, because it belongs to a different model", () => {
    const roles = readRoles({
      roles: {
        vision: { ...own, price: { input: 2.5, output: 10 } },
        llm: { keyFrom: "vision", model: "gpt-4o-mini" },
      },
    });
    expect(effectiveRole(roles, "llm")?.cfg.price).toBeUndefined();
    expect(effectiveRole(roles, "vision")?.cfg.price).toEqual({ input: 2.5, output: 10 });

    const withOwn = readRoles({
      roles: { vision: { ...own, price: { input: 2.5, output: 10 } }, llm: { keyFrom: "vision", model: "gpt-4o-mini", price: { input: 0.15, output: 0.6 } } },
    });
    expect(effectiveRole(withOwn, "llm")?.cfg.price).toEqual({ input: 0.15, output: 0.6 });
  });

  it("follows a job that stands in for another", () => {
    const roles = readRoles({ roles: { llm: { ...own, price: { input: 1, output: 3 } } } });
    expect(effectiveRole(roles, "vision")?.cfg.price).toEqual({ input: 1, output: 3 });
  });
});
