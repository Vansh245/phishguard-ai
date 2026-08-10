// Single source of truth for the backend URL.
// Override at build time with a .env file: VITE_API_BASE=https://your-backend.onrender.com
export const API_BASE =
  import.meta.env.VITE_API_BASE || 'https://phishguard-ai-2-g5ca.onrender.com'
