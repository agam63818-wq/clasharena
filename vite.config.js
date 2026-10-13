import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors into cacheable chunks; the admin dashboard is
        // already lazy-loaded as its own chunk (src/App.jsx).
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-motion': ['framer-motion']
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: 'all'
  }
})
