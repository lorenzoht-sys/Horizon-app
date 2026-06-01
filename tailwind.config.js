/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:          '#2BBFBF',
        'primary-light':  '#E8F9F9',
        'primary-dark':   '#1E9494',
        secondary:        '#1D9E9E',
        sidebar:          '#0D2B2B',
        dark:             '#0D2B2B',
        light:            '#E8F9F9',
        neutral:          '#F4FAFA',
        'text-secondary': '#5C7A7A',
        'text-muted':     '#A8C0C0',
        border:           '#E2EEEE',
        success:          '#27AE60',
        warning:          '#F39C12',
        danger:           '#E74C3C',
      },
      fontFamily: {
        sans:    ['Nunito', 'sans-serif'],
        heading: ['Poppins', 'sans-serif'],
      },
      boxShadow: {
        sm:      '0 1px 3px rgba(13,43,43,0.06)',
        md:      '0 4px 16px rgba(13,43,43,0.08)',
        lg:      '0 8px 32px rgba(13,43,43,0.10)',
        primary: '0 4px 20px rgba(43,191,191,0.20)',
      },
    },
  },
  plugins: [],
};
