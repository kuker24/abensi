/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        primary: {
          50: '#fef7ed',
          100: '#fdecd4',
          200: '#fbd6a8',
          300: '#f7ba6e',
          400: '#f29c3a',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        warm: {
          50: '#fdfbf7',
          100: '#faf5ed',
          200: '#f5ead6',
          300: '#ecd9b8',
          400: '#dfc08f',
          500: '#d4a76a',
          600: '#c49a5e',
          700: '#a67c52',
          800: '#8a6548',
          900: '#72533e',
        },
        ink: {
          50: '#f6f6f7',
          100: '#e3e3e6',
          200: '#c7c7cc',
          300: '#a1a1aa',
          400: '#7a7a85',
          500: '#5e5e68',
          600: '#4a4a52',
          700: '#3a3a40',
          800: '#2a2a30',
          900: '#1a1a1f',
        },
      },
    },
  },
  plugins: [],
}
