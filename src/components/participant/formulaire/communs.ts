

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export const CLS_CELL = 'border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-primary w-full';
export const OPTIONS_ACTIVITES = [
  '🚶 Marche / Randonnée',
  '🚴 Cyclisme (vélo, vélo électrique)',
  '🏊 Natation / Aquagym',
  '🎾 Raquettes (tennis, badminton, ping-pong)',
  '⚽ Jeux de ballon (basket, foot, volley)',
  '🎯 Précision (pétanque, golf, sarbacane, tir à l\'arc, fléchettes)',
  '🤸 Gym douce / Stretching / Yoga',
  '💃 Danse / Activités rythmiques',
  '🏋️ Renforcement musculaire',
  '🧠 Activités cognitives (mémoire, jeux de société)',
];

export const CLS_INPUT = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';
export const CLS_LABEL = 'block text-sm font-medium text-gray-700 mb-1.5';
