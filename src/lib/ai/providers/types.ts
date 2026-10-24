import type { TokenUsage } from "@/lib/pricing";
import type { TaskInput } from "../master-prompt";

/** What a model wrote, and how many tokens it took when the provider says. */
export interface TextResult {
  text: string;
  usage?: TokenUsage;
}

// Raw text/vision backend. Implementations receive an already-built system prompt.
export interface TextBackend {
  readonly id: string;
  /** Longest image edge to send, for providers that cap total image tokens per request. */
  readonly imageMaxEdge?: number;
  complete(args: { system: string; text: string; images?: string[]; apiKey: string }): Promise<TextResult>;
}

// The only client callers get. It always applies the master prompt.
export interface GuardedTextClient {
  run(task: TaskInput): Promise<string>;
}

export type ImageJobStatus = "pending" | "processing" | "complete" | "failed";

export type ImageResolution = "1k" | "1.5k" | "2k";
export const IMAGE_RESOLUTIONS: readonly ImageResolution[] = ["1k", "1.5k", "2k"];
export const IMAGE_ASPECT_RATIOS = ["auto", "1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "3:2"] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];
export type ImageOutputFormat = "jpeg" | "png";

/** What a generation needs, independent of which provider runs it. Images are in the order the prompt refers to them. */
export interface ImageJobInput {
  prompt: string;
  imageUrls: string[];
  resolution: ImageResolution;
  aspectRatio: ImageAspectRatio;
  outputFormat: ImageOutputFormat;
}

export interface ImageJobState {
  status: ImageJobStatus;
  outputUrl?: string;
  mime?: string;
  /** A message a person can act on, when status is "failed". */
  error?: string;
  /** What the provider charged, as US dollars text, once known. */
  cost?: string;
  settled?: boolean;
}

export interface ImageWebhookEvent {
  jobId: string;
  status: ImageJobStatus;
  outputUrl?: string;
  error?: string;
}

export interface ImageProviderInfo {
  /** US dollars text. */
  balance?: string;
  prices?: { label: string; price: string }[];
}

export interface ImageProvider {
  readonly id: string;
  /** Free look at the account: what is left to spend and what this model charges. Parts the provider can't give are left out. */
  info?(args: { apiKey: string; model: string }): Promise<ImageProviderInfo>;
  /** Free request that proves the key works. Throws ProviderError when it does not. */
  check(args: { apiKey: string }): Promise<{ detail: string }>;
  /** Exact price of a request, in US dollars text. Creates nothing. */
  quote(args: { apiKey: string; model: string; input: ImageJobInput }): Promise<{ estimatedCost: string }>;
  /** Starts a job. The same idempotencyKey never starts (or charges) a second one. */
  submit(args: {
    apiKey: string;
    model: string;
    input: ImageJobInput;
    idempotencyKey: string;
    retentionSeconds?: number;
  }): Promise<{ jobId: string; estimatedCost?: string }>;
  /** Looks at a job once. Providers that call back can also offer parseWebhook. */
  poll(args: { apiKey: string; jobId: string }): Promise<ImageJobState>;
  parseWebhook?(rawBody: string): ImageWebhookEvent;
}
