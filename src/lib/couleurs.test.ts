// Non-régression du bug "bouton invisible" (blanc sur blanc) dans la grille
// de planning : tailwind.config.js redéfinit `red` comme une couleur PLATE
// (`red: '#E8544A'`), ce qui écrase toute l'échelle par défaut de Tailwind —
// les classes `bg-red-500`, `text-red-700`, etc. ne compilent vers AUCUN CSS
// (vérifié dans le bundle compilé lors du correctif). Un bouton stylé avec
// `bg-red-500 text-white` hérite alors du fond blanc de sa modale, avec du
// texte blanc dessus.
//
// Ce projet n'a pas d'environnement DOM/CSS (vitest tourne en `environment:
// 'node'`, voir vitest.config.ts) : un vrai test de rendu/contraste n'est pas
// possible ici sans ajouter jsdom + une pile de rendu. Ce test est donc une
// analyse statique du code source — il empêche la RÉAPPARITION du motif de
// classes invalide (`(bg|text|border)-red-<chiffre>`) dans les fichiers déjà
// corrigés, pas une vérification de rendu réel.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MOTIF_CLASSE_ROUGE_INVALIDE = /(?:^|["'`\s])(?:hover:|focus:)?(?:bg|text|border)-red-\d+(?=["'`\s]|$)/g;

const FICHIERS_CORRIGES = [
  'src/components/planning/PlanningGrilleView.tsx',
  'src/components/planning/FrisePlanningJour.tsx',
];

describe('Non-régression — classes Tailwind "red-<chiffre>" invalides (bouton invisible)', () => {
  for (const fichier of FICHIERS_CORRIGES) {
    it(`${fichier} ne doit contenir aucune classe bg/text/border-red-<chiffre>`, () => {
      const contenu = fs.readFileSync(path.resolve(process.cwd(), fichier), 'utf8');
      const matches = contenu.match(MOTIF_CLASSE_ROUGE_INVALIDE) ?? [];
      expect(matches).toEqual([]);
    });
  }

  it('la palette Tailwind du projet ne définit bien qu\'une couleur "red" plate (documente la cause racine, alerte si la config change)', () => {
    const config = fs.readFileSync(path.resolve(process.cwd(), 'tailwind.config.js'), 'utf8');
    expect(config).toMatch(/red:\s*['"]#[0-9a-fA-F]{6}['"]/);
    expect(config).not.toMatch(/red:\s*\{/); // si ça redevient une échelle {50:...,900:...}, ce test (et le bug) deviennent obsolètes
  });
});
