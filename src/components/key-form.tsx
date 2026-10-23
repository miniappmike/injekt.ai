"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { detectProvider } from "@/lib/ai/providers/detect";
import {
  removeRoleKey,
  saveRoleKey,
  shareRoleKey,
  testRoleKey,
  updateRoleModel,
  type KeyFormState,
} from "@/app/(app)/settings/api-keys/actions";

export interface SavedRole {
  providerLabel: string;
  model: string;
  baseUrl?: string;
  /** Own key: its last 4 characters. */
  last4?: string;
  /** Shared key: the label of the job whose key is reused. */
  sharedFrom?: string;
  /** Labels of jobs that reuse this job's key. */
  usedBy?: string[];
}

export interface ShareSource {
  id: string;
  label: string;
  providerLabel: string;
  model: string;
}

export function RoleKeyForm({ role, saved, shareSource }: { role: string; saved?: SavedRole; shareSource?: ShareSource }) {
  const [state, action, pending] = useActionState<KeyFormState, FormData>(saveRoleKey, {});
  const [modelState, modelAction, modelPending] = useActionState<KeyFormState, FormData>(updateRoleModel, {});
  const [shareState, shareAction, sharePending] = useActionState<KeyFormState, FormData>(shareRoleKey, {});
  const [testState, testAction, testPending] = useActionState<KeyFormState, FormData>(testRoleKey, {});
  const [replacing, setReplacing] = useState(false);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [forceCustom, setForceCustom] = useState(false);

  const trimmed = key.trim();
  const detected = forceCustom ? null : detectProvider(trimmed);
  const unknown = !detected && trimmed.length >= 8;

  if (saved && !replacing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <span className="font-medium">{saved.providerLabel}</span>
          {saved.sharedFrom ? (
            <span className="text-neutral-400"> · using the {saved.sharedFrom} key</span>
          ) : (
            <span className="text-neutral-400"> · key ending {saved.last4}</span>
          )}
          {saved.baseUrl && <span className="block text-xs text-neutral-500">{saved.baseUrl}</span>}
          {saved.usedBy?.length ? <span className="block text-xs text-neutral-500">Also used by {saved.usedBy.join(", ")}</span> : null}
        </p>
        <form action={modelAction} className="flex gap-2">
          <input type="hidden" name="role" value={role} />
          <Input name="model" defaultValue={saved.model} aria-label="Model name" required />
          <Button type="submit" variant="secondary" disabled={modelPending}>{modelPending ? "Saving..." : "Change model"}</Button>
        </form>
        {modelState.error && <p role="alert" className="text-sm text-red-400">{modelState.error}</p>}
        {modelState.saved === role && <p role="status" className="text-sm text-emerald-400">Model updated.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <form action={testAction}>
            <input type="hidden" name="role" value={role} />
            <Button type="submit" size="sm" variant="secondary" disabled={testPending}>{testPending ? "Testing..." : "Test key"}</Button>
          </form>
          <Button type="button" size="sm" variant="ghost" onClick={() => setReplacing(true)}>
            {saved.sharedFrom ? "Use a different key" : "Replace key"}
          </Button>
          <form action={removeRoleKey}>
            <input type="hidden" name="role" value={role} />
            <Button type="submit" size="sm" variant="ghost">Remove</Button>
          </form>
        </div>
        {testState.tested === role && <p role="status" className="text-sm text-emerald-400">Works. The provider answered with this model.</p>}
        {testState.error && <p role="alert" className="text-sm text-red-400">{testState.error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {shareSource && (
        <form action={shareAction} className="flex flex-col gap-2 rounded-md border border-neutral-800 p-3">
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="from" value={shareSource.id} />
          <p className="text-sm font-medium">Use the same key as {shareSource.label} ({shareSource.providerLabel})</p>
          <p className="text-xs text-neutral-500">One key, a different model for this job if you want one.</p>
          <div className="flex gap-2">
            <Input name="model" defaultValue={shareSource.model} aria-label="Model name" required />
            <Button type="submit" variant="secondary" disabled={sharePending}>{sharePending ? "Saving..." : "Use it"}</Button>
          </div>
          {shareState.error && <p role="alert" className="text-sm text-red-400">{shareState.error}</p>}
        </form>
      )}

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="role" value={role} />
        {forceCustom && <input type="hidden" name="custom" value="1" />}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`key-${role}`}>{shareSource ? "Or paste a different key" : "Paste your API key"}</Label>
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
            <p className="text-sm text-emerald-400">
              Detected: {detected.label}{" "}
              <button
                type="button"
                className="text-neutral-400 underline"
                onClick={() => {
                  setForceCustom(true);
                  setModel("");
                }}
              >
                Not {detected.label}? Use another provider
              </button>
            </p>
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
              {forceCustom ? "Enter the provider's details." : "We don't recognise this key, so enter the provider's details."} Any provider that
              accepts OpenAI-style requests works.{" "}
              {forceCustom && (
                <button
                  type="button"
                  className="text-neutral-400 underline"
                  onClick={() => {
                    setForceCustom(false);
                    setModel("");
                  }}
                >
                  Back to auto-detect
                </button>
              )}
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
    </div>
  );
}
