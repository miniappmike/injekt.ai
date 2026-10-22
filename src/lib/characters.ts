import { z } from "zod";

export const PROFILE_FIELDS = [
  { key: "identity_line", label: "Identity line", rows: 2 },
  { key: "face", label: "Face", rows: 3 },
  { key: "hair", label: "Hair", rows: 2 },
  { key: "skin", label: "Skin, freckles, marks", rows: 2 },
  { key: "body", label: "Body and build", rows: 2 },
  { key: "distinctive_traits", label: "Distinctive traits", rows: 2 },
  { key: "signature_accessories", label: "Signature accessories", rows: 2 },
] as const;

export type ProfileKey = (typeof PROFILE_FIELDS)[number]["key"];
export type CharacterProfile = Partial<Record<ProfileKey, string>>;

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === "" ? null : v))
  .nullable();

export const characterInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  always_keep: optionalText,
  height: optionalText,
  weight: optionalText,
  lore: optionalText,
  provenance: z.literal("on", { error: "Confirm you own or license the references, or that the character is invented" }),
});

export function parseProfile(formData: FormData): CharacterProfile {
  const profile: CharacterProfile = {};
  for (const { key } of PROFILE_FIELDS) {
    const v = formData.get(`profile_${key}`);
    if (typeof v === "string" && v.trim()) profile[key] = v.trim().slice(0, 2000);
  }
  return profile;
}

export function profilesEqual(a: CharacterProfile, b: CharacterProfile) {
  return PROFILE_FIELDS.every(({ key }) => (a[key] ?? "") === (b[key] ?? ""));
}
