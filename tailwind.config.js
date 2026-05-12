/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './public/**/*.html',
    './public/js/**/*.js',
  ],
  safelist: [
    'hidden',
    'block',
    'flex',
    'aip-open',
    'aip-show',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
