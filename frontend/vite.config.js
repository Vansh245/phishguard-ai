import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/scan': 'https://phishguard-api.onrender.com',
      '/cluster': 'https://phishguard-api.onrender.com',
      '/fingerprint': 'https://phishguard-api.onrender.com',
      '/stats': 'https://phishguard-api.onrender.com',
      '/feed': 'https://phishguard-api.onrender.com',
      '/health': 'https://phishguard-api.onrender.com',
    }
  }
})
