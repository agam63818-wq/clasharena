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
    // Vite 5.4 refuses requests whose Host header is not in the allow-list
    // (a DNS-rebinding guard). Mirrors/proxies reach the dev server under a
    // generated host, so allow any host — this is a DEV-ONLY setting; the
    // production build is unaffected.
    allowedHosts: true
  }
})
