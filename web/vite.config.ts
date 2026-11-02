import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The claim website (D-023). Built to web/dist and served by the Oruno server on the same origin.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // No inline scripts or styles, so the strict Content Security Policy holds.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
    // `pnpm web:dev` talks to the API server on port 3000.
    proxy: { "/v1": "http://127.0.0.1:3000" },
  },
});
