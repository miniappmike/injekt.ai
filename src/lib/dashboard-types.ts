/** The dashboard's shapes, on their own so the browser's components can use them without the server-only loader. */
export interface DashCharacter {
  id: string;
  name: string;
  photo: string | null;
  /** Has both sheets, so every tool can use her. */
  ready: boolean;
  refs: number;
  maxRefs: number;
}

export interface DashImage {
  id: string;
  url: string;
  downloadUrl: string | null;
  prompt: string | null;
  expiresAt: string;
}

/** The first things a new account does, in order. Each is worked out from what the account already has. */
export type StepKey = "model" | "sheets" | "image" | "likeness" | "pin";
export const STEP_ORDER: StepKey[] = ["model", "sheets", "image", "likeness", "pin"];
