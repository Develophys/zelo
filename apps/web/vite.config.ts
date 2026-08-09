import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Set VITE_BASE_PATH (only done in the GitHub Pages workflow, from
// actions/configure-pages' base_path output, e.g. "/zelo" with no trailing
// slash) to build for a project-pages subpath. Left unset, base stays "/"
// (Vercel, local dev). Normalized to always end in "/" - import.meta.env.BASE_URL
// is concatenated directly with asset filenames elsewhere in the app.
const rawBasePath = process.env.VITE_BASE_PATH ?? "/";
const basePath = rawBasePath.endsWith("/") ? rawBasePath : `${rawBasePath}/`;

export default defineConfig({
  base: basePath,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Zelo",
        short_name: "Zelo",
        description: "Triagem e suporte confidencial à saúde mental do médico",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webp,woff2}"],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
