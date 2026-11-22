// Generated images are temporary. Everything about how long lives here so the database
// (expires_at), the cleanup job and the notices all agree.
export const GENERATION_RETENTION_HOURS = 72;

export const RETENTION_NOTICE = `Generated images are stored for ${GENERATION_RETENTION_HOURS} hours only. Download and save them before they expire.`;

/** Reference sheets are the character's look, so they are kept until someone deletes them (no 72-hour expiry).
 *  Deleting the character starts the usual 72 hours (trigger in migration 0039). */
export const KEPT_KINDS: readonly string[] = ["reference_sheet"];

/** Kept images get an expiry this far out, so every "expires_at > now" check, signed link and cleanup query still works. */
const KEPT_YEARS = 100;
/** Anything expiring more than this far out is treated as "never expires" when shown. */
const KEPT_THRESHOLD_MS = 50 * 365 * 86_400_000;

export const generationExpiry = (from: Date = new Date(), kind?: string) =>
  KEPT_KINDS.includes(kind ?? "")
    ? new Date(new Date(from).setFullYear(from.getFullYear() + KEPT_YEARS))
    : new Date(from.getTime() + GENERATION_RETENTION_HOURS * 3_600_000);

/** True for an image that is kept (see KEPT_KINDS) rather than counting down. */
export const neverExpires = (expiresAt: Date | string | null | undefined, now: Date = new Date()) =>
  !!expiresAt && new Date(expiresAt).getTime() - now.getTime() > KEPT_THRESHOLD_MS;

/** Short tile caption: "71h left", "under 1h left" or "Never expires". */
export function shortTimeLeft(expiresAt: Date | string, now: Date = new Date()): string {
  if (neverExpires(expiresAt, now)) return "Never expires";
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return ms < 3_600_000 ? "under 1h left" : `${Math.max(1, Math.round(ms / 3_600_000))}h left`;
}

/** "2 days left", "5 hours left", "40 minutes left", "Never expires" or "Expired". */
export function timeLeft(expiresAt: Date | string, now: Date = new Date()): { expired: boolean; label: string } {
  if (neverExpires(expiresAt, now)) return { expired: false, label: "Never expires" };
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return { expired: true, label: "Expired" };
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return { expired: false, label: `${minutes} minute${minutes === 1 ? "" : "s"} left` };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { expired: false, label: `${hours} hour${hours === 1 ? "" : "s"} left` };
  const days = Math.floor(hours / 24);
  return { expired: false, label: `${days} days left` };
}
