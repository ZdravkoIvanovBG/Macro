/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0f1115',
          soft: '#1a1d24',
          line: '#272b34',
        },
        accent: {
          DEFAULT: '#4ade80',
          dim: '#22c55e',
        },
        protein: '#60a5fa',
        carbs: '#fbbf24',
        fat: '#f472b6',
      },
    },
  },
  plugins: [],
};
