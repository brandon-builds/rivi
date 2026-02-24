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
        canvas: "#f4f7f5",
        surface: "#ffffff",
        primary: "#0a6e4c",
        primaryDark: "#055239",
        alert: "#b00020"
      }
    }
  },
  plugins: []
};

export default config;
