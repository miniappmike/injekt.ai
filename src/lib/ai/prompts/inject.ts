/**
 * Inject: the main prompt builder (artifact A8) and output parsing (A9), word for word. Model Spawn has no app-level
 * nudity screening, so the NUDITY FILTER, strict safe mode, [[SAFE-SWAP]] and the NUDITY output line are left out; the
 * "revealing clothing is fine" rule, the adult-only wording and the mild body wording stay.
 */
import { fence } from "./rules";
import { profileBlock } from "../tasks/profile-builder";
import type { CharacterProfile } from "@/lib/characters";
import type { POSE_MODES, PROMPT_STYLES, WARDROBES } from "@/lib/inject-meta";


export interface InjectOptions {
  /** ref: the generator gets her sheet as the tag; text: identity written out in full. */
  mode: "ref" | "text";
  /** full = Sectioned (default), narrative, short. */
  len: (typeof PROMPT_STYLES)[number];
  ward: (typeof WARDROBES)[number];
  /** Which person to replace when the target shows several. */
  who: string;
  extra: string;
  /** What the prompt calls her sheet in the generator. */
  tag: string;
  /** Extracted or saved outfit text, for ward "extracted". */
  exText: string;
  poseMode: (typeof POSE_MODES)[number];
  pose: boolean;
  count: number;
  recolor: boolean;
  hair: boolean;
  newOutfit: boolean;
  clean: boolean;
}

export interface VersionPlan {
  palette: string;
  hair: string;
}

export interface InjectCharacter {
  profile: CharacterProfile;
  always_keep?: string | null;
  height?: string | null;
  weight?: string | null;
}

/** The artifact's buildInjectPrompt, without the nudity rules. `sheet` is sheetLines() for her pack. */
export function buildInjectPrompt(c: InjectCharacter, sheet: string, o: InjectOptions, plans: VersionPlan[], refCount: number, recent: string[], inspo: string[]): string {
  const n = plans.length;
  const lead =
    o.mode === "ref"
      ? (o.tag
          ? `Open with exactly: "Use ${o.tag} as the strict identity reference." (${o.tag} is the character sheet loaded in the user's generator), then`
          : 'Open with: "Use the uploaded character sheet as the strict identity reference." followed by') +
        " the specific identity features to preserve that are visible in the target's framing (face, eyes, freckles or marks, lips, hair, signature accessories), written from the profile."
      : "There is no reference image in this workflow, so open with an identity paragraph built from the profile (face, eyes, skin marks, hair, build, accessories), limited to what is visible in the target's framing, so the model can reproduce the same person from text alone.";
  const wardLine = o.newOutfit
    ? `WARDROBE (new outfit): do not reuse the target's clothing. Design a completely different outfit that keeps the target's vibe and aesthetic (style, colour story, level of dressiness, season) and makes sense for this exact scene and activity. Name every garment with its type, fabric, fit and colour, plus footwear if the feet are in frame and accessories; real brands are fine where they fit the aesthetic. Keep the character's signature accessories if they suit it.${n > 1 ? " Every version gets a different outfit." : ""}`
    : o.ward === "extracted" && o.exText
      ? `WARDROBE: dress the character in exactly this outfit and write it into the prompt without changing any garment or fit: <<<${fence(o.exText)}>>> Keep the character's signature accessories only if they do not clash with it.`
      : o.ward !== "signature"
        ? 'WARDROBE: describe the clothing, accessories and styling worn in the target image exactly (fabric, fit, colour, wear, trims, stripes, zips, logos), but not the target person\'s body piercings or tattoos. Also name the main garments with their colours in the very first sentence of the prompt (for example "photo of a young woman in a black sleeveless half-zip crop top and black bike shorts with a grey side stripe ..."), so the outfit is stated up front as well as in the wardrobe description. Keep the character\'s signature accessories if they do not clash with the outfit.'
        : "WARDROBE: dress the character in an outfit consistent with the profile's signature style and accessories instead of the target's clothing, keeping the target's mood and season.";
  const format =
    o.len === "narrative"
      ? 'FORMAT: each prompt is one long flowing narrative paragraph of roughly 300 to 450 words, written like a vivid scene description, with no section labels or bullet points. Order: who is there, what they are doing and the mood; expression and gaze; hair; the pose limb by limb using left and right and what each hand holds or touches; the outfit; the character\'s face and skin from the profile; the setting and everything visible in the room or reflection; the light with its source and direction; the capture device and image quality; the colour palette; the overall vibe in one sentence; the aspect ratio. Use concrete everyday phrases such as "messy low bun" or "foot flat on the floor" instead of abstract adjectives. Finish with the exclusions (no text overlays, no watermark, no added logos beyond the brands named in the prompt, no garbled or made-up lettering).'
      : o.len === "short"
        ? 'FORMAT: each prompt is one tight paragraph that begins "Photo of ...", then the identity, action, setting, light and camera look in that order, then one closing line for aspect ratio and exclusions.'
        : "FORMAT: each prompt has an identity paragraph first, then labelled sections in this order: SCENE, WARDROBE, BACKGROUND, LIGHT, CAMERA AND LOOK, and ends with one line of exclusions (no text overlays or captions, no watermark, no added logos beyond the brands named in the prompt, no garbled or made-up lettering). Do not mention aspect ratio anywhere. Section bodies are short flowing prose, no bullet points.";
  const safeRule =
    '- REVEALING CLOTHING IS FINE: bikinis, lingerie, bodysuits, crop tops, mini skirts, micro shorts, low necklines and similar outfits are kept as worn. Describe them plainly and briefly by garment type, colour, fabric and fit (for example "a black lace bralette and matching high-cut briefs"), without dwelling on the body. Do not swap these for other clothing.\n';
  const keepLine = o.pose
    ? "- Keep from the target: props, setting, composition, framing and camera angle. The pose changes (see POSE)."
    : "- Keep from the target: pose and body position, hand placement, gaze and expression, props, setting, composition and camera angle.";
  const varRules = [
    o.poseMode === "social"
      ? `- POSE (social media variation): recreate the target exactly (same outfit, setting, props, light, colour, camera, lens look and framing) and change only the pose. Read the image's vibe (setting, props, mood, time of day, camera position) and invent a fresh, eye-catching pose for each version that a popular lifestyle creator would post: confident, playful or effortlessly candid, physically possible in this space from this camera position, non-sexual, and different from the target's pose${n > 1 ? ". Make every version clearly different (mix standing, sitting, lying, motion, using a prop, a gesture near the face)" : ""}.`
      : o.pose
        ? `- POSE (natural variation): do not copy the target pose. Invent a relaxed, natural, candid, non-sexual pose that fits this setting, camera position and framing${n > 1 ? ", different in every version" : ""}.`
        : "",
    o.pose
      ? `- Keep props logical (a mirror selfie still holds the phone). Describe the pose limb by limb with left and right, with a matching expression and gaze. Adjust the framing only as much as the pose needs.${recent.length ? ` Do not repeat or closely echo these recently used poses: ${recent.join("; ")}.` : ""} For inspiration only, never copy: ${inspo.join("; ")}.`
      : "",
    o.recolor
      ? "- CLOTHING RECOLOUR: keep every garment's type, cut, fit, fabric and texture, but recolour the outfit with the palette given for that version in the VERSION PLAN. State the new colour of each garment. This overrides any colour given elsewhere."
      : "",
    o.hair
      ? "- HAIRSTYLE: style the hair as given for that version in the VERSION PLAN, keeping the profile's exact hair colour, length, texture and highlights. If the hair is too short for it, choose the closest style that suits its length. This overrides the target's hairstyle."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const plan =
    o.recolor || o.hair
      ? "VERSION PLAN\n" + plans.map((p, i) => `- Version ${i + 1}:${o.recolor ? ` colours = ${p.palette};` : ""}${o.hair ? ` hair = ${p.hair};` : ""}`).join("\n") + "\n\n"
      : "";
  return `TASK: The FIRST attached image is the TARGET photo.${refCount ? ` The next ${refCount} image${refCount > 1 ? "s are" : " is"} reference photos of the character.` : ""} Write ${n > 1 ? n + " prompts" : "one prompt"} for an AI image model that recreate the target photo with the CHARACTER below in place of the person in it${o.who ? ` (the person to replace: <<<${fence(o.who)}>>>)` : ""}.

CHARACTER PROFILE (locked; use these exact traits and never contradict them)
${profileBlock(c)}${sheet}

${plan}HARD RULES
- ILLUSTRATED TARGETS: if the target is anime, manga, a cartoon, a drawing, digital art or a 3D render, use it only as a reference for pose, outfit, accessories, composition and mood, and turn it into a real photograph. Translate every drawn element into its real-world equivalent: real fabrics with weight, seams and creases, real shoes and bags, real skin, real lighting and a real camera. Ignore the drawn character's exaggerated proportions and use the character profile's real build instead. Never mention anime, illustration, drawing, art style, cel shading, line art or any named fictional character in the prompt.
- NO SCENE IN THE TARGET: if the background is plain white, transparent, a flat colour, a studio cut-out or otherwise empty, invent a believable real-world location that suits the outfit, pose and vibe (for example, a fitted knit dress with a shoulder bag suits a city sidewalk or a stylish café at golden hour), and describe it concretely with matching light. Keep the target's framing, such as full body head to toe.
- LEGIBLE TEXT ONLY: never leave lettering vague (no "a graphic print with text"). For every piece of visible text in the scene (clothing prints, signs, posters, book covers, screens, packaging, phone cases, mugs, tattoos), write the exact short words in quotes and say they are clean and legible, in clear print or neat cursive. Keep real brands, logos and slogans exactly as they appear in the target, named and spelled correctly, with the logo described accurately (for example a Nike swoosh, the Adidas three stripes, "Champion" script); brands make the photo real. Keep any other wording that is clearly readable. Only if text is unreadable, gibberish or foreign-looking scribble, or is a real person's name, replace it with short generic wording in quotes (for example "good vibes", "sunday", "coffee club", "est. 2019", "hello") or describe that item as a plain design with no lettering. Keep small background text to a minimum: soften it out of focus or leave the surface plain.
- SOCIAL MEDIA QUALITY (default): unless the user's extra direction says otherwise, make every prompt look like a real, unedited photo a creator actually posted: believable light, the subject clearly the focus, vertical framing suited to a feed or story, focus on the face with natural softness and falloff elsewhere, a natural colour grade, shot on a phone. It must read as a real camera capture, never a retouched, glossy, beauty-filtered or CGI image. Never use the words flawless, polished, glossy, glowing, radiant, dewy, luminous, porcelain, airbrushed, smooth skin, perfect, ultra-sharp or crisp.
- NO FACE IN THE TARGET: if the target person's face is not visible (cropped out of frame, turned fully away, a back view, hidden behind a phone, hands, hair, mask or helmet, or a body-only crop), keep the exact framing and crop of the target and do not add a face that is not in frame. Put the likeness into everything that is visible instead: the character's exact body build and proportions, height impression, skin tone and undertone, freckles, moles, tattoos and other marks from the profile, hands and nails, hair colour, texture, length and style if any hair shows, and the signature accessories. State plainly that this is the same person as the reference so the body matches her exactly.
- VISIBLE TRAITS ONLY: first work out what of the person is actually in frame in the target and from which side (how much of the face, the hair, which body parts, hands, legs, feet). Bring in only the character traits that would be visible in that framing and angle, and leave out everything cropped out or hidden: no eye colour, brows or face freckles for a back view or a face hidden behind a phone; no legs, feet, height or full-figure build for a head-and-shoulders crop; no tattoos, moles or marks on areas that are covered by clothing or out of frame; no accessories that would not show from that side. Covered body parts keep the character's shape, but their skin details are not described.
- BODY ADHERENCE (strict, required): the character's body replaces the target person's body completely. Restate the profile's body and build with its concrete proportion anchors for the parts of the body that are in frame (frame, shoulder width, bust, waist, hips, glutes, thigh and leg length, muscle tone, height impression) in neutral, fashion-catalogue wording, and say the body must match the reference exactly with no slimming, enlarging or idealising. Never carry over the target person's figure, even when the outfit or pose shows it off.
- BODY MODIFICATIONS BELONG TO THE CHARACTER: never carry over the target person's tattoos, piercings (belly-button/navel, nose, septum, lip, eyebrow, tongue, extra ear piercings), scars, birthmarks or moles, and never list them as jewellery or accessories. Only include ones that the character profile or reference sheet lines give her. When the target shows one she does not have, add a short negative for it in the prompt, for example "no navel piercing" or "no tattoos on her arms", so the generator does not copy it.
- TATTOOS ARE SKIN, NEVER CLOTHING: her tattoos exist only on her bare skin. Mention a tattoo only when its exact spot is bare and in frame in this version's outfit and pose. When the outfit covers that spot (for example a catsuit, bodysuit, one-piece swimsuit, high-waisted bottoms or a top over a lower-belly tattoo), do not mention the tattoo at all, and if that garment has no print of its own, describe it as plain and solid with no print, motif or graphic. Never describe a tattoo design as a print, pattern, patch, embroidery or logo on any garment.
- Do NOT describe the target person's face, hair colour, skin, body shape or distinguishing marks. Replace them entirely with the character profile. Do not name or identify anyone.
${keepLine}
- ${lead}
- ${wardLine}
- The character's reference images show her in a plain placeholder outfit. Never describe or reuse it; she wears only the wardrobe above.
- Begin by saying who is there and what they are doing, as a plain "photo of ..." or scene description. Never use "photorealistic", "photorealism", "8k", "hyper-detailed", "ultra HD" or similar filler; say what is physically visible instead.
- Always describe the character as an adult (young woman, woman, young man, man), never as a girl, boy, teen or child, and never state an age under 21.
- Body shape: describe the build exactly as the reference sheet lines state (or the profile when there are none), in neutral, fashion-catalogue wording such as curvy hourglass figure, wide hips, full rounded glutes, fuller bust, narrow waist, slim build or petite frame. Never soften a curvy build into slim or athletic, and never make a slim build curvy. Replace any explicit or sexual detail with one of these mild terms. Never use explicit or anatomical sexual language, never call clothing see-through or underwear-like, and leave out remarks about attractiveness.
- If the profile gives a height or weight, turn them into visual build terms (for example tall and long-limbed, petite, slender). Mention the height once in plain terms such as about 5'6", only when most of the body is in frame. Never write the weight as a number.
- Light: name the source and direction (for example key light from top right, bounce fill from low left, hard midday sun overhead, daylight through blinds off camera). Never write just "natural lighting". Let the setting inform the light.
- If the target looks candid or phone-shot, say so. Add film stock, lens or grade details only if the image clearly shows them. If you name a camera body, put it near the end.
${o.len === "full" ? "- Do not mention aspect ratio or image dimensions." : "- State the aspect ratio you believe the target has."}
- REALISM, required in every prompt: (1) a skin sentence: real, unretouched, matte skin with visible pores, fine peach fuzz, uneven tone, faint redness and small natural imperfections, using the profile's skin tone and marks, plus a few flyaway hairs, and never shine, glow or smoothness; (2) a materials sentence: the real texture of the fabrics, surfaces and objects, such as ribbed knit weave, soft fleece, creases, fraying, wood grain, dust; (3) a camera quality sentence matching how the target was captured: device or camera type, focal length look, depth of field, noise or grain, sharpening, dynamic range. Always include real camera imperfections: slight softness and focus falloff away from the face, faint motion blur where something moves, visible noise in the shadows, mild compression and slightly imperfect white balance. A phone photo gets a smartphone main-camera look with those imperfections and true-to-life colour. A film photo gets grain, halation and its colour grade. A green screen or coloured backdrop casts a faint colour spill on the skin and clothes.
${varRules ? varRules + "\n" : ""}- ${format}
${safeRule}${o.clean ? '- OVERLAYS: the target may have app interface buttons, icons, watermarks, usernames, stickers, emoji or caption text laid on top of the photo, or soft painted-over patches where they were removed. They are not part of the scene: never describe them, and add "no app interface elements, floating buttons, stickers or screen overlays" to the exclusions.\n' : ""}${o.extra ? `- Creative direction from the user, applied on top only as it applies to the image: <<<${fence(o.extra)}>>>\n` : ""}
OUTPUT CONTRACT
- Write exactly ${n} version${n > 1 ? "s" : ""}. Start each version with a line containing exactly ===VERSION k=== where k is its number, starting at 1.
${o.pose ? "- Directly under that marker write one line that starts with POSE: followed by that version's pose in at most 12 words.\n" : ""}- Then one line that starts with IN FRAME: followed by the parts of the person that will be visible in this version, chosen from: face, back of head, hair, shoulders, bust, arms, waist, hips, glutes, thighs, legs, feet.
- Then one line that starts with OUTFIT: followed by the outfit she wears in this version in at most 30 words, garment by garment with colours, exactly as the prompt dresses her (after any recolour or new outfit).
- Then one line that starts with EDIT: followed by a short instruction, at most 60 words, for a photo editor that already has the target photo and her reference images, naming only what this version changes in the target photo: the new pose, the new outfit or colours, the hairstyle, a new background when the target's is empty, turning a drawing or render into a real photo, the exact replacement wording for unreadable or gibberish text, and removing any tattoo, piercing or mark of the target person that the character does not have (for example "remove the navel piercing"). Never describe her face, skin, hair colour or body, and never describe the scene, in it. Write EDIT: none when nothing changes.
- Then the finished prompt. Nothing before the first marker and nothing after the last prompt.`;
}


export interface ParsedVersion {
  pose: string;
  frame: string;
  edit: string;
  outfit: string;
  text: string;
}

const cleanOut = (t: string) =>
  t
    .replace(/\s*\[\[SAFE-SWAP\]\]\s*/g, "\n")
    .replace(/\s*\[\[[A-Z-]*\]?$/, "")
    .replace(/\n[ \t]*={2,}[^\n]*$/, "")
    .trim();

/** Splits the reply into versions and reads the machine lines (POSE, IN FRAME, OUTFIT, EDIT) in any order. */
export function parseVersions(text: string): ParsedVersion[] {
  const parts = String(text).split(/^[ \t]*={2,}\s*VERSION\s*\d+\s*={2,}[ \t]*$/im);
  const body = parts.length > 1 ? parts.slice(1) : [parts[0]];
  return body.map((p) => {
    let pose = "";
    let frame = "";
    let edit = "";
    let outfit = "";
    for (let k = 0; k < 5; k++)
      p = p
        .replace(/^\s*OUTFIT:\s*([^\n]*)\n?/i, (_m, x: string) => ((outfit = x.trim().slice(0, 300)), ""))
        .replace(/^\s*POSE:\s*([^\n]*)\n?/i, (_m, x: string) => ((pose = x.trim()), ""))
        .replace(/^\s*IN FRAME:\s*([^\n]*)\n?/i, (_m, x: string) => ((frame = x.trim().slice(0, 200)), ""))
        // A model that still writes a NUDITY line from habit has it removed, not shown in the prompt.
        .replace(/^\s*NUDITY:\s*([^\n]*)\n?/i, () => "")
        .replace(/^\s*EDIT:\s*([^\n]*)\n?/i, (_m, x: string) => ((edit = x.trim().slice(0, 600)), ""));
    p = p
      .replace(/^[ \t]*NUDITY:[ \t]*([^\n]*)$\n?/gim, () => "")
      .replace(/^[ \t]*EDIT:[ \t]*([^\n]*)$\n?/gim, (_m, x: string) => {
        if (!edit) edit = x.trim().slice(0, 600);
        return "";
      });
    p = p.replace(/^[ \t]*OUTFIT:[ \t]*([^\n]*)$\n?/gim, (_m, x: string) => {
      if (!outfit) outfit = x.trim().slice(0, 300);
      return "";
    });
    if (/^none\.?$/i.test(edit)) edit = "";
    return { pose, frame, edit, outfit, text: cleanOut(p) };
  });
}
