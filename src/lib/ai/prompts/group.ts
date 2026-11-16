/**
 * Group photo: two to four of the person's characters together in one new image. Each character's references come in
 * a block of @image tags; the person's own creative direction sets the scene and is followed closely. Pure, so the
 * server and the tests share it.
 */
import { fence, joinTags, REALISM_FIX, TEXT_SHORT } from "./rules";
import type { Anchors } from "./identity";

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
    const a = m.anchors;
    const look = a
      ? [a.hair && `hair: ${short(a.hair, 100)}`, a.face && `face: ${short(a.face, 140)}`, (a.mid || a.upper) && `build: ${short([a.upper, a.mid].filter(Boolean).join("; "), 140)}`].filter(Boolean).join("; ")
      : "";
    return `PERSON ${i + 1}, ${name}: ${joinTags(tags)} (${roles}). Take ${name}'s exact face, hair, skin and body proportions from ${tags.length > 1 ? "these" : "this"} only.${look ? ` ${name}'s look: ${look}.` : ""}`;
  });

  const d = fence(direction).replace(/\s+/g, " ").trim().slice(0, MAX_DIRECTION);
  const scene = d
    ? `CREATIVE DIRECTION (follow it closely and literally; it decides the setting, poses, interaction, who stands where, outfits, mood, lighting, camera angle and framing, and anything it names by a person's name applies to that person): ${d.replace(/\.?$/, ".")}`
    : "CREATIVE DIRECTION: a natural, candid photo of them together, like friends posing for a phone photo on a night out, each in a stylish outfit that suits the setting.";

  const head = `A single new photograph of exactly ${n} women together in one scene: ${joinTags(members.map((m, i) => fence(m.name).trim().slice(0, 40) || `Person ${i + 1}`))}. Each woman's reference images show only her, so build each person only from her own references and never mix features between them. Every person is clearly visible with her face shown, and no extra people appear.`;

  const rules = [
    "Each woman's identity from her own references is the highest priority: an identical face, hair, skin and body at its real scale. Never blend, swap or average faces or bodies between them, and never slim or idealise a figure.",
    "Take only the people from the references, never their grids, plain backgrounds, studio light or plain outfits: each woman wears what the creative direction describes, or an outfit that suits the scene.",
    "Light, colour and perspective are consistent across everyone, at true relative scale.",
    REALISM_FIX.quality,
    TEXT_SHORT,
    "No tattoos or piercings a woman does not have in her references.",
  ];
  return [head, blocks.join("\n"), scene, rules.join(" ")].join("\n\n");
}
