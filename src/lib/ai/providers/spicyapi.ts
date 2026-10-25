import { SpicyApiError, SpicyClient, SpicyTransportError } from "@spicyapi/sdk";
import { ProviderError } from "./text";
import { SPICY_IMAGE_MODEL } from "./detect";
import type { ImageJobInput, ImageJobState, ImageProvider } from "./types";

export { SPICY_IMAGE_MODEL };

/** Seedream calls reference images "Image 1", "Image 2". Our prompts use @image1 labels everywhere else. */
export const translateImageRefs = (prompt: string) => prompt.replace(/@image(\d+)/gi, "Image $1");

export function buildSpicyInput(input: ImageJobInput) {
  return {
    prompt: translateImageRefs(input.prompt).slice(0, 5000),
    image_urls: input.imageUrls,
    resolution: input.resolution,
    aspect_ratio: input.aspectRatio,
    output_format: input.outputFormat,
    background: "opaque",
  };
}

const client = (apiKey: string) => new SpicyClient({ apiKey });

// Turns SDK errors into messages a person can act on. Branches on the error code, never the wording.
export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof SpicyApiError) {
    const say = (m: string) => new ProviderError("spicyapi", e.status, m);
    switch (e.code) {
      case 401:
        return say("SpicyAPI rejected this API key. Check that it was copied in full and is still active.");
      case 40201:
        return say("Your SpicyAPI balance is too low. Add funds in the SpicyAPI console, then try again.");
      case 40202:
        return say("A spend cap on your SpicyAPI key was reached. Raise it in the SpicyAPI console.");
      case 40301:
        return say("This SpicyAPI key isn't allowed to use that image model. Add the model to the key's allowed models.");
      case 404:
        return say("SpicyAPI couldn't find that model. Check the model name on the API keys page.");
      case 429:
        return say("SpicyAPI is rate limiting this key. Wait a moment and try again.");
      case 50301:
        return say("That image model isn't taking requests right now. Try again later.");
      case 400:
        return say(`SpicyAPI rejected the request: ${e.message}`);
      default:
        return say(`SpicyAPI error ${e.code}: ${e.message}`);
    }
  }
  if (e instanceof SpicyTransportError) {
    return new ProviderError("spicyapi", 0, "Couldn't reach SpicyAPI. Check your connection and try again.");
  }
  throw e;
}

const FAILURES: Record<string, string> = {
  content_rejected: "The image model declined this request under its own content policy. Try a different prompt or image.",
  invalid_asset: "One of the images couldn't be read by the image model. Try different images.",
  invalid_request: "The image model couldn't accept these settings. Try different options.",
  unsupported_combination: "The image model doesn't support that combination of settings. Try different options.",
  rate_limited: "The image model is busy. Try again in a moment.",
  upstream_unavailable: "The image model is unavailable right now. Try again later.",
  upstream_failed: "The image model had a problem. Try again.",
  timeout: "The image took too long to make. Try again, or a lower resolution.",
  generation_failed: "The image model couldn't make this image. Try changing the prompt or the images.",
};

export const describeTaskFailure = (code?: string, message?: string) =>
  (code && FAILURES[code]) || message || "The image couldn't be generated.";

export const spicyapi: ImageProvider = {
  id: "spicyapi",

  async check({ apiKey }) {
    try {
      const balance = await client(apiKey).getBalance();
      return { detail: `Available balance: $${balance.available}` };
    } catch (e) {
      throw toProviderError(e);
    }
  },

  async quote({ apiKey, model, input }) {
    try {
      const q = await client(apiKey).quoteTask({ model, input: buildSpicyInput(input) });
      return { estimatedCost: q.estimatedCost };
    } catch (e) {
      throw toProviderError(e);
    }
  },

  async submit({ apiKey, model, input, idempotencyKey, retentionSeconds }) {
    try {
      const accepted = await client(apiKey).createTask(
        { model, input: buildSpicyInput(input) },
        { idempotencyKey, ...(retentionSeconds !== undefined ? { retentionSeconds } : {}) },
      );
      return { jobId: accepted.taskId, estimatedCost: accepted.estimatedCost };
    } catch (e) {
      throw toProviderError(e);
    }
  },

  async poll({ apiKey, jobId }): Promise<ImageJobState> {
    let record;
    try {
      record = await client(apiKey).getTask(jobId);
    } catch (e) {
      throw toProviderError(e);
    }
    switch (record.state) {
      case "queued":
        return { status: "pending" };
      case "running":
        return { status: "processing" };
      case "succeeded": {
        const assets = record.output?.assets ?? [];
        if (assets.some((a) => a.unavailable)) {
          return { status: "failed", error: "The finished image could not be stored by the provider. Try generating again." };
        }
        const ready = assets.find((a) => a.url && !a.pending);
        // Finished, but the file is still being copied: keep waiting.
        if (!ready?.url) return { status: "processing" };
        return { status: "complete", outputUrl: ready.url, mime: ready.mime, cost: record.cost, settled: record.settled };
      }
      default:
        return { status: "failed", error: describeTaskFailure(record.errorCode, record.errorMessage), cost: record.cost, settled: record.settled };
    }
  },
};
