import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Merriweather', 'Georgia', 'serif'],
        body: ['Segoe UI', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace']
      },
      boxShadow: {
        soft: '0 12px 30px rgba(16, 32, 22, 0.07)',
        softDark: '0 16px 40px rgba(0, 0, 0, 0.34)'
      },
      keyframes: {
        toastIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        fadeInFast: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      },
      animation: {
        toastIn: 'toastIn 160ms ease-out',
        fadeInFast: 'fadeInFast 150ms ease-out'
      }
    }
  },
  plugins: []
};

export default config;
