import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// host: true exposes the dev server on the LAN so other devices on the
// same WiFi can open it for multi-user testing.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
