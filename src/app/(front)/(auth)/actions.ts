"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";
import { env } from "@/env";
import { PRIVACY_UPDATED, TERMS_UPDATED } from "@/lib/legal";

export type AuthState = { error?: string; message?: string };

const credentials = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Invalid email or password" };

  redirect(safeNext(formData.get("next") as string | null));
}

export async function signup(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Both boxes are required (the form requires them too; this is the check that counts).
  if (formData.get("adult") !== "on") return { error: "You must be 18 or older to use ModelSpawn." };
  if (formData.get("terms") !== "on") return { error: "Please agree to the Terms of Service and Privacy Policy." };

  const supabase = await createUserClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      // A record of what they confirmed and which versions they agreed to.
      data: { adult_confirmed_at: now, terms_accepted_at: now, terms_version: TERMS_UPDATED, privacy_version: PRIVACY_UPDATED },
    },
  });
  if (error) return { error: error.message };
  // Admins with Telegram alerts on get a "new sign-up" message (after the answer goes out; never blocks sign-up).
  try {
    after(async () => (await import("@/lib/payments/alerts")).alertSignup(parsed.data.email).catch(() => {}));
  } catch {
    // Outside a request (tests): skip it.
  }

  // With email confirmation on, there is no session yet.
  if (!data.session) return { message: "Check your email to confirm your account, then log in." };
  redirect("/home");
}
