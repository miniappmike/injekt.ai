import type { ImageProvider } from "./types";

const notImplemented = (what: string): never => {
  throw new Error(`SpicyAPI ${what} is not implemented yet. Fill in from the provider docs.`);
};

// Adapter shell. Endpoint paths and payload shapes must come from SpicyAPI's documentation.
export const spicyapi: ImageProvider = {
  id: "spicyapi",
  submit: async () => notImplemented("submit"),
  poll: async () => notImplemented("poll"),
  parseWebhook: () => notImplemented("parseWebhook"),
};
