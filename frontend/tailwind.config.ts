import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0f1e',
        foreground: '#f1f5f9',
      }
    },
  },
  plugins: [],
} satisfies Config
