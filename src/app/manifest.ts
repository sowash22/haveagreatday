import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Have a Great Day",
    short_name: "Great Day",
    description: "Find comfortable times to go outside using weather, air quality, UV, comfort, and daylight.",
    start_url: "/",
    display: "standalone",
    background_color: "#111915",
    theme_color: "#111915",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
