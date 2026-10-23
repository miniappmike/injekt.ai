import { RETENTION_NOTICE } from "@/lib/retention";

export function RetentionNotice() {
  return (
    <div role="note" className="flex gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-400 text-xs font-bold text-neutral-900">i</span>
      <div>
        <p className="font-medium">Reminder</p>
        <p className="text-sm text-neutral-300">{RETENTION_NOTICE}</p>
      </div>
    </div>
  );
}
