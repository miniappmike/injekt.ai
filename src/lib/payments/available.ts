import "server-only";
import { telegramEnabled } from "@/lib/payments/telegram";
import { nowpaymentsEnabled } from "@/lib/payments/nowpayments";
import type { PayMethods } from "@/lib/payments/methods";

export const availablePayMethods = (): PayMethods => ({ telegram: telegramEnabled(), crypto: nowpaymentsEnabled() });
