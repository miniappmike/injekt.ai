"use client";

import { createContext, useContext } from "react";

/** What the signed-in pages need to know about the account. */
export interface AppInfo {
  /** Image generation on the site (own Image key + turned on in Settings). Off: the tools write prompts to paste. */
  generation: boolean;
}

const Ctx = createContext<AppInfo>({ generation: false });

export function AppProvider({ value, children }: { value: AppInfo; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
/** Whether Generate buttons and other image-generation controls should show. */
export const useGeneration = () => useContext(Ctx).generation;
