import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/run-analysis": "http://localhost:3001",
      "/trigger-analysis": "http://localhost:3001",
      "/run-followup": "http://localhost:3001",
      "/report-html": "http://localhost:3001",
      "/send-message": "http://localhost:3001",
    },
  },
})
