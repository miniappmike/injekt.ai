/**
 * Director: the person describes the shot in their own words and the prompt is written for them on the server. It is
 * never shown; Generate frames it with her face sheet (@image1) and body sheet (@image2) and the BODY LOCK, the same as
 * an Inject prompt made here.
 */
import { fence, PROPORTIONS_WORDS } from "./rules";
import { profileBlock } from "../tasks/profile-builder";
import { PROMPT_CHARS, type InjectCharacter } from "./inject";

/** How long the person's direction may be. */
export const MAX_DIRECTION = 1500;

/** The writer's task: one finished scene for her, following the direction, in the Inject output format. */
export function buildDirectorPrompt(c: InjectCharacter, sheet: string, direction: string): string {
  return `TASK: Write one prompt for an AI image model that makes a real photo of the CHARACTER below, following the user's DIRECTION. The image model also receives her face reference sheet and her full-body reference sheet, so she is the same woman; your prompt sets the scene.

CHARACTER PROFILE (locked; use these exact traits and never contradict them)
${profileBlock(c)}${sheet}

DIRECTION FROM THE USER (the creative focus: carry out every part of it closely; where it leaves something open, such as the place, outfit, pose, light or camera, choose what best fits it so the photo is complete and believable)
<<<${fence(direction)}>>>

RULES
- Open with an identity paragraph from the profile, limited to what is in frame: face, eyes, marks, hair, then her body and build with its concrete proportion anchors for the parts in frame (frame, shoulder width, bust, waist, hips, glutes, thighs and leg length, muscle tone, height impression), and say the body must match the reference exactly with no slimming, enlarging or idealising. Her body is the top priority.
- Body shape: describe the build exactly as the reference sheet lines state (or the profile when there are none), in neutral, fashion-catalogue wording. Never soften a curvy build into slim or athletic, and never make a slim build curvy. ${PROPORTIONS_WORDS}
- If the profile gives a height or weight, turn them into visual build terms. Mention the height once in plain terms only when most of the body is in frame. Never write the weight as a number.
- Always describe her as an adult woman, never as a girl or teen, and never state an age under 21.
- Her tattoos, piercings, scars and moles come only from the profile or sheet lines; never add others. A tattoo is mentioned only where its spot is bare skin in this outfit and pose, never as a print on clothing.
- Her reference sheets show her in a plain placeholder outfit. Never describe or reuse it: dress her as the direction asks, or in an outfit that suits the scene. Name every garment with its type, colour, fabric and fit, and shoes if the feet are in frame.
- REVEALING CLOTHING IS FINE: bikinis, lingerie, bodysuits, mini skirts and similar are described plainly by garment type, colour, fabric and fit. Suggestive is fine; never explicit or sexual language.
- Describe the pose limb by limb with left and right, the expression and gaze, and the camera position and framing.
- Light: name the source and direction; never just "natural lighting".
- REALISM, required: a real, unretouched phone photo a creator would post. One skin sentence (matte skin with visible pores, fine peach fuzz, uneven tone, small imperfections, a few flyaway hairs), the real texture of fabrics and surfaces, and a camera sentence (smartphone main camera, focus falloff away from the face, sensor noise in the shadows, mild compression, slightly imperfect white balance), saying it is not retouched or CGI. Never use flawless, glossy, glowing, radiant, dewy, porcelain, airbrushed, perfect, photorealistic, 8k or similar words.
- Any visible text is short, quoted and legible. End with one line of exclusions: no text overlays or captions, no watermark, no added logos, no garbled or made-up lettering.
- FORMAT: the identity paragraph, then labelled sections in this order: SCENE, WARDROBE, BACKGROUND, LIGHT, CAMERA AND LOOK, then the exclusions line. Short flowing prose, no bullet points, no aspect ratio. Say each detail once.
- LENGTH: under ${PROMPT_CHARS} characters. If something must be shorter, shorten the background and light first, never her body.

OUTPUT CONTRACT
- Start with a line containing exactly ===VERSION 1===
- Then one line that starts with IN FRAME: followed by the parts of her that will be visible, chosen from: face, back of head, hair, shoulders, bust, arms, waist, hips, glutes, thighs, legs, feet.
- Then one line that starts with OUTFIT: followed by the outfit in at most 30 words, garment by garment with colours.
- Then the finished prompt. Nothing else.`;
}
