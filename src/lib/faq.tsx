import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { CONTACT_EMAIL, DISCORD_URL, GET_KEY_PATH } from "@/lib/links";
import { dollars, FREE_CREDITS, PRO } from "@/lib/plans";
import { GENERATION_RETENTION_HOURS } from "@/lib/retention";

/** The landing page's questions and answers, in groups. Add, reword or remove entries here and the page follows. */
export interface Faq {
  q: string;
  a: React.ReactNode;
}

const LINK = "font-semibold text-white underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white";
const A = ({ href, children }: { href: string; children: React.ReactNode }) =>
  href.startsWith("/") ? (
    <Link href={href} className={LINK}>{children}</Link>
  ) : (
    <a href={href} className={LINK} {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>
  );
/** An on-brand badge that sets a tip apart from the answer around it. */
const ProTip = () => (
  <span className="mr-1.5 inline-flex -translate-y-px items-center gap-1 rounded-full bg-gradient-to-r from-[#e8265e] to-[#ff5c8a] px-2.5 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide text-white shadow-[0_6px_16px_-8px_rgb(232_38_94/0.9)]">
    <Lightbulb aria-hidden="true" className="h-3 w-3" /> Pro tip
  </span>
);
const Email = () => <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>;
const KeyGuide = ({ children = "API key guide" }: { children?: React.ReactNode }) => <A href={GET_KEY_PATH}>{children}</A>;

export const FAQ_GROUPS: { title: string; items: Faq[] }[] = [
  {
    title: "Getting started",
    items: [
      {
        q: "What is ModelSpawn?",
        a: "A creation suite for AI models and influencers. You create a model once, and ModelSpawn keeps her face and body the same in every picture: it writes the prompts, locks her identity into them, and scores the results for likeness.",
      },
      {
        q: "I've never made an AI model. How long until my first picture?",
        a: (
          <>
            Five minutes or less. All you need to start is a face photo. We recommend <A href="https://www.midjourney.com">Midjourney</A> (every face is AI),{" "}
            <A href="https://thispersondoesnotexist.com">This Person Does Not Exist</A> (free), <A href="https://gemini.google.com">Gemini</A> or{" "}
            <A href="https://chatgpt.com">ChatGPT</A> (free generation), or our own <A href="/art-to-real">Art to Real tool</A>, which turns an artwork into a real-looking influencer.
          </>
        ),
      },
      {
        q: `What do the ${FREE_CREDITS} free tokens get me?`,
        a: "Enough to run the creation wizard, build your model's profile, and see her in her first image.",
      },
      {
        q: "Do I need to know how to write prompts?",
        a: "No. That is the part we built it to take off your hands. Add a photo you like or describe what you want in your own words, and the prompt is written for you.",
      },
      {
        q: "Does it work on a phone?",
        a: (
          <>
            Yes, ModelSpawn has a fully working mobile layout. <ProTip />Add the site to your home screen and it opens like an app.
          </>
        ),
      },
      {
        q: "Can I make video?",
        a: "Images only for now. Video is planned, and it is a simple addition to the platform once early access is over.",
      },
    ],
  },
  {
    title: "Your model and your pictures",
    items: [
      {
        q: "Who owns my model and the images?",
        a: "You do. Every model and image is yours, whether you created her or bought her.",
      },
      {
        q: "Can I base a model on a real person, or on myself?",
        a: (
          <>
            Never a real person unless you have their consent; see our <A href="/terms">Terms</A>. You can absolutely make your own twin.
          </>
        ),
      },
      {
        q: "Can I make adult content?",
        a: (
          <>
            That depends on the image model you use, and you would have to find out. We add no filters of our own, and API keys to certain models allow it. See our <KeyGuide />.
          </>
        ),
      },
      {
        q: "How many models can I run?",
        a: "As many as you like on Pro, whether that is one persona or an agency's whole roster. The free plan includes one.",
      },
      {
        q: "Which image generators do the prompts work with?",
        a: "Any of them will generate from our prompts. They are optimized for Seedream by ByteDance, GPT Image and Nano Banana. Before building our own platform we worked exclusively on Wavespeed and Higgsfield, through 2025.",
      },
      {
        q: "What do I get when I buy a model from the marketplace?",
        a: (
          <>
            Each persona is exclusive: she is sold once, to one owner. You get two reference sheets and three to five photos of her, yours to post, train with elsewhere or take off the platform entirely. <ProTip />Use Photoshoot mode to make variants of the photos that come with her.
          </>
        ),
      },
    ],
  },
  {
    title: "Privacy",
    items: [
      {
        q: "Who can see my models and pictures?",
        a: "Only you can see your pictures. On our side we see account details such as your model's ID, never her images. Delete a model or your account and its pictures and models are deleted from our servers too.",
      },
      {
        q: "How long are my images kept? Can I download them?",
        a: `Generated images are stored for ${GENERATION_RETENTION_HOURS} hours, and you can download anything you make. Save the ones you want to keep.`,
      },
    ],
  },
  {
    title: "Plans and payment",
    items: [
      {
        q: "Is it free to try?",
        a: `Yes. Every new account gets ${FREE_CREDITS} tokens and one model, with no payment details asked for. Pro is ${dollars(PRO.priceCents)} for ${PRO.days} days when you want more (${PRO.stars} Stars in Telegram, where the price of Stars varies a little by device and region).`,
      },
      {
        q: "How do I pay? Do you need my card?",
        a: "We never ask for or store card details. You pay with Telegram Stars or with crypto, for either Pro or a pack of tokens. Bought tokens never expire.",
      },
      {
        q: "I don't use Telegram or crypto. Is there another way?",
        a: (
          <>
            Email <Email /> and we will sort out an alternative. We keep payments this way for your security and anonymity; card support is on the table for the future.
          </>
        ),
      },
      {
        q: "Does Pro renew automatically? What happens if I stop?",
        a: "Paid through Telegram, Pro renews automatically until you cancel it there. Paid with crypto, you renew it yourself. Either way you keep your model and every image you downloaded after your subscription ends.",
      },
      {
        q: "What is \"bring your own key\"?",
        a: (
          <>
            You bring your own generation power and blend it with our prompt optimization. On Pro you add your own API key, and images made on it cost no tokens. Our <KeyGuide /> walks you through getting one.
          </>
        ),
      },
      {
        q: "What if a generation fails?",
        a: "The tokens for it come straight back to your balance. Purchases themselves are not refundable.",
      },
      {
        q: "Who can use ModelSpawn?",
        a: "Adults only. You confirm you are 18 or older when you sign up.",
      },
    ],
  },
  {
    title: "Support and community",
    items: [
      {
        q: "How do I reach support?",
        a: (
          <>
            Email <Email />. We always reply within 24 hours, and usually within a few.
          </>
        ),
      },
      {
        q: "You say \"build with us\". How do I ask for a feature?",
        a: (
          <>
            Join <A href={DISCORD_URL}>our Discord</A>, or email <Email />. It is early days, so requests really do shape what gets built next.
          </>
        ),
      },
    ],
  },
];
