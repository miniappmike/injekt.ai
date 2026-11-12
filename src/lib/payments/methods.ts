/** The ways to pay on the site. Telegram: Stars (bought with a card, Apple Pay or Google Pay). Crypto: NOWPayments. */
export type PayMethod = "telegram" | "crypto";

/** Which ways to pay are set up (their keys are in the environment). */
export interface PayMethods {
  telegram: boolean;
  crypto: boolean;
}
