import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // @ts-expect-error WebXR requires HTTPS; Vite auto-generates self-signed cert
    https: true,
    host: true, // Expose on LAN for AR headsets to connect
  },
})
