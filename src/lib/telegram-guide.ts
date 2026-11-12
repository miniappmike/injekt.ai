/**
 * The "How to pay with Telegram" guide: every step and its screenshots, in the same shape as the API key guide.
 * Shown at /guides/telegram-payments, which the Pay with Telegram pop-up links to.
 */
import type { GuidePhase, GuideShot } from "@/lib/key-guide";

const shot = (name: string, device: GuideShot["device"], alt: string, width: number, height: number, caption?: string): GuideShot => ({
  src: `/guide/telegram/${name}.webp`,
  alt,
  width,
  height,
  device,
  caption,
});

/** Why Stars cost less away from the phone apps. Said wherever people choose where to buy them. */
export const STARS_FEE_NOTE =
  "**Stars cost less on web and desktop.** Telegram's iPhone and Android apps add Apple's and Google's app store fees to the price. Buying in Telegram Web or Telegram Desktop avoids those fees, and more of what you pay goes to supporting ModelSpawn.";

export const TELEGRAM_GUIDE_PHASES: GuidePhase[] = [
  {
    title: "Start on ModelSpawn",
    blurb: "Choose what to buy.",
    steps: [
      {
        where: "modelspawn",
        title: "Pick what you're buying",
        body: "Open the [Tokens](/tokens) page from your profile menu or the token icon in the top bar. On the pack you want, click the blue **⭐ Telegram** button. Going Pro instead? Open the [Pro](/upgrade) page and choose **Pay with Telegram**.",
        note: { tone: "tip", text: "New to **Stars**? They are Telegram's own currency, and they are what you pay with here. You buy them inside Telegram with a card, Apple Pay or Google Pay." },
      },
      {
        where: "modelspawn",
        title: "Continue to payment",
        body: "A pop-up shows what you're buying and its price in Stars. Click **Continue to payment**. Telegram opens in a *new tab*, so ModelSpawn stays open in this one.",
        shots: [shot("01-pay-dialog", "site", "The Pay with Telegram pop-up with the Continue to payment button", 1049, 737)],
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
        body: "The new tab shows your order with two buttons. Choose the one that fits your device, and log in to Telegram if it asks you to.",
        points: [
          "**Open in Web**: pay in your browser with Telegram Web. This is the one to use on a Chromebook.",
          "**Open Invoice**: pay in the Telegram app installed on this phone or computer.",
        ],
        shots: [shot("02-open-invoice", "web", "The ModelSpawn tokens invoice with the Open Invoice and Open in Web buttons", 1127, 737)],
      },
      {
        where: "telegram",
        title: "Confirm and pay",
        body: "Telegram asks you to confirm. Your Stars balance is in the *top right* of the pop-up. Check the item and the price, then click **Confirm and Pay**.",
        points: [
          "*Enough Stars?* The payment goes through. Jump to **step 8**.",
          "*Short on Stars?* Close the pop-up and buy some first: on web or desktop in **step 5** (the better price), or in the phone app in **step 6**.",
        ],
        note: { tone: "tip", text: STARS_FEE_NOTE },
        shots: [shot("03-confirm", "web", "Telegram's Confirm Your Purchase pop-up with the Confirm and Pay button", 1145, 768)],
      },
    ],
  },
  {
    title: "Short on Stars?",
    blurb: "Top up, then pay again.",
    steps: [
      {
        where: "telegram",
        title: "Buy Stars on web or desktop",
        body: "*This is the best price.* In Telegram Web or Telegram Desktop, open [@PremiumBot](https://t.me/PremiumBot), Telegram's *official* bot for Stars, or find it with the search bar above your chats. Then follow the four screenshots below:",
        points: [
          "Open **Premium Bot** and click **Start** at the bottom of the chat.",
          "Type **/stars** and send it.",
          "Click **Buy Telegram Stars**.",
          "Pick an amount and pay.",
        ],
        note: [
          { tone: "warn", text: "Only buy from **Premium Bot** with the *verified* checkmark. Bots with similar names are not Telegram's." },
          { tone: "tip", text: "Stars belong to your Telegram account, not to one device. Stars you buy here also show up in the phone app." },
        ],
        shots: [
          shot("web-1-search", "web", "Searching for @premium in Telegram Web, with the verified Premium Bot as the first result", 1400, 854, "**1.** Find the verified **Premium Bot**."),
          shot("web-2-stars-command", "web", "The Premium Bot chat with the /stars command in the command list", 1431, 853, "**2.** Send **/stars**."),
          shot("web-3-buy-button", "web", "Premium Bot showing your balance and the Buy Telegram Stars button", 1431, 853, "**3.** Click **Buy Telegram Stars**."),
          shot("web-4-quantity", "web", "Premium Bot's list of Star amounts and prices", 1431, 853, "**4.** Pick an amount."),
        ],
      },
      {
        where: "telegram",
        title: "Or buy Stars in the phone app",
        body: "Prefer your phone? It is quick, but it costs a little more. In the Telegram app, follow the three screenshots below:",
        points: [
          "Tap the **Settings** gear in the bottom bar, then **My Stars**.",
          "Tap **Buy More Stars**.",
          "Pick an amount and pay.",
        ],
        note: { tone: "warn", text: "**App store fees apply here.** Apple and Google add their fees to Stars bought in the iPhone and Android apps. To pay less, and to send more of your payment to ModelSpawn, buy on web or desktop in **step 5** instead." },
        shots: [
          shot("phone-1-my-stars", "phone", "Telegram Settings on a phone with an arrow pointing to My Stars", 1088, 1300, "**1.** Settings, then **My Stars**."),
          shot("phone-2-balance", "phone", "The Telegram Stars screen on a phone with the Buy More Stars button", 945, 1130, "**2.** Tap **Buy More Stars**."),
          shot("phone-3-get-stars", "phone", "The Get Stars screen on a phone with a list of Star amounts and prices", 945, 1130, "**3.** Pick an amount."),
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
