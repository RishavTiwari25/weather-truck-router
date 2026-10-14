import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Local dev: forward API calls to the Django server so no CORS is needed.
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('maplibre-gl')) return 'maplibre'
          if (id.includes('framer-motion')) return 'motion'
          return undefined
        },
      },
    },
  },
})
