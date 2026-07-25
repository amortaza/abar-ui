import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api/* to the Flask backend so the SPA can call it with
    // plain relative URLs (no CORS config needed in dev).
    proxy: {
      '/api': {
        target: 'http://192.168.1.21:5001',
        changeOrigin: true,
        // Strip the /api prefix: /api/projects -> /projects
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
