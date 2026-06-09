import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Data files live in app/public/data/ — served at /data/ in both dev and production
  server: {
    port: 3000,
    open: true,
    host: true,
  },
})
