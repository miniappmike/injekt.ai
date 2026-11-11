import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { makePreview } from "@/lib/marketplace/watermark";

const picture = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 90, g: 120, b: 160 } } }).png().toBuffer();

describe("makePreview", () => {
  it("shrinks a big picture to 768px on the long edge and outputs a JPEG", async () => {
    const out = await makePreview(await picture(2000, 3000));
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBe(768);
    expect({ width: out.width, height: out.height }).toEqual({ width: meta.width, height: meta.height });
  });

  it("never enlarges a small picture", async () => {
    const out = await makePreview(await picture(300, 200));
    expect([out.width, out.height]).toEqual([300, 200]);
  });

  it("applies the watermark: the result differs from a plain resize", async () => {
    const src = await picture(2000, 3000);
    const plain = await sharp(src).resize({ width: 768, height: 768, fit: "inside" }).jpeg({ quality: 72 }).toBuffer();
    const out = await makePreview(src);
    expect(out.data.equals(plain)).toBe(false);
    // The flat blue picture would compress to almost nothing; the text makes the file noticeably bigger.
    expect(out.data.length).toBeGreaterThan(plain.length * 1.5);
  });

  it("rejects things that are not JPEG, PNG or WebP", async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).gif().toBuffer();
    await expect(makePreview(gif)).rejects.toThrow(/Unsupported/);
  });
});
