import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://app.test" } }));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({ auth: { signUp } }) }));
const recordInvite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invites-server", () => ({ recordInvite }));
const jar = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import { signup } from "@/app/(front)/(auth)/actions";
import { TERMS_UPDATED } from "@/lib/legal";

const form = (extra: Record<string, string> = {}) => {
  const f = new FormData();
  f.set("email", "a@x.com");
  f.set("password", "longenough");
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
};

beforeEach(() => {
  signUp.mockReset();
  signUp.mockResolvedValue({ data: { session: null, user: { id: "new-user" } }, error: null });
  recordInvite.mockReset();
  jar.get.mockReset();
  jar.delete.mockReset();
});

describe("sign up", () => {
  it("needs the 18+ box and the Terms box", async () => {
    expect(await signup({}, form({ terms: "on" }))).toEqual({ error: "You must be 18 or older to use ModelSpawn." });
    expect(await signup({}, form({ adult: "on" }))).toMatchObject({ error: expect.stringMatching(/Terms of Service/) });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("records the confirmation and the versions agreed to", async () => {
    expect(await signup({}, form({ adult: "on", terms: "on" }))).toMatchObject({ message: expect.stringMatching(/confirm/) });
    const data = signUp.mock.calls[0][0].options.data;
    expect(data).toMatchObject({ terms_version: TERMS_UPDATED });
    expect(Date.parse(data.adult_confirmed_at)).not.toBeNaN();
    expect(Date.parse(data.terms_accepted_at)).not.toBeNaN();
  });

  it("credits the friend who sent the invite link, then forgets the code", async () => {
    jar.get.mockReturnValue({ value: "k7q2mx9a" });
    await signup({}, form({ adult: "on", terms: "on" }));
    expect(recordInvite).toHaveBeenCalledWith("new-user", "k7q2mx9a");
    expect(jar.delete).toHaveBeenCalledWith("ms_ref");
  });

  it("still signs up when there is no invite", async () => {
    jar.get.mockReturnValue(undefined);
    expect(await signup({}, form({ adult: "on", terms: "on" }))).toMatchObject({ message: expect.stringMatching(/confirm/) });
    expect(recordInvite).toHaveBeenCalledWith("new-user", undefined);
  });
});
