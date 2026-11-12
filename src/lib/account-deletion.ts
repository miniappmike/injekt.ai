import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The buckets where a person's files live, each under "<user id>/...". */
export const USER_BUCKETS = ["character-media", "generations", "references"] as const;

/** Every file path under a folder, however deep. */
async function listAll(db: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      // Folders have no id; files do.
      if (item.id) out.push(path);
      else out.push(...(await listAll(db, bucket, path)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

/** Deletes all of a person's files. Returns how many were removed. */
export async function deleteUserFiles(db: SupabaseClient, userId: string): Promise<number> {
  let removed = 0;
  for (const bucket of USER_BUCKETS) {
    const paths = await listAll(db, bucket, userId);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) throw new Error(`Couldn't delete your files (${bucket}). Try again.`);
      removed += Math.min(100, paths.length - i);
    }
  }
  return removed;
}

/**
 * Deletes the account: their files first, then the login, which removes everything else they made (characters,
 * history, settings, keys, tokens). Orders, marketplace sales and bonus claims are kept without the person (0024).
 */
export async function deleteAccount(db: SupabaseClient, userId: string): Promise<void> {
  await deleteUserFiles(db, userId);
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error("Couldn't delete your account. Try again, or email us.");
}
