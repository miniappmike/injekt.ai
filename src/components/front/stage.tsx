import { ViewTransition } from "react";

/** Link types: `TO_AUTH` on anything that opens log in or sign up, `TO_LANDING` on the X that goes back. */
export const TO_AUTH = ["front-to-auth"];
export const TO_LANDING = ["front-to-landing"];

/**
 * Wraps everything in front of the shared backdrop. Opening log in or sign up swipes the landing page up and away and
 * raises the form from below; the X does the reverse. The motion itself is in globals.css (front-*).
 */
export function FrontStage({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "front-to-auth": "front-rise-in", "front-to-landing": "front-drop-in", default: "none" }}
      exit={{ "front-to-auth": "front-rise-out", "front-to-landing": "front-drop-out", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
