import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          DEFAULT: "#0A1628",
          secondary: "#12203A",
        },
        green: {
          DEFAULT: "#00FF87",
          glow: "rgba(0, 255, 135, 0.4)",
        },
        gray: {
          DEFAULT: "#94A3B8",
        },
        red: {
          DEFAULT: "#FF6B6B",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
