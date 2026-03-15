import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test-setup.ts",
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8095",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "react";
          }
          if (id.includes("node_modules/@tanstack/react-query")) {
            return "query";
          }
          if (id.includes("node_modules/@tanstack/react-router")) {
            return "router";
          }
          if (id.includes("node_modules/@radix-ui")) {
            return "radix";
          }
          if (id.includes("node_modules/openpgp")) {
            return "openpgp";
          }
          if (id.includes("node_modules/@tiptap") || id.includes("node_modules/prosemirror")) {
            return "tiptap";
          }
          if (id.includes("node_modules/@dnd-kit")) {
            return "dnd-kit";
          }
        },
      },
    },
  },
});
