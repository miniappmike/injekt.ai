/**
 * The "Your first image" guide: the three things a new account does, step by step with screenshots, in the same shape
 * as the API key guide. Shown at /guides/getting-started; the dashboard's first-steps tile links to it.
 */
import type { GuidePhase, GuideShot } from "@/lib/key-guide";
import { FREE_CREDITS, IMAGE_CREDITS } from "@/lib/plans";

const shot = (name: string, alt: string, width: number, height: number, caption?: string): GuideShot => ({ src: `/guide/start/${name}.webp`, alt, width, height, device: "site", caption });

export const START_GUIDE_UPDATED = "November 16, 2026";

export const START_GUIDE_PHASES: GuidePhase[] = [
  {
    title: "Make her",
    blurb: "About 5 minutes in Create Model.",
    steps: [
      {
        where: "modelspawn",
        title: "Open Create Model",
        body: "Open **More** in the top bar and choose **Create Model**. On a phone, tap **More** in the bar at the bottom.",
        note: { tone: "tip", text: `Your account starts with **${FREE_CREDITS} free tokens**. An image costs ${IMAGE_CREDITS["1k"]} to ${IMAGE_CREDITS["2k"]}, depending on its size.` },
        shots: [shot("01-more-menu", "The More menu open, with Create Model in the list", 1400, 788)],
      },
      {
        where: "modelspawn",
        title: "Name her and add one face photo",
        body: "Type her name, then drop in **one clear photo of her face**, looking at the camera. Everything else is built from this photo.",
        points: ["Front-facing, good light, nothing covering her face.", "No face yet? The links under the box make one for free."],
        shots: [shot("02-face-photo", "Create Model step 1: a name box and a box for one face photo", 1400, 831)],
      },
      {
        where: "modelspawn",
        title: "Make her face sheet",
        body: "Press **Make face sheet**. In about a minute you get a grid of her face from six angles. Happy with it? Press **Next**.",
        note: { tone: "tip", text: "Not quite her? Press the button again. Each try is a new image." },
        shots: [shot("03-face-sheet", "Create Model step 2 with the Make face sheet button", 1400, 831)],
      },
      {
        where: "modelspawn",
        title: "Add her body and finish",
        body: "Add **one to three full-body photos** of the body you want her to have, then press **Make face and body sheet**. When it looks right, save it. She is ready.",
        points: ["One photo is enough. More photos give other angles of the same body, or blend different bodies into one."],
        shots: [shot("04-body", "Create Model step 3: three boxes for full-body photos", 1400, 831)],
      },
    ],
  },
  {
    title: "Put her in a photo",
    blurb: "About 2 minutes in Inject.",
    steps: [
      {
        where: "modelspawn",
        title: "Open Inject and add a photo you like",
        body: "Open **Inject** in the top bar and pick her. Drop in **any photo** with the pose, outfit and place you want her in.",
        points: ["A screenshot from your phone works.", "You can paste a copied picture with Ctrl+V."],
        shots: [shot("05-inject", "The Inject page with a character picked and the box for a target photo", 1400, 831)],
      },
      {
        where: "modelspawn",
        title: "Write the prompt, then generate",
        body: "Press **Write prompts**. When the prompt appears, press **Generate image** under it. Your picture shows up on the page in about a minute.",
        note: { tone: "tip", text: "Images are kept for 72 hours. Press **Download** on the ones you want to keep." },
        shots: [shot("06-write", "Inject's options with the Write prompts button", 1400, 831)],
      },
    ],
  },
  {
    title: "Keep her consistent",
    blurb: "One press on your best image.",
    steps: [
      {
        where: "modelspawn",
        title: "Pin your best image",
        body: "Open an image you love and press **Pin It**. It becomes one of her reference photos, so the next pictures look even more like her.",
        points: ["She can have up to 10 reference photos.", "Find every image you made in **More > Library**."],
        shots: [shot("07-pin", "An image open full screen with the Pin It button", 1400, 788)],
      },
      {
        where: "modelspawn",
        title: "Optional: check the likeness",
        body: "Under any image, **See likeness** scores how close it is to her and offers a one-press fix when something drifted.",
        shots: [shot("08-likeness", "The Likeness page", 1400, 831)],
      },
    ],
  },
];
