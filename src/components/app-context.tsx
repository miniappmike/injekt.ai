"use client";

import { createContext, useContext } from "react";

/** What the signed-in pages need to know about the account. */
export interface AppInfo {
  /** Image generation on the site (own Image key + turned on in Settings). Off: the tools write prompts to paste. */
  generation: boolean;
  /** They have saved an Image key of their own (needed before generation can be switched on). */
  imageKey?: boolean;
  /** They have been through the two-step confirmation in Settings once. */
  generationConfirmed?: boolean;
  /** Who pays for images: credits (the platform's key), or their own Image key on Pro. */
  billing?: "credits" | "own";
  /** Pro (or admin): own keys, no daily limits. */
  pro?: boolean;
}

const Ctx = createContext<AppInfo>({ generation: false });

export function AppProvider({ value, children }: { value: AppInfo; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
/** Whether Generate buttons and other image-generation controls should show. */
export const useGeneration = () => useContext(Ctx).generation;
