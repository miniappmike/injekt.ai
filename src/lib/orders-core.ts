/**
 * Pure helpers for the first-month bonus check: one bonus per person, so the same inbox can't claim it twice under
 * different spellings, and throwaway inboxes can't claim it at all.
 */

/** The inbox an address really delivers to: lower case, without a "+tag", and for Gmail without dots. */
export function emailKey(email: string): string {
  const [rawLocal, rawDomain = ""] = email.trim().toLowerCase().split("@");
  let local = rawLocal.split("+")[0];
  let domain = rawDomain;
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

// The common throwaway-inbox services. Not complete; the device and network checks catch most of the rest.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "sharklasers.com", "grr.la", "10minutemail.com", "10minutemail.net",
  "temp-mail.org", "tempmail.com", "tempmail.net", "tempmailo.com", "tempr.email", "throwawaymail.com", "yopmail.com", "yopmail.net",
  "getnada.com", "nada.email", "trashmail.com", "trashmail.de", "dispostable.com", "maildrop.cc", "mailnesia.com", "mintemail.com",
  "fakeinbox.com", "emailondeck.com", "mohmal.com", "burnermail.io", "spamgourmet.com", "mailcatch.com", "moakt.com", "tmail.ws",
  "mail.tm", "mail.gw", "emailfake.com", "inboxkitten.com", "luxusmail.org", "dropmail.me", "1secmail.com", "1secmail.org", "1secmail.net",
  "minuteinbox.com", "tempinbox.com", "spambox.us", "33mail.com", "anonaddy.me", "discard.email", "mytemp.email", "tmpmail.org",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return DISPOSABLE.has(domain) || [...DISPOSABLE].some((d) => domain.endsWith(`.${d}`));
}

export type BonusBlock = "unconfirmed_email" | "disposable_email" | "already_pro" | "claimed";

/** Why the first-month bonus can't be given, in words a page can show. */
export const BONUS_BLOCK_TEXT: Record<BonusBlock, string> = {
  unconfirmed_email: "Confirm your email to get the first-month bonus.",
  disposable_email: "The first-month bonus isn't available with a temporary email address.",
  already_pro: "The first-month bonus is for your first month of Pro.",
  claimed: "The first-month bonus has already been used on this account, email or device.",
};
