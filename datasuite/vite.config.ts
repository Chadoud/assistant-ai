import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../web/assets",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: "src/main.ts",
      },
      output: {
        entryFileNames: "app.js",
        assetFileNames: "app.[ext]",
      },
    },
  },
});
