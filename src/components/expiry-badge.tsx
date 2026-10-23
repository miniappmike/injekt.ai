import { InfoTip } from "@/components/info-tip";
import { GENERATION_RETENTION_HOURS, timeLeft } from "@/lib/retention";

export function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const left = expiresAt ? timeLeft(expiresAt) : { expired: true, label: "Expired" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${left.expired ? "text-neutral-500" : "text-orange-300"}`}>
      {left.label}
      <InfoTip label="About expiry">
        Generated images are deleted {GENERATION_RETENTION_HOURS} hours after they are created to keep storage lean. Download any you want to keep.
      </InfoTip>
    </span>
  );
}
