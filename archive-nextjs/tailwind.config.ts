import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "var(--brand-blue)",
          blueDark: "var(--brand-blue-dark)",
          red: "var(--brand-red)",
        },
        sidebar: {
          DEFAULT: "var(--bg-sidebar)",
          hover: "var(--bg-sidebar-hover)",
          active: "var(--bg-sidebar-active)",
        },
        surface: {
          canvas: "var(--bg-canvas)",
          card: "var(--bg-surface)",
        },
        status: {
          success: "var(--success)",
          warning: "var(--warning)",
          danger: "var(--danger)",
          info: "var(--info)",
        },
        industrial: {
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          800: "#1F2937",
          900: "#111827",
        },
      },
      boxShadow: {
        'card': '0 1px 3px rgba(16, 33, 72, 0.08)',
      }
    },
  },
  plugins: [],
};
export default config;
