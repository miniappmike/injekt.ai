/**
 * Group photo: two to four of the person's characters together in one new image. Each character's references come in
 * a block of @image tags; the person's own creative direction sets the scene and is followed closely. Pure, so the
 * server and the tests share it.
 */
import { fence, joinTags, MODS_RULE, REALISM_FIX, TEXT_SHORT } from "./rules";
import { pickAnchors, type Anchors } from "./identity";

export const MIN_GROUP = 2;
export const MAX_GROUP = 4;
/** Room the identity blocks and rules need; the direction gets the rest of the provider's prompt limit. */
export const MAX_DIRECTION = 1500;

export interface GroupMember {
  name: string;
  /** What each of her images is ("a close-up of her face from the front"), in @image order. */
  roles: string[];
  anchors: Anchors | null;
}

const short = (s: string | undefined, n: number) => String(s || "").replace(/\s+/g, " ").trim().replace(/\.$/, "").slice(0, n);

/** The prompt. Members' images are sent in order, so member 1 is @image1.., member 2 follows, and so on. */
export function groupPhotoPrompt(members: GroupMember[], direction: string): string {
  const n = members.length;
  let at = 1;
  const blocks = members.map((m, i) => {
    const tags = m.roles.map(() => "@image" + at++);
    const name = fence(m.name).replace(/\s+/g, " ").trim().slice(0, 40) || `Person ${i + 1}`;
    const roles = tags.map((t, k) => `${t} is ${m.roles[k]}`).join(", ");
    const a = m.anchors ? pickAnchors(m.anchors, "") : null;
    const look = a
      ? [a.hair && `hair: ${short(a.hair, 120)}`, a.face && `face: ${short(a.face, 160)}`, a.skin && `skin: ${short(a.skin, 100)}`, (a.mid || a.upper) && `body: ${short([a.upper, a.mid].filter(Boolean).join("; "), 180)}`]
          .filter(Boolean)
          .join("; ")
      : "";
    const avoid = a?.avoid?.length ? ` Not: ${a.avoid.slice(0, 3).map((x) => x.replace(/^not\s+/i, "")).join("; ")}.` : "";
    const outfit = m.anchors?.sheetOutfit ? ` Never dress ${name} in the reference outfit (${short(m.anchors.sheetOutfit, 100)}).` : "";
    return `PERSON ${i + 1}, ${name}: ${joinTags(tags)} (${roles}${tags.length > 1 ? "; all the same woman" : ""}). Copy ${name}'s exact face, bone structure, eyes, brows, nose, lips, skin tone, freckles, moles and marks, hair colour, length and texture, and her exact body shape and proportions from ${joinTags(tags)} only.${look ? ` ${name}'s look: ${look}.` : ""}${avoid}${outfit}`;
  });

  const d = fence(direction).replace(/\s+/g, " ").trim().slice(0, MAX_DIRECTION);
  const scene = d
    ? `CREATIVE DIRECTION (follow it closely and literally; it decides the setting, poses, interaction, who stands where, outfits, mood, lighting, camera angle and framing, and anything it names by a person's name applies to that person): ${d.replace(/\.?$/, ".")}`
    : "CREATIVE DIRECTION: a natural, candid photo of them together, like friends posing for a phone photo on a night out, each in a stylish outfit that suits the setting.";

  const head = `A single new photograph of exactly ${n} women together in one scene: ${joinTags(members.map((m, i) => fence(m.name).trim().slice(0, 40) || `Person ${i + 1}`))}. Each woman's reference images show only her, so build each person only from her own references and never mix features between them. Every person is clearly visible with her face shown, and no extra people appear.`;

  const rules = [
    "IDENTITY LOCK (strict): each woman is the exact same person as in her own references, with an identical face, features, skin, hair, body shape and proportions. Do not average, blend or swap faces, hair or bodies between them, and do not make them look alike. Do not slim, enlarge, lengthen, tone or idealise any figure.",
    "OUTFITS: use the references for face, hair and body shape only and ignore the clothing shown there; each woman wears only what the creative direction describes, or, where it says nothing, an outfit that suits the scene.",
    "Take only the people from the references, never their grid layout, panels, plain backgrounds, studio light or plain outfits. Lighting, colour and perspective are consistent across everyone, so they look photographed together in the same moment, at true relative scale.",
    REALISM_FIX.quality,
    TEXT_SHORT,
    MODS_RULE,
  ];
  return [head, blocks.join("\n"), scene, rules.join(" ")].join("\n\n");
}
