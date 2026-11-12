/**
 * The "How to pay with Telegram" guide: every step and its screenshots, in the same shape as the API key guide.
 * Shown at /guides/telegram-payments, which the Pay with Telegram pop-up links to.
 */
import type { GuidePhase, GuideShot } from "@/lib/key-guide";

const shot = (name: string, alt: string, width: number, height: number): GuideShot => ({ src: `/guide/telegram/${name}.webp`, alt, width, height });

export const TELEGRAM_GUIDE_PHASES: GuidePhase[] = [
  {
    title: "Start on ModelSpawn",
    blurb: "Choose what to buy.",
    steps: [
      {
        where: "modelspawn",
        title: "Pick what you're buying",
        body: "Open the [Tokens](/tokens) page from your profile menu or the token icon in the top bar. On the pack you want, click the blue **⭐ Telegram** button. Going Pro instead? Open the [Pro](/upgrade) page and choose **Pay with Telegram**.",
      },
      {
        where: "modelspawn",
        title: "Continue to payment",
        body: "A pop-up shows what you're buying and its price in Stars. Click **Continue to payment**. Telegram opens in a *new tab*, so ModelSpawn stays open in this one.",
        note: { tone: "tip", text: "New to **Stars**? They are Telegram's own currency. You buy them inside Telegram with a card, Apple Pay or Google Pay." },
        shots: [shot("01-pay-dialog", "The Pay with Telegram pop-up with the Continue to payment button", 1049, 737)],
      },
    ],
  },
  {
    title: "Pay in Telegram",
    blurb: "Open the invoice and confirm.",
    steps: [
      {
        where: "telegram",
        title: "Open your invoice",
        body: "Telegram shows your order with two buttons. Choose the one that fits your device, and log in to Telegram if it asks you to.",
        points: [
          "**Open Invoice**: you have the Telegram app on this phone or computer.",
          "**Open in Web**: you're in a browser, such as on a Chromebook, and want to stay there.",
        ],
        shots: [shot("02-open-invoice", "The ModelSpawn tokens invoice with the Open Invoice and Open in Web buttons", 1127, 737)],
      },
      {
        where: "telegram",
        title: "Confirm and pay",
        body: "Check the item and the price, then click **Confirm and Pay**. What happens next depends on your Stars balance, shown in the top right:",
        points: [
          "*Enough Stars?* The payment goes through. Jump to **step 8**.",
          "*Short on Stars in the phone app?* Telegram offers the Stars you need right there. Buy them and your payment finishes. Jump to **step 8**.",
          "*Short on Stars on the web?* Close the pop-up and buy Stars first, in **step 6**.",
        ],
        shots: [shot("03-confirm", "Telegram's Confirm Your Purchase pop-up with the Confirm and Pay button", 1145, 768)],
      },
    ],
  },
  {
    title: "Short on Stars?",
    blurb: "Top up, then pay again.",
    steps: [
      {
        where: "telegram",
        title: "Buy Stars on your phone",
        body: "In the Telegram app, tap the **Settings** gear in the bottom bar, then **My Stars**. Tap **Buy More Stars**, pick an amount and pay.",
        note: { tone: "tip", text: "On a computer or Chromebook? Skip this step and use **step 6** instead." },
        shots: [
          shot("04-phone-my-stars", "Telegram Settings on a phone with an arrow pointing to My Stars", 1088, 940),
          shot("05-phone-get-stars", "The Get Stars screen with a list of Star amounts and prices", 945, 1130),
        ],
      },
      {
        where: "telegram",
        title: "Buy Stars on the web",
        body: "In Telegram Web, use the search bar above your chats to find [@PremiumBot](https://t.me/PremiumBot), Telegram's *official* bot for Stars. Then:",
        points: [
          "Click **Start** at the bottom of the chat.",
          "Type **/stars** and send it.",
          "Click **Buy Telegram Stars**.",
          "Pick an amount and pay.",
        ],
        note: { tone: "warn", text: "Only buy from **Premium Bot** with the *verified* checkmark. Bots with similar names are not Telegram's." },
        shots: [
          shot("06-web-search", "Searching for @premium in Telegram Web, with the verified Premium Bot as the first result", 1400, 854),
          shot("07-web-stars-command", "The Premium Bot chat with the /stars command in the command list", 1431, 853),
          shot("08-web-buy-button", "Premium Bot showing your balance and the Buy Telegram Stars button", 1431, 853),
          shot("09-web-quantity", "Premium Bot's list of Star amounts and prices", 1431, 853),
        ],
      },
      {
        where: "modelspawn",
        title: "Go back and finish paying",
        body: "With Stars in your balance, return to the [Tokens](/tokens) page and repeat **steps 1 to 4**. This time, **Confirm and Pay** goes straight through.",
        note: { tone: "tip", text: "The bot can't sell tokens from the chat itself, so every payment *starts* on ModelSpawn." },
      },
    ],
  },
  {
    title: "Finish up",
    blurb: "Your tokens arrive.",
    steps: [
      {
        where: "modelspawn",
        title: "Get your tokens",
        body: "The ModelSpawn bot replies **Done!** in Telegram, and your purchase is added to your account *straight away*. Return to your ModelSpawn tab and refresh the [Tokens](/tokens) page to see your new balance.",
        points: [
          "Tokens you buy **never expire**.",
          "**Pro** renews every 30 days until you cancel it in Telegram.",
        ],
      },
    ],
  },
];

export const TELEGRAM_GUIDE_UPDATED = "November 12, 2026";
