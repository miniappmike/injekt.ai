import type { LimitKey } from "./limits";

export class ApiKeyRequiredError extends Error {
  readonly redirectTo: string;
  constructor(public readonly provider: string) {
    super(`No API key configured for ${provider}`);
    this.name = "ApiKeyRequiredError";
    this.redirectTo = `/settings/api-keys?provider=${encodeURIComponent(provider)}`;
  }
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
  }
}

export class LimitReachedError extends Error {
  constructor(public readonly key: LimitKey) {
    super(`Free plan limit reached: ${key}`);
    this.name = "LimitReachedError";
  }
}

/** Not enough credits for this job. */
export class InsufficientCreditsError extends Error {
  constructor(
    public readonly needed: number,
    public readonly balance: number,
  ) {
    super(`Not enough credits: need ${needed}, have ${balance}`);
    this.name = "InsufficientCreditsError";
  }
}

/** Today's allowance of a prompt tool is used up. */
export class DailyLimitError extends Error {
  constructor(
    public readonly key: "runs" | "likeness" | "images",
    public readonly plan: "free" | "pro",
    public readonly limit: number,
    /** Pro's limit for the same thing, to say what upgrading gives. */
    public readonly proLimit: number,
  ) {
    super(`Daily limit reached: ${key}`);
    this.name = "DailyLimitError";
  }
}

/** A problem the user can fix, with a message that is safe to show as written. Not logged as a bug. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
