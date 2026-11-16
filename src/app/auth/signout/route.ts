import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { LAST_PAGE_COOKIE } from "@/lib/resume";

export async function POST(request: NextRequest) {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  // The next person to sign in on this phone starts on Home, not on the last page of the account that just left.
  response.cookies.delete(LAST_PAGE_COOKIE);
  return response;
}
