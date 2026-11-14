import { describe, expect, it } from "vitest";
import { inviteBlurb, inviteLabel, inviteLink, parseInviteCode } from "@/lib/invites";

describe("invite codes", () => {
  it("accepts the codes we make and lower-cases them", () => {
    expect(parseInviteCode("k7q2mx9a")).toBe("k7q2mx9a");
    expect(parseInviteCode("  K7Q2MX9A ")).toBe("k7q2mx9a");
  });

  it("rejects anything else", () => {
    for (const bad of [undefined, null, 42, "", "abc", "a".repeat(13), "k7q2-mx9", "k7q2 mx9a", "<script>", "k7q2mx9a/../x"]) {
      expect(parseInviteCode(bad)).toBeNull();
    }
  });
});

describe("invite link", () => {
  it("puts the code on the landing page", () => {
    expect(inviteLink("https://example.app", "k7q2mx9a")).toBe("https://example.app/?ref=k7q2mx9a");
    expect(inviteLink("https://example.app/", "k7q2mx9a")).toBe("https://example.app/?ref=k7q2mx9a");
  });

  it("is just the site when there is no code", () => {
    expect(inviteLink("https://example.app/", null)).toBe("https://example.app");
  });
});

describe("invite wording", () => {
  it("promises no number while the reward is undecided", () => {
    expect(inviteLabel(null)).toBe("Invite a friend");
    expect(inviteBlurb(null)).not.toMatch(/\d/);
  });

  it("names the reward once there is one", () => {
    expect(inviteLabel(25)).toBe("Invite a friend, get 25 free tokens");
    expect(inviteBlurb(25)).toContain("25 tokens");
  });
});
