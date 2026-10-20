import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the browser calls /api/... on Vite's own address, and Vite forwards those
    // requests to the Express server. One address for the browser means no CORS setup is needed.
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
