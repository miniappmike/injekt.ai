/**
 * Images on the clipboard, for the Paste buttons. Phones have no Ctrl+V, so this reads the clipboard directly (the
 * browser may ask once). Throws a plain message when there's nothing to paste or the browser won't share it.
 */
export async function readClipboardImages(): Promise<File[]> {
  if (!navigator.clipboard?.read) throw new Error("This browser can't paste images here. Long-press the paste box and choose Paste, or tap Upload.");
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error("Paste was blocked. Allow clipboard access for this site, or long-press the paste box and choose Paste.");
  }
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (!type) continue;
    const blob = await item.getType(type);
    files.push(new File([blob], `pasted-${Date.now()}-${files.length}.${type.split("/")[1] || "png"}`, { type }));
  }
  if (!files.length) throw new Error("There's no image on your clipboard. Copy a photo first (long-press it, then Copy image).");
  return files;
}
