/**
 * The referral link to SpicyAPI. Every link that sends people to SpicyAPI goes through it, so sign-ups are credited
 * (5% of what they spend, up to $50 a person). NEXT_PUBLIC_SPICYAPI_REFERRAL_URL overrides it.
 */
export const SPICYAPI_REFERRAL_URL = process.env.NEXT_PUBLIC_SPICYAPI_REFERRAL_URL || "https://spicyapi.ai/?ref=yjqgtzd1";

/** The guide to getting your own SpicyAPI key (the page every "Get an API key" link opens). */
export const GET_KEY_PATH = "/get-a-key";
/** The Image generation switch in Settings. */
export const GENERATION_SETTINGS_PATH = "/settings/api-keys#image-generation";

/** Said wherever the referral link is offered. */
export const REFERRAL_DISCLOSURE = "ModelSpawn earns a small referral commission if you sign up to SpicyAPI through our link. It costs you nothing extra.";

/** Support, takedown requests and compliance questions. */
export const CONTACT_EMAIL = "modelspawn@gmail.com";

/** The how-to-pay-with-Telegram guide. */
export const TELEGRAM_GUIDE_PATH = "/guides/telegram-payments";
