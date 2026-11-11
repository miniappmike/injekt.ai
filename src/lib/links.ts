/**
 * The referral link to SpicyAPI. Every link that sends people to SpicyAPI goes through it, so sign-ups are credited
 * (5% of what they spend, up to $50 a person). NEXT_PUBLIC_SPICYAPI_REFERRAL_URL overrides it.
 */
export const SPICYAPI_REFERRAL_URL = process.env.NEXT_PUBLIC_SPICYAPI_REFERRAL_URL || "https://spicyapi.ai/?ref=yjqgtzd1";

/** Where "Copy & open" sends people to paste a prompt: SpicyAPI, through the referral link. */
export const GENERATOR = {
  name: "SpicyAPI",
  url: SPICYAPI_REFERRAL_URL,
};
