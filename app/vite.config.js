import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  // Serve the parent "Dates Application/" folder as static root
  // so fetch('/data/dubai_places.json') picks up the real data file automatically
  publicDir: path.resolve(__dirname, '..'),
  server: {
    port: 3000,
    open: true,
    // Expose on local network so you can test from your iPhone over WiFi
    host: true,
  },
})
