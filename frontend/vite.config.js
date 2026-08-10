import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/scan': 'http://localhost:8000',
      '/cluster': 'http://localhost:8000',
      '/fingerprint': 'http://localhost:8000',
      '/stats': 'http://localhost:8000',
      '/feed': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    }
  }
})
