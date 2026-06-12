import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    target: "es2020",
  },
  define: {
    // Phaser uses global; Vite doesn't define it
    global: "globalThis",
  },
});
