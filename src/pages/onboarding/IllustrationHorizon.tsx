// Lever de soleil sur des collines, un chemin qui part vers l'horizon :
// l'image du nom de l'application, et de l'accompagnement qui commence.
// Dessin original, couleurs de la marque. Le soleil monte doucement à
// l'ouverture (désactivé si l'utilisateur réduit les animations).

import { useId } from 'react';

export default function IllustrationHorizon({ className = '', oiseaux = true }: { className?: string; oiseaux?: boolean }) {
  // Identifiants propres à chaque exemplaire : l'illustration est rendue deux
  // fois (panneau ordinateur masqué sur téléphone, et l'inverse), et un dégradé
  // pris dans un SVG masqué ne s'affiche pas dans l'autre.
  const u = useId().replace(/:/g, '');
  const id = (nom: string) => `ob-${nom}-${u}`;
  return (
    <svg viewBox="0 0 400 240" className={className} role="img" aria-label="Un soleil se lève sur des collines">
      <defs>
        <radialGradient id={id('soleil')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE2A8" />
          <stop offset="60%" stopColor="#F7B955" />
          <stop offset="100%" stopColor="#F0A429" />
        </radialGradient>
        <radialGradient id={id('halo')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD58A" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFD58A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('colline-1')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5FD0B6" />
          <stop offset="100%" stopColor="#2BB89A" />
        </linearGradient>
        <linearGradient id={id('colline-2')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2BB89A" />
          <stop offset="100%" stopColor="#1A9A7F" />
        </linearGradient>
        <linearGradient id={id('colline-3')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#17806A" />
          <stop offset="100%" stopColor="#0F5E4F" />
        </linearGradient>
      </defs>

      <g className="ob-soleil">
        <circle cx="315" cy="150" r="120" fill={`url(#${id('halo')})`} />
        <circle cx="315" cy="150" r="40" fill={`url(#${id('soleil')})`} />
      </g>

      {/* Deux oiseaux */}
      {oiseaux && <>
      <path d="M220 78 q6 -6 12 0 q6 -6 12 0" fill="none" stroke="#E6F5F1" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path d="M352 60 q4 -4 8 0 q4 -4 8 0" fill="none" stroke="#E6F5F1" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
      </>}

      <path d="M0 168 C60 140 120 150 180 160 S300 132 400 150 V240 H0 Z" fill={`url(#${id('colline-1')})`} opacity="0.55" />
      <path d="M0 190 C70 165 150 178 220 186 S340 165 400 176 V240 H0 Z" fill={`url(#${id('colline-2')})`} opacity="0.85" />
      <path d="M0 212 C90 196 170 206 240 212 S350 200 400 206 V240 H0 Z" fill={`url(#${id('colline-3')})`} />

      {/* Le chemin, qui part du premier plan et rejoint l'horizon */}
      <path d="M250 240 C268 222 300 212 292 198 C286 188 306 180 312 170" fill="none" stroke="#FFF6E5" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
      <path d="M250 240 C268 222 300 212 292 198 C286 188 306 180 312 170" fill="none" stroke="#FFF6E5" strokeWidth="12" strokeLinecap="round" opacity="0.18" />

      <style>{`
        .ob-soleil { animation: ob-lever 1.6s cubic-bezier(.2,.7,.2,1) both; transform-origin: 315px 150px; }
        @keyframes ob-lever { from { transform: translateY(26px); opacity: .4 } to { transform: none; opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .ob-soleil { animation: none } }
      `}</style>
    </svg>
  );
}
