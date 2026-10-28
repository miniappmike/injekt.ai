"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readSheet } from "@/app/(app)/characters/ai-actions";

// Says whether her sheets have been read into face and body references, and lets the person read them now.
export function SheetPackStatus({ characterId, state, read }: { characterId: string; state: string; read: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(state);
  const [error, setError] = useState<string>();
  if (!state) return null;

  async function run() {
    setBusy(true);
    setError(undefined);
    const r = await readSheet(characterId);
    setBusy(false);
    if (r.ok) setText(r.state);
    else if (r.redirectTo) return router.push(r.redirectTo);
    else setError(r.error);
    router.refresh();
  }

  return (
    <div className="grid gap-2 rounded-md border border-neutral-800 p-3 text-sm" aria-live="polite">
      <p className="text-neutral-300">{text}</p>
      {!read && (
        <div>
          <Button type="button" size="sm" variant="outline" onClick={run} disabled={busy}>
            {busy ? "Reading the sheet..." : "Read sheet now"}
          </Button>
        </div>
      )}
      {error && <p className="text-amber-300">{error}</p>}
    </div>
  );
}
