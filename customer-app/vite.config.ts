import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Customer portal runs on its own port (5174) so it can run
// side-by-side with the WMS frontend (5173) and backend (5001).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false,
  },
})
