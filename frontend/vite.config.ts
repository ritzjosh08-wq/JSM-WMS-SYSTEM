import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Note: Vite's dev server already falls back to index.html for unmatched routes by
  // default (client-side routing works out of the box) — no `historyApiFallback` option
  // exists on Vite's ServerOptions (that's a webpack-devserver setting), so it was never
  // doing anything except failing the `tsc -b` typecheck.
})
