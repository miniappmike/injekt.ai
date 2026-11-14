import { dollars, FREE_CREDITS, PRO } from "@/lib/plans";

/**
 * The landing page's questions and answers. These first ones are drafted from the Terms and the pricing notes;
 * add, reword or remove entries here and the page follows.
 */
export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: "What is ModelSpawn?",
    a: "A creation suite for AI models and influencers. You create a model once, and ModelSpawn keeps her face and body the same in every picture: it writes the prompts, locks her identity into them, and scores the results for likeness.",
  },
  {
    q: "Do I need to know how to write prompts?",
    a: "No. That is the part we built it to take off your hands. Add a photo you like or describe what you want in your own words, and the prompt is written for you.",
  },
  {
    q: "Is it free to try?",
    a: `Yes. Every new account gets ${FREE_CREDITS} tokens and one model, with no payment details asked for. Pro is ${dollars(PRO.priceCents)} for ${PRO.days} days when you want more.`,
  },
  {
    q: "How do I pay? Do you need my card?",
    a: "We never ask for or store card details. You pay with Telegram Stars or with crypto, for either Pro or a pack of tokens. Bought tokens never expire.",
  },
  {
    q: "Do I need my own API key?",
    a: "No. Tokens cover everything on our key. On Pro you can bring your own keys instead, and images made on your own image key cost no tokens.",
  },
  {
    q: "What if a generation fails?",
    a: "The tokens for it come straight back to your balance. Purchases themselves are not refundable.",
  },
  {
    q: "Who can use ModelSpawn?",
    a: "Adults only. You confirm you are 18 or older when you sign up.",
  },
];
