/**
 * Saves an image to the device without leaving the page. A plain link to the file opens it as a full page in some
 * browsers (and in the Create Model wizard that loses the person's progress), so the file is fetched and saved from
 * here. If the fetch is refused, the link opens in a new tab instead, never in this one.
 */
export async function saveImage(url: string, name = "modelspawn-image"): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href, download: `${name}.${ext}` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
