import type { MetadataRoute } from "next";

/** What phones use when someone adds ModelSpawn to their home screen: the name and the logo. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ModelSpawn",
    short_name: "ModelSpawn",
    start_url: "/",
    background_color: "#12030a",
    theme_color: "#12030a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
