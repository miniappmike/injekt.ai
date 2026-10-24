"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifySpend } from "@/lib/spend-events";
import { defaultModelFor, detectProvider } from "@/lib/ai/providers/detect";
import {
  removeRoleKey,
  saveRoleKey,
  updateRolePrice,
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
  /** Text jobs: the price used to turn tokens into dollars, and where it came from (null: none known). */
  price?: { input: number; output: number } | null;
  priceSource?: "you" | "list" | null;
}

export interface ShareSource {
  id: string;
  label: string;
  providerLabel: string;
  /** The source's model, prefilled for text jobs. */
  model: string;
  /** The model to prefill for the Image job when it borrows this key. */
  imageModel: string;
}

export function RoleKeyForm({ role, saved, shareSources = [] }: { role: "vision" | "llm" | "image"; saved?: SavedRole; shareSources?: ShareSource[] }) {
  const [state, action, pending] = useActionState<KeyFormState, FormData>(saveRoleKey, {});
  const [modelState, modelAction, modelPending] = useActionState<KeyFormState, FormData>(updateRoleModel, {});
  const [shareState, shareAction, sharePending] = useActionState<KeyFormState, FormData>(shareRoleKey, {});
  const [testState, testAction, testPending] = useActionState<KeyFormState, FormData>(testRoleKey, {});
  const [priceState, priceAction, pricePending] = useActionState<KeyFormState, FormData>(updateRolePrice, {});
  const [replacing, setReplacing] = useState(false);

  // A test call can cost a little, so let the spend meter know.
  useEffect(() => {
    if (testState.tested || testState.error) notifySpend();
  }, [testState]);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [forceCustom, setForceCustom] = useState(false);

  const trimmed = key.trim();
  const isImage = role === "image";
  const detected = forceCustom && !isImage ? null : detectProvider(trimmed);
  // Image generation only works with providers that have an adapter, so there is no "other provider" path for it.
  const imageUnsupported = isImage && trimmed.length >= 8 && detected?.id !== "spicyapi";
  const unknown = !isImage && !detected && trimmed.length >= 8;

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
        {testState.tested === role && (
          <p role="status" className="text-sm text-emerald-400">
            {testState.detail ? `Works. ${testState.detail}` : "Works. The provider answered with this model."}
          </p>
        )}
        {testState.error && <p role="alert" className="text-sm text-red-400">{testState.error}</p>}
        {role !== "image" && (
          <details className="rounded-md border border-neutral-800 p-3 text-sm" open={!saved.price}>
            <summary className="cursor-pointer text-neutral-300">Spend tracking</summary>
            <p className="mt-2 text-xs text-neutral-500">
              {saved.priceSource === "list"
                ? `Using the provider's list price: $${saved.price?.input} in / $${saved.price?.output} out per million tokens.`
                : saved.priceSource === "you"
                  ? `Using your price: $${saved.price?.input} in / $${saved.price?.output} out per million tokens.`
                  : "We don't know what this model costs, so spend can't be shown in dollars yet. Enter its price per million tokens (it's on your provider's pricing page)."}
            </p>
            <form action={priceAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="role" value={role} />
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                Input $ / million tokens
                <Input name="priceInput" inputMode="decimal" defaultValue={saved.priceSource === "you" ? saved.price?.input : ""} placeholder={saved.price ? String(saved.price.input) : "e.g. 2"} className="w-32" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-400">
                Output $ / million tokens
                <Input name="priceOutput" inputMode="decimal" defaultValue={saved.priceSource === "you" ? saved.price?.output : ""} placeholder={saved.price ? String(saved.price.output) : "e.g. 10"} className="w-32" />
              </label>
              <Button type="submit" size="sm" variant="secondary" disabled={pricePending}>{pricePending ? "Saving..." : "Save price"}</Button>
            </form>
            <p className="mt-1 text-xs text-neutral-500">Leave both empty and save to go back to the list price (if there is one).</p>
            {priceState.error && <p role="alert" className="mt-1 text-xs text-red-400">{priceState.error}</p>}
            {priceState.saved === role && <p role="status" className="mt-1 text-xs text-emerald-400">Saved.</p>}
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {shareSources.map((source) => (
        <form key={source.id} action={shareAction} className="flex flex-col gap-2 rounded-md border border-neutral-800 p-3">
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="from" value={source.id} />
          <p className="text-sm font-medium">Use the same key as {source.label} ({source.providerLabel})</p>
          <p className="text-xs text-neutral-500">One key, a different model for this job if you want one.</p>
          <div className="flex gap-2">
            <Input name="model" defaultValue={role === "image" ? source.imageModel : source.model} aria-label="Model name" required />
            <Button type="submit" variant="secondary" disabled={sharePending}>{sharePending ? "Saving..." : "Use it"}</Button>
          </div>
        </form>
      ))}
      {shareState.error && <p role="alert" className="text-sm text-red-400">{shareState.error}</p>}

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="role" value={role} />
        {forceCustom && <input type="hidden" name="custom" value="1" />}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`key-${role}`}>{shareSources.length ? "Or paste a different key" : "Paste your API key"}</Label>
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
                value={model || defaultModelFor(detected, role)}
                onChange={(e) => setModel(e.target.value)}
                placeholder={detected.id === "openrouter" ? "e.g. anthropic/claude-sonnet-4.5" : undefined}
                required
              />
            </div>
          </>
        )}
        {imageUnsupported && (
          <p className="text-sm text-neutral-300">Image generation works with SpicyAPI keys for now (they start with sk-spicy-). More providers are coming.</p>
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
