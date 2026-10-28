import { fence } from "./rules";

/** Artifact A4 extractOutfit, word for word: the outfit as a prompt-ready wardrobe description. */
export const outfitPrompt = (who: string) => `Look at the attached photo and write the outfit as a prompt-ready WARDROBE description for an AI image model.${who ? ` Only describe what this person is wearing: <<<${fence(who)}>>>.` : ""}

Describe ONLY what is worn: every garment, layer, pair of shoes, bag, belt, hat, eyewear, jewellery, watch and other accessory that is visible. Leave out body piercings (belly-button, nose, lip, eyebrow and so on) and tattoos: they belong to the person, not the outfit. Ignore the wearer's face, hair, skin and body entirely.

For each item give the cut and length, fit, fabric, exact colour (for example pale blue and coral red, not just blue), any print or graphic described in words, wear such as fading or fraying, closures or hardware, and how it is worn (tucked, sleeves rolled, open over a top). Name real brands when their logo or name is clearly visible and describe the logo accurately, for example a black Nike tee with a white swoosh and "NIKE" across the chest. Write any lettering as the exact words in quotes, spelled correctly; if the wording is unreadable, use short generic wording or call it a plain graphic with no lettering. Only include items you can actually see; if something is cropped out of frame, leave it out and do not guess.

Write 3 to 6 sentences of plain flowing prose that start with the main garments, then layers, footwear and accessories. Do not use the words photorealistic, stunning, beautiful or detailed. Output only the outfit description, with no preface and no markdown.`;
