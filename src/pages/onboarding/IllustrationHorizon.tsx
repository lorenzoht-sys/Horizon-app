// Lever de soleil sur des collines, et la silhouette du logo Horizon qui
// avance sur le chemin, bras levés vers l'horizon : l'accompagnement qui
// commence. Dessin original, couleurs de la marque. Collines opaques, de la
// plus claire (lointaine) à la plus sombre (premier plan), pour que le soleil
// se lève vraiment derrière. Le soleil monte doucement à l'ouverture
// (désactivé si l'utilisateur réduit les animations).
//
// 25/11/2026 : seconde version, à la demande de Lorenzo (la première, aux
// collines translucides, laissait voir le soleil au travers).

import { useId } from 'react';

export default function IllustrationHorizon({ className = '', oiseaux = true }: { className?: string; oiseaux?: boolean }) {
  // Identifiants propres à chaque exemplaire : l'illustration est rendue deux
  // fois (panneau ordinateur masqué sur téléphone, et l'inverse), et un dégradé
  // pris dans un SVG masqué ne s'affiche pas dans l'autre.
  const u = useId().replace(/:/g, '');
  const id = (nom: string) => `ob-${nom}-${u}`;
  const url = (nom: string) => `url(#${id(nom)})`;
  return (
    <svg viewBox="0 0 400 240" className={className} role="img" aria-label="Un soleil se lève sur des collines, une silhouette avance sur le chemin">
      <defs>
        <radialGradient id={id('soleil')} cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFF1CC" />
          <stop offset="55%" stopColor="#FFC867" />
          <stop offset="100%" stopColor="#F5A332" />
        </radialGradient>
        <radialGradient id={id('halo')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFC867" stopOpacity="0.5" />
          <stop offset="45%" stopColor="#FFC867" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#FFC867" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('loin')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9FE3D0" />
          <stop offset="100%" stopColor="#6BCDB3" />
        </linearGradient>
        <linearGradient id={id('milieu')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3DC2A3" />
          <stop offset="100%" stopColor="#24A487" />
        </linearGradient>
        <linearGradient id={id('pres')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#178069" />
          <stop offset="100%" stopColor="#0D5547" />
        </linearGradient>
        <linearGradient id={id('chemin')} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#FFF6E5" />
          <stop offset="100%" stopColor="#FFE6B8" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      <g className="ob-soleil">
        <circle cx="300" cy="150" r="130" fill={url('halo')} />
        <circle cx="300" cy="150" r="66" fill="none" stroke="#FFE2A8" strokeOpacity="0.14" strokeWidth="1.5" />
        <circle cx="300" cy="150" r="88" fill="none" stroke="#FFE2A8" strokeOpacity="0.08" strokeWidth="1.5" />
        <circle cx="300" cy="150" r="40" fill={url('soleil')} />
      </g>

      {oiseaux && (
        <g fill="none" stroke="#F3FBF8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M196 74 q5 -5 10 0 q5 -5 10 0" strokeWidth="1.8" opacity="0.75" />
          <path d="M222 62 q3.5 -3.5 7 0 q3.5 -3.5 7 0" strokeWidth="1.4" opacity="0.55" />
        </g>
      )}

      {/* Collines lointaines, avec trois arbres */}
      <path d="M0 160 C50 142 105 146 160 154 C215 162 255 142 300 140 C340 138 372 146 400 152 V240 H0 Z" fill={url('loin')} />
      <g fill="#5BBFA4">
        <circle cx="70" cy="147" r="6" /><rect x="69" y="151" width="2" height="5" rx="1" />
        <circle cx="82" cy="149" r="4.5" /><rect x="81" y="152" width="2" height="4" rx="1" />
        <circle cx="372" cy="144" r="5" /><rect x="371" y="148" width="2" height="5" rx="1" />
      </g>

      {/* Collines du milieu */}
      <path d="M0 186 C60 166 130 170 190 180 C240 188 300 168 350 166 C375 165 390 168 400 170 V240 H0 Z" fill={url('milieu')} />

      {/* Le chemin, large au premier plan, qui s'affine vers le soleil */}
      <path
        d="M196 240 C214 224 246 214 254 200 C260 190 268 182 280 176 C286 173 292 168 296 162
           L299 162 C297 169 292 176 286 181 C276 189 270 198 266 208 C258 224 240 232 232 240 Z"
        fill={url('chemin')}
      />

      {/* Premier plan */}
      <path d="M0 214 C70 200 140 202 180 212 C196 218 204 228 208 240 H0 Z" fill={url('pres')} />
      <path d="M226 240 C254 222 320 206 400 204 V240 Z" fill={url('pres')} />

      {/* La silhouette du logo, bras levés, en marche sur le chemin */}
      <g transform="translate(276 168) scale(0.9)" fill="none" stroke="#FFF6E5" strokeLinecap="round">
        <circle cx="0" cy="-8.5" r="3.6" fill="#FFF6E5" stroke="none" />
        <path d="M-7 -6 Q0 3 7 -6" strokeWidth="2.6" />
        <path d="M-5.5 8 Q0 -3 5.5 8" strokeWidth="2.6" />
      </g>

      <style>{`
        .ob-soleil { animation: ob-lever 1.8s cubic-bezier(.2,.7,.2,1) both; transform-box: view-box; transform-origin: 300px 150px; }
        @keyframes ob-lever { from { transform: translateY(30px); opacity: .35 } to { transform: none; opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .ob-soleil { animation: none } }
      `}</style>
    </svg>
  );
}
