/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        stone: {
          DEFAULT: '#EEF0EA',
          50: '#F7F8F4',
          100: '#EEF0EA',
          200: '#DEE2D6',
          300: '#C5CBB9',
        },
        ink: {
          DEFAULT: '#1E2430',
          700: '#2A3242',
          500: '#4B5568',
          300: '#8891A0',
        },
        indigo: {
          DEFAULT: '#2B3A67',
          600: '#2B3A67',
          700: '#212C4E',
          100: '#E4E8F2',
        },
        marigold: {
          DEFAULT: '#E8A33D',
          600: '#D6912E',
          100: '#FBEBD2',
        },
        clay: {
          DEFAULT: '#C1502E',
          600: '#A9421F',
          100: '#F6DED4',
        },
        teal: {
          DEFAULT: '#3D8577',
          600: '#2F6B60',
          100: '#DCEDE9',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xs: '6px',
        card: '20px',
      },
      boxShadow: {
        elevated: '0 12px 32px -12px rgba(30, 36, 48, 0.28)',
      },
    },
  },
  plugins: [],
};