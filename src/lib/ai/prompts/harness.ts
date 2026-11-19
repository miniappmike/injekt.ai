import { hasQualityLine, REALISM_FIX, TEXT_RULE, TEXT_SHORT } from "./rules";

export interface HarnessOptions {
  /** Prepended as "Use <tag> as the strict identity reference." when the prompt doesn't mention it. */
  tag?: string;
  /** Sectioned style: delete any sentence about aspect ratio. */
  stripAR?: boolean;
  /** false skips the realism lines (the wrapper adds them at generation time instead). */
  realism?: boolean;
  /** false skips the text rule. */
  text?: boolean;
}

export interface HarnessResult {
  text: string;
  /** What was changed, for the "Auto-fixed: ..." pill. Empty means all checks passed. */
  fixed: string[];
}

/** Before a match in the same sentence: "no glossy skin" is already the right instruction and must stay as written. */
const negated = (whole: string, at: number) => /\b(?:no|not|never|without|avoid|nor)\b[^.!?\n]*$/i.test(whole.slice(Math.max(0, at - 80), at).split(/[.!?\n]/).pop() ?? "");
const unlessNegated = (rep: string) => (m: string, ...args: unknown[]) => {
  const whole = args[args.length - 1] as string;
  const at = args[args.length - 2] as number;
  return negated(whole, at) ? m : rep;
};

const SUBS: [RegExp, string | ((m: string, ...args: unknown[]) => string), string][] = [
  [/\bgirl[- ]next[- ]door\b/gi, "approachable, natural", "age wording"],
  [/\b(?:(?:1[0-9]|20)[- ]years?[- ]old|teen(?:age)?)\s+(?=(?:girl|boy|woman|man|female|male|model)s?\b)/gi, "", "age wording"],
  [/\b(?:1[0-9]|20)[- ]years?[- ]old\b/gi, "young adult", "age wording"],
  [/\bteen(?:age|ager)?s?\b/gi, "young adult", "age wording"],
  [/\bgirls\b/gi, "young women", "age wording"],
  [/\bgirl\b/gi, "young woman", "age wording"],
  [/\bboys\b/gi, "young men", "age wording"],
  [/\bboy\b/gi, "young man", "age wording"],
  [/\bphoto-?realis(?:tic|m)\b,?\s*/gi, "", "filler words"],
  [/\b(?:8k|4k|16k|ultra[- ]?hd|uhd|hyper[- ]?(?:detailed|realistic)|highly detailed|masterpiece|best quality)\b,?\s*/gi, "", "filler words"],
  [
    /\b(?:flawless|airbrushed|porcelain|poreless|glass|dewy|luminous|radiant|glowing|silky[- ]smooth|smooth|glossy|shiny|polished|perfect)\s+(?=(?:skin|complexion|face|finish|look)\b)/gi,
    unlessNegated("natural textured "),
    "plastic-skin wording",
  ],
  // Matte reads as plastic to the image model; real skin has natural texture.
  [/\bskin (?:is|looks) matte(?: and textured)?\b/gi, (m: string) => (m[0] === "S" ? "S" : "s") + "kin has natural texture", "plastic-skin wording"],
  [/\bmatte(?:,? and textured)?\s+(?=(?:skin|complexion)\b)/gi, unlessNegated("naturally textured "), "plastic-skin wording"],
  [
    /\b(?:a\s+)?(?:natural\s+|soft\s+|subtle\s+|healthy\s+)?(?:sheen|glow)\s+(?:where|on)\s+(?:the\s+)?light\s+(?:hits|catches)[^.,;]*/gi,
    "faint natural oil on the nose",
    "plastic-skin wording",
  ],
  [/\b(?:ultra[- ]sharp|tack[- ]sharp|razor[- ]sharp|crystal[- ]clear|flawlessly lit|studio[- ]perfect)\b/gi, "natural", "plastic-skin wording"],
];

/**
 * Every LLM-written prompt passes through this before anyone sees it (artifact A7, ported as is). It strips chat and
 * markdown, fixes age, filler and plastic-skin wording, and appends the realism and text lines when they're missing.
 */
export function harness(raw: string, opt: HarnessOptions = {}): HarnessResult {
  let t = String(raw).trim();
  const fixed: string[] = [];
  const before = t;
  t = t.replace(/^(?:sure|okay|ok|certainly|absolutely|here(?:'|’)?s|here is)[^\n]*\n+/i, "").replace(/^(?:final |replacement )?prompt\s*:\s*/i, "");
  if (t !== before) fixed.push("removed preface");
  if (/\*\*|__|`|^#{1,6}\s/m.test(t)) {
    t = t.replace(/\*\*|__|`/g, "").replace(/^#{1,6}\s*/gm, "");
    fixed.push("removed markdown");
  }
  // The IMAGE QUALITY line itself says "no ... porcelain skin"; the plastic-skin rule would turn that into "no ...
  // natural textured skin" when a prompt is checked a second time, so the line is set aside while the rules run.
  const KEEP = "\u0000quality\u0000";
  const kept = t.includes(REALISM_FIX.quality);
  if (kept) t = t.split(REALISM_FIX.quality).join(KEEP);
  for (const [re, rep, label] of SUBS) {
    re.lastIndex = 0;
    const next = t.replace(re, rep as string);
    if (next !== t) {
      t = next;
      if (!fixed.includes(label)) fixed.push(label);
    }
  }
  if (kept) t = t.split(KEEP).join(REALISM_FIX.quality);
  const marks = dropBlanketMarks(t);
  if (marks !== t) {
    t = marks;
    fixed.push("kept her own tattoos and piercings");
  }
  if (opt.stripAR && /aspect ratio/i.test(t)) {
    t = t.replace(/[^.\n]*aspect ratio[^.\n]*\.?/gi, "").replace(/\n{3,}/g, "\n\n");
    fixed.push("removed aspect ratio");
  }
  const add: string[] = [];
  if (opt.realism !== false) {
    // Read before the realism sentences go in: only the writer's own camera-and-look passage stands in for the line.
    const hasQuality = hasQualityLine(t);
    if (!/\bpores?\b/i.test(t)) add.push(REALISM_FIX.skin);
    if (!/(texture|weave|woven|knit|grain|crease|wrinkl|fray|sheen|patent|vinyl|leather|denim|satin|lace|fleece)/i.test(t)) add.push(REALISM_FIX.texture);
    if (!/(camera|lens|iphone|smartphone|phone photo|film|sensor|\d+\s?mm\b)/i.test(t)) add.push(REALISM_FIX.camera);
    if (add.length) {
      t = t.replace(/\s+$/, "") + "\n\n" + add.join(" ");
      fixed.push("added realism line");
    }
    if (!hasQuality) {
      t = t.replace(/\s+$/, "") + "\n\n" + REALISM_FIX.quality;
      fixed.push("added image quality line");
    }
  }
  if (opt.text !== false && !/gibberish|garbled/i.test(t)) {
    t = t.replace(/\s+$/, "") + (opt.realism === false ? " " : "\n\n") + (opt.realism === false ? TEXT_SHORT : TEXT_RULE);
    fixed.push("added text rule");
  }
  if (opt.tag && !t.includes(opt.tag)) {
    t = `Use ${opt.tag} as the strict identity reference. ` + t;
    fixed.push("added " + opt.tag);
  }
  t = t.replace(/[ \t]+([,.;])/g, "$1").replace(/,\s*,/g, ",").replace(/ {2,}/g, " ").trim();
  return { text: t, fixed };
}

/**
 * Her tattoos and piercings come from her profile and sheets, so a blanket "no tattoos" or "no piercings" in a written
 * exclusion list would fight them. Only list items are dropped (after a colon, comma or semicolon, or starting a line);
 * a specific negative such as "no navel piercing", or a sentence such as "add no tattoos she lacks", stays.
 */
export function dropBlanketMarks(t: string): string {
  const item = /(?:(?<=:)[ \t]*|[ \t]*[,;][ \t]*|^[ \t]*)(?:and[ \t]+)?no[ \t]+(?:visible[ \t]+|added[ \t]+|other[ \t]+)?(?:tattoos?|piercings?)(?:[ \t]*(?:,|or|and)[ \t]*(?:no[ \t]+)?(?:tattoos?|piercings?))?(?=[ \t]*(?:[,.;\n]|$))/gim;
  if (!item.test(t)) return t;
  item.lastIndex = 0;
  return t
    .replace(item, "")
    .replace(/:[ \t]*[,;][ \t]*/g, ": ")
    .replace(/^[ \t]*[,;][ \t]*/gm, "")
    .replace(/^[A-Z][A-Za-z ]{0,30}:[ \t]*\.?[ \t]*$\n?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
