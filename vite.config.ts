import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            /node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)
          )
            return "framework";
          if (/node_modules\/(@mui|@emotion)\//.test(id)) return "material";
          if (/node_modules\/(zod|@tanstack)\//.test(id)) return "data";
        },
      },
    },
  },
});
