"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { detectProvider } from "@/lib/ai/providers/detect";
import { removeRoleKey, saveRoleKey, updateRoleModel, type KeyFormState } from "@/app/(app)/settings/api-keys/actions";

export interface SavedRole {
  providerLabel: string;
  last4: string;
  model: string;
  baseUrl?: string;
}

export function RoleKeyForm({ role, saved }: { role: string; saved?: SavedRole }) {
  const [state, action, pending] = useActionState<KeyFormState, FormData>(saveRoleKey, {});
  const [modelState, modelAction, modelPending] = useActionState<KeyFormState, FormData>(updateRoleModel, {});
  const [replacing, setReplacing] = useState(false);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");

  const trimmed = key.trim();
  const detected = detectProvider(trimmed);
  const unknown = !detected && trimmed.length >= 8;

  if (saved && !replacing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <span className="font-medium">{saved.providerLabel}</span>
          <span className="text-neutral-400"> · key ending {saved.last4}</span>
          {saved.baseUrl && <span className="block text-xs text-neutral-500">{saved.baseUrl}</span>}
        </p>
        <form action={modelAction} className="flex gap-2">
          <input type="hidden" name="role" value={role} />
          <Input name="model" defaultValue={saved.model} aria-label="Model name" required />
          <Button type="submit" variant="secondary" disabled={modelPending}>{modelPending ? "Saving..." : "Change model"}</Button>
        </form>
        {modelState.error && <p role="alert" className="text-sm text-red-400">{modelState.error}</p>}
        {modelState.saved === role && <p role="status" className="text-sm text-emerald-400">Model updated.</p>}
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setReplacing(true)}>Replace key</Button>
          <form action={removeRoleKey}>
            <input type="hidden" name="role" value={role} />
            <Button type="submit" size="sm" variant="ghost">Remove</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="role" value={role} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`key-${role}`}>Paste your API key</Label>
        <Input
          id={`key-${role}`}
          name="key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
        />
      </div>
      {detected && (
        <>
          <p className="text-sm text-emerald-400">Detected: {detected.label}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`model-${role}`}>Model</Label>
            <Input
              id={`model-${role}`}
              name="model"
              value={model || detected.defaultModel}
              onChange={(e) => setModel(e.target.value)}
              placeholder={detected.id === "openrouter" ? "e.g. anthropic/claude-sonnet-4.5" : undefined}
              required
            />
          </div>
        </>
      )}
      {unknown && (
        <>
          <p className="text-sm text-neutral-300">
            We don&apos;t recognise this key, so enter the provider&apos;s details. Any provider that accepts OpenAI-style requests works.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`base-${role}`}>Base URL</Label>
            <Input id={`base-${role}`} name="baseUrl" placeholder="https://api.example.com/v1" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`model-${role}`}>Model</Label>
            <Input id={`model-${role}`} name="model" value={model} onChange={(e) => setModel(e.target.value)} required />
          </div>
        </>
      )}
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !trimmed}>{pending ? "Saving..." : "Save key"}</Button>
        {saved && <Button type="button" variant="ghost" onClick={() => setReplacing(false)}>Cancel</Button>}
      </div>
    </form>
  );
}
