import type { TaskInput } from "../master-prompt";

// Raw text/vision backend. Implementations receive an already-built system prompt.
export interface TextBackend {
  readonly id: string;
  /** Longest image edge to send, for providers that cap total image tokens per request. */
  readonly imageMaxEdge?: number;
  complete(args: { system: string; text: string; images?: string[]; apiKey: string }): Promise<string>;
}

// The only client callers get. It always applies the master prompt.
export interface GuardedTextClient {
  run(task: TaskInput): Promise<string>;
}

export type ImageJobStatus = "pending" | "processing" | "complete" | "failed";

export interface ImageSubmitArgs {
  apiKey: string;
  model: string;
  prompt: string;
  referenceUrls: string[];
  targetUrl?: string;
  params: Record<string, unknown>;
  webhookUrl: string;
}

export interface ImageWebhookEvent {
  jobId: string;
  status: ImageJobStatus;
  outputUrl?: string;
  error?: string;
}

export interface ImageProvider {
  readonly id: string;
  submit(args: ImageSubmitArgs): Promise<{ jobId: string }>;
  /** Fallback for providers without webhooks, or for lost deliveries. */
  poll(args: { apiKey: string; jobId: string }): Promise<ImageWebhookEvent>;
  /** Parse a verified webhook body into a normalized event. */
  parseWebhook(rawBody: string): ImageWebhookEvent;
}
