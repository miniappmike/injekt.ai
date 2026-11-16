import type { MetadataRoute } from "next";
import { PWA_START_URL } from "@/lib/resume";

/**
 * What phones use when someone adds ModelSpawn to their home screen: the name, the logo, and that it opens as its own
 * app (`standalone`: no browser bars). The start address is marked, so opening the app can go back to the page it was
 * last on (see `src/proxy.ts`). Holding the icon on Android offers the shortcuts.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ModelSpawn",
    short_name: "ModelSpawn",
    start_url: PWA_START_URL,
    scope: "/",
    display: "standalone",
    background_color: "#12030a",
    theme_color: "#131316",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcuts: [
      { name: "Inject", url: "/inject" },
      { name: "Director", url: "/director" },
      { name: "Characters", url: "/characters" },
      { name: "Library", url: "/library" },
    ],
  };
}
