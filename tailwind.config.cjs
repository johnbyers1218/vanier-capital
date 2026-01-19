/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./views/**/*.ejs'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        serif: ['Merriweather', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
        heading: ['Merriweather', 'Georgia', 'serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#0b4d3a',
          dark: '#093d2d',
          light: '#b6d1c8',
          accent: '#174f72',
          gold: '#b58b31',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
