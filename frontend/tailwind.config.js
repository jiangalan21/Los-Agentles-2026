/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#151418',
        foreground: '#f8f8f8',
        card: '#1d1b21',
        muted: '#2a272e',
        border: 'rgba(255, 255, 255, 0.12)',
        primary: {
          DEFAULT: '#ff9500',
        },
        secondary: {
          DEFAULT: '#ff375f',
        },
        tertiary: {
          DEFAULT: '#30d158',
        },
        purple: {
          DEFAULT: '#bf5af2',
        },
        blue: {
          DEFAULT: '#0a84ff',
        },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        logo: ['Archivo', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
      },
      boxShadow: {
        'glow-primary': '0 0 40px rgba(255, 149, 0, 0.2)',
        'glow-secondary': '0 0 40px rgba(255, 55, 95, 0.2)',
        'glow-tertiary': '0 0 40px rgba(48, 209, 88, 0.2)',
        'glow-purple': '0 0 40px rgba(191, 90, 242, 0.2)',
        'icon-primary': '0 0 24px rgba(255, 149, 0, 0.3)',
        'icon-secondary': '0 0 24px rgba(255, 55, 95, 0.3)',
        'icon-tertiary': '0 0 24px rgba(48, 209, 88, 0.3)',
        'icon-purple': '0 0 24px rgba(191, 90, 242, 0.3)',
      },
    },
  },
  plugins: [],
}
