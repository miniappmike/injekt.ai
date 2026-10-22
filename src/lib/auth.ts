import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";

// Use in server components and actions. The proxy already redirects, this is the authoritative check.
export async function requireUser() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// Only allow same-site relative paths as post-login destinations.
export function safeNext(next: string | null | undefined, fallback = "/characters") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
