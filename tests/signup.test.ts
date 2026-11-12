import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://app.test" } }));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({ auth: { signUp } }) }));

import { signup } from "@/app/(auth)/actions";
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
  signUp.mockResolvedValue({ data: { session: null }, error: null });
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
});
