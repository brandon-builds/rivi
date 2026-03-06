import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f2f8f5",
        surface: "#ffffff",
        primary: "#2f9d74",
        primaryDark: "#227458",
        alert: "#b94a63"
      },
      boxShadow: {
        soft: "0 10px 30px -18px rgba(26, 77, 60, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
