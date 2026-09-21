import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // ⚠️ neutral / teal / red / amber portent le NOM d'une échelle Tailwind. Les
      // déclarer comme une simple chaîne (`red: '#E8544A'`) SUPPRIME l'échelle
      // entière : `bg-red-500`, `text-red-600`, `border-amber-200`… n'existent plus et
      // ne produisent AUCUN CSS, sans erreur ni avertissement (l'élément reste
      // simplement sans couleur). Constaté le 2026-09-21 : 54 classes distinctes,
      // plus de 240 emplacements sans effet — dont « Absent » sélectionné, invisible,
      // dans la modale de présence des cours collectifs.
      // On garde la couleur de marque en DEFAULT (`bg-red`, `text-teal`… inchangés)
      // ET l'échelle numérique de Tailwind. Ne jamais remplacer ces quatre clés par
      // une chaîne. Garde-fou : src/lib/tailwindEchelles.test.ts.
      colors: {
        primary:          '#2BB89A',
        'primary-light':  '#E6F5F1',
        'primary-dark':   '#1A9A7F',
        secondary:        '#1A9A7F',
        sidebar:          '#1A2332',
        dark:             '#1A2332',
        light:            '#E6F5F1',
        neutral:          { ...colors.neutral, DEFAULT: '#EEF4F7' },
        surface:          '#FFFFFF',
        'surface-2':      '#F5F9FB',
        'text-secondary': '#5A6B7A',
        'text-muted':     '#9DAFC0',
        border:           'rgba(0,0,0,0.06)',
        success:          '#27AE60',
        warning:          '#F0A429',
        danger:           '#E8544A',
        ink:              '#1A2332',
        'ink-2':          '#5A6B7A',
        'ink-3':          '#9DAFC0',
        teal:             { ...colors.teal, DEFAULT: '#2BB89A' },
        'teal-light':     '#E6F5F1',
        'teal-dark':      '#1A9A7F',
        red:              { ...colors.red, DEFAULT: '#E8544A' },
        'red-light':      '#FEF0EF',
        amber:            { ...colors.amber, DEFAULT: '#F0A429' },
        'amber-light':    '#FEF5E7',
      },
      fontFamily: {
        sans:    ['Plus Jakarta Sans', 'sans-serif'],
        heading: ['Plus Jakarta Sans', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },
      boxShadow: {
        sm:      '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.05)',
        md:      '0 2px 6px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.08)',
        lg:      '0 8px 32px rgba(0,0,0,0.10)',
        primary: '0 4px 14px rgba(43,184,154,0.28)',
        teal:    '0 4px 14px rgba(43,184,154,0.28)',
      },
      borderRadius: {
        sm:    '10px',
        md:    '14px',
        lg:    '18px',
        xl:    '22px',
        '2xl': '26px',
        '3xl': '32px',
        full:  '9999px',
      },
    },
  },
  plugins: [],
};
