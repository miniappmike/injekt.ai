"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveKey, type KeyFormState } from "@/app/(app)/settings/api-keys/actions";
import type { ProviderInfo } from "@/lib/ai/providers/catalog";

export function KeyForm({ provider, currentModel, hasKey }: { provider: ProviderInfo; currentModel?: string; hasKey: boolean }) {
  const [state, action, pending] = useActionState<KeyFormState, FormData>(saveKey, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="provider" value={provider.id} />
      <div className="flex gap-2">
        <Input
          name="key"
          type="password"
          autoComplete="off"
          placeholder={hasKey ? "Paste a new key to replace it" : "Paste your API key"}
          required
        />
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : hasKey ? "Replace" : "Save"}</Button>
      </div>
      {provider.kind === "llm" && (
        <Input
          name="model"
          defaultValue={currentModel ?? provider.defaultModel ?? ""}
          placeholder={provider.modelRequired ? "Model name (required)" : "Model name"}
          required={provider.modelRequired}
          aria-label="Model name"
        />
      )}
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      {state.saved === provider.id && <p role="status" className="text-sm text-emerald-400">Saved.</p>}
    </form>
  );
}
