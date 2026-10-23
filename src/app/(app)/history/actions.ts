"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { removeUnusedImages } from "@/lib/history";

export async function deleteHistoryEntry(id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("prompt_history").select("image_path").eq("id", id).maybeSingle();
  await supabase.from("prompt_history").delete().eq("id", id);
  await removeUnusedImages(supabase, [data?.image_path ?? null]);
  revalidatePath("/history");
}

export async function deleteAllHistory() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("prompt_history").select("image_path");
  await supabase.from("prompt_history").delete().not("id", "is", null);
  await removeUnusedImages(supabase, (data ?? []).map((r) => r.image_path));
  revalidatePath("/history");
}
