import { CONTACT_EMAIL, DISCORD_URL, GET_KEY_PATH } from "@/lib/links";
import { CREDIT_PACKS, dollars, PRO } from "@/lib/plans";
import { MORE_NAV, NAV } from "@/lib/nav";

/**
 * What the ModelSpawn bot says to a typed command. Pure (no network, no database), so it is easy to test; the bot in
 * `payments/telegram.ts` sends the answer. Every command points at the matching page on the site, since the bot is a
 * companion to the web tool: it answers quickly and opens the right page, it doesn't run the tools itself.
 */

export type Button = { text: string; url: string };
export type Reply = { text: string; buttons?: Button[] };

/** The menu Telegram shows when you type "/" (set with setMyCommands from Admin → Payments → Connect). */
export const BOT_COMMANDS = [
  { command: "start", description: "Welcome and quick links" },
  { command: "help", description: "What this bot can do" },
  { command: "tools", description: "The ModelSpawn tools, one line each" },
  { command: "tokens", description: "Token packs and prices" },
  { command: "pro", description: "What Pro includes" },
  { command: "key", description: "Get your own API key" },
  { command: "invite", description: "Invite a friend" },
  { command: "discord", description: "Join the community" },
  { command: "terms", description: "Terms of Service and Privacy Policy" },
  { command: "support", description: "Help using ModelSpawn" },
  { command: "paysupport", description: "A payment didn't arrive or went wrong" },
] as const;

const TOOL_LINES: Record<string, string> = {
  "/reference-sheet": "build a new model from your photos",
  "/characters": "your models and their reference photos",
  "/marketplace": "ready-made personas",
  "/inject": "put your model into any photo",
  "/director": "describe a photo and get it made",
  "/variants": "many versions of one good photo",
};

const stars = (n: number) => `⭐ ${n.toLocaleString("en-US")}`;

/** The reply for one command, or null when the word isn't a command this bot knows. `site` has no trailing slash. */
export function commandReply(command: string, site: string): Reply | null {
  const open: Button = { text: "Open ModelSpawn", url: `${site}/home` };
  switch (command) {
    case "/start":
      return {
        text: "Hi! I'm the ModelSpawn bot. Your characters, photos and tokens live on the site; I get you there fast and take Telegram Stars for tokens and Pro.\n\nTry /tools, /tokens or /help.",
        buttons: [open, { text: "Get tokens", url: `${site}/tokens` }],
      };
    case "/help":
      return {
        text: [
          "What I can do:",
          "/tools · the ModelSpawn tools",
          "/tokens · token packs and prices",
          "/pro · what Pro includes",
          "/key · get your own API key",
          "/invite · invite a friend",
          "/discord · the community",
          "/support · help using ModelSpawn",
          "/paysupport · a payment went wrong",
          "/terms · terms and privacy",
          "",
          "To pay with Stars, start a purchase on the site and it opens here.",
        ].join("\n"),
        buttons: [open],
      };
    case "/tools": {
      const tools = [...NAV, ...MORE_NAV.filter((m) => !m.href.includes("#"))];
      const seen = new Set<string>();
      const lines = tools.flatMap((t) => {
        if (seen.has(t.href)) return [];
        seen.add(t.href);
        const hint = TOOL_LINES[t.href] ?? ("hint" in t ? t.hint.charAt(0).toLowerCase() + t.hint.slice(1) : "");
        return [`• ${t.label}${hint ? `: ${hint}` : ""}`];
      });
      return { text: `The tools:\n${lines.join("\n")}`, buttons: [open, { text: "Create a model", url: `${site}/reference-sheet` }] };
    }
    case "/tokens":
      return {
        text: [
          "Tokens pay for pictures and prompts on the platform. Bought tokens never expire.",
          "",
          ...CREDIT_PACKS.map((p) => `${p.credits.toLocaleString("en-US")} tokens · ${dollars(p.priceCents)} or ${stars(p.stars)}${p.tag ? ` (${p.tag})` : ""}`),
          "",
          "Pick a pack on the site and choose Telegram Stars; payment opens here.",
        ].join("\n"),
        buttons: [{ text: "Buy tokens", url: `${site}/tokens` }],
      };
    case "/pro":
      return {
        text: [
          `ModelSpawn Pro · ${dollars(PRO.priceCents)} or ${stars(PRO.stars)} for ${PRO.days} days`,
          "• Use your own API keys",
          "• No daily limits",
          `• ${PRO.firstMonthCredits} tokens the first month, ${PRO.monthlyCredits} every month after`,
          "",
          "With Stars it renews every 30 days until you cancel it in Telegram.",
        ].join("\n"),
        buttons: [{ text: "Get Pro", url: `${site}/upgrade` }],
      };
    case "/key":
      return { text: "Pro lets you bring your own API key. This guide shows how to get one and plug it in.", buttons: [{ text: "API key guide", url: `${site}${GET_KEY_PATH}` }] };
    case "/invite":
      return { text: "Your invite link and the friends who joined are on the Tokens page.", buttons: [{ text: "Invite a friend", url: `${site}/tokens#invite` }] };
    case "/discord":
      return { text: "Feature requests, help and show-and-tell from other users.", buttons: [{ text: "Join the Discord", url: DISCORD_URL }] };
    case "/terms":
      return { text: `Terms of Service: ${site}/terms\nPrivacy Policy: ${site}/privacy` };
    case "/support":
      return {
        text: `Need help using ModelSpawn? The FAQ answers most questions, the Discord has other users who can help, or email ${CONTACT_EMAIL}.\n\nProblem with a payment? Use /paysupport.`,
        buttons: [{ text: "Read the FAQ", url: `${site}/#faq` }, { text: "Join the Discord", url: DISCORD_URL }],
      };
    case "/paysupport":
      return {
        text: `Payment problem? Tokens and Pro normally arrive within a minute. Check your balance on the Tokens page first.\n\nStill missing? Email ${CONTACT_EMAIL} with your Telegram payment receipt (open the payment message, then tap the receipt). All sales are final (see /terms).`,
        buttons: [{ text: "Check my tokens", url: `${site}/tokens` }],
      };
    default:
      return null;
  }
}

/** Said to anything that isn't a command this bot knows (including plain text). */
export const NOT_A_COMMAND: Reply = { text: "I only know a few commands. Type /help to see them." };

/** "/Tokens@ModelSpawnBot extra words" → "/tokens". */
export const commandWord = (text: string): string => (text.trim().split(/\s+/)[0] ?? "").split("@")[0].toLowerCase();
