/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef7ff',
          100: '#d8ebfb',
          200: '#b9dcf7',
          300: '#9dccf1',
          400: '#6fa6d8',
          500: '#4f87b7',
          600: '#386f99',
          700: '#2b587c',
          800: '#173a55',
          900: '#0b2233',
        },
      },
    },
  },
  plugins: [],
}
