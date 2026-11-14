/**
 * Invite links: "invite a friend, you both get tokens". This file is the settings and the pure helpers; the database
 * side is `invites-server.ts` (migration 0027).
 */

/**
 * Tokens each person gets when an invite pays out. NOT DECIDED YET: while this is null the buttons say "Invite a
 * friend" with no number, and no copy promises tokens. Setting it only changes the wording; paying the reward is not
 * built yet (`invites.rewarded_at` is waiting for it).
 */
export const INVITE_REWARD_TOKENS: number | null = null;

/** Where the invite buttons lead: the card on the Tokens page. */
export const INVITE_PATH = "/tokens#invite";

/** The cookie that carries an invite code from the first visit to sign-up. */
export const INVITE_COOKIE = "ms_ref";
export const INVITE_COOKIE_DAYS = 30;

const CODE = /^[a-z0-9]{6,12}$/;

/** A code from a link or cookie in the form we make (lower case letters and digits), or null. */
export function parseInviteCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return CODE.test(code) ? code : null;
}

/** The link a person shares. Without a code (before migration 0027 is run) it is just the site. */
export function inviteLink(appUrl: string, code: string | null): string {
  const base = appUrl.replace(/\/+$/, "");
  return code ? `${base}/?ref=${code}` : base;
}

/** The label on the invite buttons. */
export function inviteLabel(reward: number | null = INVITE_REWARD_TOKENS): string {
  return reward ? `Invite a friend, get ${reward} free tokens` : "Invite a friend";
}

/** The line under "Earn free tokens" on the Tokens page. */
export function inviteBlurb(reward: number | null = INVITE_REWARD_TOKENS): string {
  return reward
    ? `Invite a friend. When they confirm their email and make their first image, you both get ${reward} tokens.`
    : "Share your link with a friend. Token rewards for invites are coming soon, and friends who sign up with your link now will count.";
}
