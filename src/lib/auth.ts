import { cache } from "react";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";

// Use in server components and actions. The proxy already redirects, this is the authoritative check.
// Cached for one request: the layout and the page both ask, and Supabase is only asked once.
export const requireUser = cache(async function requireUser() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
});

// Only allow same-site relative paths as post-login destinations.
export function safeNext(next: string | null | undefined, fallback = "/home") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
