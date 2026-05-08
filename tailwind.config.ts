import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mud: {
          900: "#0b0d0f",
          800: "#13171a",
          700: "#1c2125",
          600: "#2a3036",
          500: "#3a4148",
          400: "#5e6770",
          accent: "#f59e0b",
          danger: "#ef4444",
          ok: "#22c55e",
        },
      },
      fontFamily: {
        display: ["ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
