/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:   '#2BBFBF',   // Turquoise Horizon
        secondary: '#1D9E9E',   // Turquoise foncé
        light:     '#E8F8F8',   // Fond turquoise très clair
        dark:      '#032c28',   // Vert très foncé (sidebar)
        success:   '#1D9E75',
        warning:   '#E8A020',
        danger:    '#E85050',
        neutral:   '#F4FAFA',
      },
      fontFamily: {
        sans:    ['Nunito', 'sans-serif'],
        heading: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
