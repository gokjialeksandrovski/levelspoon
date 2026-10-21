import type { MetadataRoute } from "next";

// Colors mirror the light --raw-bg in globals.css; a manifest has one value,
// not a light/dark pair like layout.tsx's themeColor.
const manifest = (): MetadataRoute.Manifest => ({
  name: "levelspoon",
  short_name: "levelspoon",
  description: "Log meals by their nutrition per 100g",
  start_url: "/",
  display: "standalone",
  background_color: "#fdfbf7",
  theme_color: "#fdfbf7",
  icons: [
    { src: "/apple-icon/512", sizes: "512x512", type: "image/png" },
    { src: "/apple-icon/180", sizes: "180x180", type: "image/png" },
  ],
});

export default manifest;
