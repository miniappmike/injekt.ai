import type { Metadata } from "next";
import { StartGuide } from "@/components/start-guide";

export const metadata: Metadata = {
  title: "Your first image",
  description: "A step-by-step guide to making your first model and your first image on ModelSpawn.",
};

/** The getting-started guide. The dashboard's first-steps tile links here. */
export default function GettingStartedGuide() {
  return <StartGuide />;
}
