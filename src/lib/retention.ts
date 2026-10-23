// Generated images are temporary. Everything about how long lives here so the database
// (expires_at), the cleanup job and the notices all agree.
export const GENERATION_RETENTION_HOURS = 72;

export const RETENTION_NOTICE = `Generated images are stored for ${GENERATION_RETENTION_HOURS} hours only. Download and save them before they expire.`;

export const generationExpiry = (from: Date = new Date()) => new Date(from.getTime() + GENERATION_RETENTION_HOURS * 3_600_000);

/** "2 days left", "5 hours left", "40 minutes left" or "Expired". */
export function timeLeft(expiresAt: Date | string, now: Date = new Date()): { expired: boolean; label: string } {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return { expired: true, label: "Expired" };
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return { expired: false, label: `${minutes} minute${minutes === 1 ? "" : "s"} left` };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { expired: false, label: `${hours} hour${hours === 1 ? "" : "s"} left` };
  const days = Math.floor(hours / 24);
  return { expired: false, label: `${days} days left` };
}
