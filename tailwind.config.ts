import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        'yellow-gold': '#dfb768',
      },
    },
  },
  plugins: [],
};

export default config;

