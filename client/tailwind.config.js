/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        stone: {
          DEFAULT: '#F3EFE4',
          50: '#FBF9F2',
          100: '#F3EFE4',
          200: '#E5DECE',
          300: '#C9C0AD',
        },
        ink: {
          DEFAULT: '#24343A',
          700: '#32464A',
          500: '#566568',
          300: '#8C9998',
        },
        indigo: {
          DEFAULT: '#2B3A67',
          600: '#2B3A67',
          700: '#212C4E',
          100: '#E4E8F2',
        },
        marigold: {
          DEFAULT: '#C78B46',
          600: '#A96E31',
          100: '#F3E4C9',
        },
        clay: {
          DEFAULT: '#C1502E',
          600: '#A9421F',
          100: '#F6DED4',
        },
        teal: {
          DEFAULT: '#3E766A',
          600: '#2D5E55',
          100: '#DCEBE3',
        },
        ocean: {
          DEFAULT: '#2F6673',
          700: '#24515D',
          100: '#DDECEF',
        },
        ochre: {
          DEFAULT: '#C78B46',
          100: '#F3E4C9',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        editorial: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xs: '6px',
        card: '10px',
      },
      boxShadow: {
        elevated: '0 12px 32px -12px rgba(30, 36, 48, 0.28)',
        paper: '0 8px 22px -16px rgba(36, 52, 58, 0.46)',
      },
    },
  },
  plugins: [],
};