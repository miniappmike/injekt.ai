import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE, INVITE_COOKIE_DAYS, parseInviteCode } from "@/lib/invites";
import { LAST_PAGE_COOKIE, PWA_SOURCE, resumablePath } from "@/lib/resume";

const PUBLIC_PREFIXES = ["/login", "/signup", "/auth", "/api/webhooks", "/api/cron", "/marketplace", "/terms", "/privacy", "/guides", "/manifest.webmanifest", "/how-it-works", "/about", "/get-a-key"];

// Refreshes the Supabase session cookie and sends signed-out users to /login (the landing pages and a few others are open to everyone).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // "/" is the landing page; signed in, it goes straight to the app.
  const isPublic = pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Opened from the home-screen icon (the manifest's start address): signed out, the app opens on log in, not the
  // landing page; signed in, it goes back to the page it was last on, if that was recent (see src/lib/resume.ts).
  const appLaunch = pathname === "/" && request.nextUrl.searchParams.get("source") === PWA_SOURCE;
  if (!user && appLaunch) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    const last = appLaunch ? resumablePath(request.cookies.get(LAST_PAGE_COOKIE)?.value) : null;
    if (last) return NextResponse.redirect(new URL(last, request.nextUrl.origin));
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // A signed-out visitor who arrives on an invite link keeps the code for 30 days, so sign-up can credit the friend.
  const invite = parseInviteCode(request.nextUrl.searchParams.get("ref"));
  if (!user && invite) {
    response.cookies.set(INVITE_COOKIE, invite, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: INVITE_COOKIE_DAYS * 24 * 60 * 60,
    });
  }

  return response;
}

export const config = {
  // Static image files (like the guide's screenshots in /public) skip the session check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
