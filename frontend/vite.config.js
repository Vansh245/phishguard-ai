import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/scan': 'https://phishguard-ai-2-g5ca.onrender.com',
      '/cluster': 'https://phishguard-ai-2-g5ca.onrender.com',
      '/fingerprint': 'https://phishguard-ai-2-g5ca.onrender.com',
      '/stats': 'https://phishguard-ai-2-g5ca.onrender.com',
      '/feed': 'https://phishguard-ai-2-g5ca.onrender.com',
      '/health': 'https://phishguard-ai-2-g5ca.onrender.com',
    }
  }
})
