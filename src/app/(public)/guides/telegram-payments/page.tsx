import type { Metadata } from "next";
import { TelegramGuide } from "@/components/telegram-guide";

export const metadata: Metadata = {
  title: "How to pay with Telegram",
  description: "A step-by-step guide to paying for ModelSpawn tokens and Pro with Telegram Stars.",
};

/** The step-by-step guide to paying with Telegram Stars. The Pay with Telegram pop-up links here. */
export default function TelegramPaymentsGuide() {
  return <TelegramGuide />;
}
