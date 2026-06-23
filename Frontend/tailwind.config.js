/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        foreground: '#ffffff',
        accent: {
          DEFAULT: '#00e5ff',
          dim: 'rgba(0, 229, 255, 0.3)',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          bright: 'rgba(255, 255, 255, 0.15)',
        },
        card: {
          DEFAULT: '#0f0f0f',
          hover: '#161616',
        }
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'monospace'],
        sans: ['IBM Plex Sans', 'sans-serif'],
      },
      animation: {
        'sweep': 'sweep 4s ease-in-out infinite',
        'sweepV': 'sweepV 5s ease-in-out infinite',
        'pulse-slow': 'pulse 2s ease-in-out infinite',
      },
      keyframes: {
        sweep: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '30%': { opacity: '0.7' },
          '70%': { opacity: '0.7' },
          '100%': { opacity: '0', transform: 'translateX(20px)' },
        },
        sweepV: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '30%': { opacity: '0.6' },
          '70%': { opacity: '0.6' },
          '100%': { opacity: '0', transform: 'translateY(20px)' },
        },
      }
    },
  },
  plugins: [],
}
