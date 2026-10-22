import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

// Service-role client bypasses RLS. Only for webhooks, key decryption and background jobs.
export const adminClient = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
