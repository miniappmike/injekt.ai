/**
 * The fixed prompt for "Direct swap": the character's reference images come first (@image1 onwards), the target
 * photo last. No AI call is needed to write it.
 */
export function directSwapPrompt(referenceCount: number): string {
  if (referenceCount < 1) throw new Error("A direct swap needs at least one reference image");
  const target = `@image${referenceCount + 1}`;
  const refs = referenceCount === 1 ? "@image1" : `@image1 to @image${referenceCount}`;
  return (
    `Replace the person in ${target} with the person shown in ${refs}. ` +
    `Use ${refs} as the strict identity reference: keep the face, hair, skin, build and distinctive features exactly as in the references. ` +
    `Keep ${target}'s pose, expression, outfit, setting, lighting and framing unchanged.`
  );
}
