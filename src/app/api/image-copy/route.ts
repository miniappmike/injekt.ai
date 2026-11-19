import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import { RateLimitError } from "@/lib/errors";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 30;

/** The largest picture this will pass on. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * "Copy image" in the image viewer, when the browser can't fetch the picture itself (its host doesn't allow other sites
 * to read it, e.g. the image provider's own link while our copy is still being saved). The site fetches it instead and
 * hands it back from its own address, so it can go on the clipboard.
 *
 * Only for a signed-in person, and only for:
 *  - a link to this project's storage (a signed link already proves they may see the file), or
 *  - the provider's link of one of their own generations.
 * Anything else is refused, so this can never be used to make the server fetch other addresses.
 */
export async function GET(request: NextRequest) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await enforceRateLimit(user.id, "image-copy", 30, 60);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: "Too many copies. Try again in a moment." }, { status: 429 });
    throw e;
  }

  const raw = request.nextUrl.searchParams.get("u") ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Bad link." }, { status: 400 });
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "127.0.0.1")) {
    return NextResponse.json({ error: "Bad link." }, { status: 400 });
  }
  const storageHost = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host;
  const ours = url.host === storageHost && url.pathname.startsWith("/storage/v1/object/");
  if (!ours) {
    // The provider's link of one of this person's own generations (RLS limits the lookup to their rows).
    const { data } = await supabase.from("generations").select("id").eq("user_id", user.id).eq("params->>output_url", raw).limit(1);
    if (!data?.length) return NextResponse.json({ error: "That picture can't be copied here." }, { status: 403 });
  }

  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "Couldn't load the picture. It may have expired." }, { status: 502 });
  const type = res.headers.get("content-type") ?? "";
  if (!/^image\/(png|jpeg|webp|gif)/.test(type)) return NextResponse.json({ error: "That isn't a picture." }, { status: 415 });
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "That picture is too large to copy." }, { status: 413 });
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: "That picture is too large to copy." }, { status: 413 });
  return new NextResponse(bytes, { headers: { "content-type": type.split(";")[0], "cache-control": "private, no-store" } });
}
