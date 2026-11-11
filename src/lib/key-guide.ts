/**
 * The "Get your own API key" guide: every step, its screenshots and the models we recommend. One source for the page,
 * whichever layout shows it.
 */

export interface GuideShot {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface GuideStep {
  /** Short title, an action. */
  title: string;
  /** One or two sentences. `**bold**` marks button and menu names. */
  body: string;
  /** Extra details as a short list. */
  points?: string[];
  /** A callout under the text. */
  note?: { tone: "warn" | "tip"; text: string };
  /** Show the model picks here. */
  models?: boolean;
  /** The referral button here. */
  cta?: boolean;
  shots?: GuideShot[];
  /** Where the step happens. */
  where: "spicyapi" | "modelspawn";
}

export interface GuidePhase {
  title: string;
  blurb: string;
  steps: GuideStep[];
}

const shot = (name: string, alt: string, width: number, height: number): GuideShot => ({ src: `/guide/${name}.webp`, alt, width, height });

export const GUIDE_PHASES: GuidePhase[] = [
  {
    title: "Create your SpicyAPI key",
    blurb: "About 2 minutes on spicyapi.ai.",
    steps: [
      {
        where: "spicyapi",
        title: "Open SpicyAPI",
        body: "Start at SpicyAPI through our link. It opens in a new tab, so this guide stays right here.",
        cta: true,
      },
      {
        where: "spicyapi",
        title: "Sign up",
        body: "Click the golden **Sign up** button in the top right. You can use email, Google or GitHub.",
        shots: [shot("02-sign-up", "SpicyAPI home page with the golden Sign up button in the top right", 1287, 561)],
      },
      {
        where: "spicyapi",
        title: "Open the API quickstart",
        body: "Open **Integrations** in the top bar, then click **Start here** under API quickstart.",
        shots: [shot("03-integrations", "The Integrations menu with the Start here button under API quickstart", 1287, 561)],
      },
      {
        where: "spicyapi",
        title: "Create a server-side key",
        body: "Click **Create Server-Side API key**. On the API keys screen, click **+ Create key** in the top right.",
        shots: [shot("04-create-key", "The API keys screen with the Create key button in the top right", 1400, 189)],
      },
      {
        where: "spicyapi",
        title: "Set up the key",
        body: "Give it any name you like, then:",
        points: [
          "Permission preset: **Model API**",
          "Leave every capability checked, and the default additional permissions as they are",
          "IP allow list: **Any address**",
          "Optional: under **Advanced**, set daily and monthly spend limits",
        ],
        shots: [shot("05-key-settings", "The Create an API key window with the Model API preset selected", 605, 826)],
      },
      {
        where: "spicyapi",
        title: "Copy your key and keep it safe",
        body: "Click **Create key**, then **Copy the key**.",
        note: { tone: "warn", text: "SpicyAPI shows the full key only once. Save it in a password manager or a private note before you close the window." },
        shots: [shot("06-key-ready", "Your new API key is ready, with the Copy the key button", 1163, 1352)],
      },
    ],
  },
  {
    title: "Connect it to Model Spawn",
    blurb: "Paste the key in Settings.",
    steps: [
      {
        where: "modelspawn",
        title: "Paste it into Settings",
        body: "In Model Spawn, open your profile menu, then **Settings**. Paste the key into the **Vision** box. The **Text** box is optional.",
        shots: [shot("07-paste-key", "Model Spawn Settings with the Vision key box", 1400, 721)],
      },
      {
        where: "modelspawn",
        title: "Model Spawn recognises it",
        body: "You'll see **Detected: SpicyAPI** straight away. Next, choose which models the key can use.",
        shots: [shot("08-detected", "The Vision box showing Detected: SpicyAPI", 925, 787)],
      },
    ],
  },
  {
    title: "Choose your models",
    blurb: "Pick the AI models your key can use.",
    steps: [
      {
        where: "spicyapi",
        title: "Choose the models your key can use",
        body: "Back on SpicyAPI, click the **…** next to your key and choose **Edit**. Open **Allowed models**, choose **Selected models**, then search for and tick the models you want. Click **Save**.",
        models: true,
        shots: [
          shot("09-allowed-models", "Edit key with Allowed models and the model search list", 1098, 824),
          shot("09-selected-models", "Edit key with eight selected models", 596, 824),
        ],
      },
      {
        where: "modelspawn",
        title: "Set the models in Model Spawn",
        body: "Paste your vision model's ID into the **Model** box under Vision, then **Save key**. Scroll to the **Image** box and click **Use it** to use the same key with your image model.",
        shots: [
          shot("10-vision-model", "The Model box under Vision with a model ID", 840, 480),
          shot("10-image-use-it", "The Image box with Use it, to reuse the Vision key", 840, 449),
        ],
      },
      {
        where: "modelspawn",
        title: "Turn on image generation",
        body: "You'll see **Model updated.** Then click **Enable image generation** and confirm.",
        note: { tone: "tip", text: "Optional: press **Test key** on each box to check everything works." },
        shots: [shot("11-enable-generation", "Model updated, and the Enable image generation button", 840, 574)],
      },
    ],
  },
];

/** Model IDs to copy, with what each is for. */
export const GUIDE_MODELS = {
  vision: [
    { name: "Claude Sonnet 5.5", id: "anthropic/claude-sonnet-5.5/chat", note: "Recommended" },
    { name: "Kimi K3", id: "moonshot/kimi-k3/chat", note: "Cheaper than Sonnet" },
  ],
  image: [
    { name: "Seedream 5 Pro", id: "bytedance/seedream-5.0-pro/edit", note: "Recommended" },
    { name: "Seedream 5.5", id: "bytedance/seedream-5.5/edit", note: "Newer" },
  ],
} as const;

export const GUIDE_BALANCE_NOTE =
  "Bringing your own key means SpicyAPI charges you directly, so add a balance under Billing on SpicyAPI before you generate. Your Model Spawn membership pays for the site itself, so we can keep improving it.";

export const GUIDE_UPDATED = "November 10, 2026";

/** Step text with **bold** turned into spans. */
export function guideRich(text: string): (string | { b: string })[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? { b: part } : part));
}
