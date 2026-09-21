import { describe, it, expect } from 'vitest';
import resolveConfig from 'tailwindcss/resolveConfig';
import defaultColors from 'tailwindcss/colors';

// Garde-fou : une clé de couleur du thème qui porte le NOM d'une échelle Tailwind
// (red, amber, teal, neutral…) et qui est déclarée comme une simple chaîne
// SUPPRIME toute l'échelle. `bg-red-500`, `text-red-600`, `border-amber-200`
// cessent alors de produire du CSS, sans erreur ni avertissement : l'élément
// reste juste sans couleur. Constaté le 2026-09-21 — 54 classes distinctes, plus
// de 240 emplacements sans effet, dont « Absent » sélectionné (invisible) dans la
// modale de présence des cours collectifs.
//
// Historique : le bug avait déjà été rencontré en juillet 2026 (bouton du planning
// blanc sur blanc, commit 88c282b). Les deux fichiers concernés avaient été
// corrigés à la main, et src/lib/couleurs.test.ts exigeait que `red` reste une
// couleur PLATE, en précisant que ce test « deviendrait obsolète » si la config
// rendait l'échelle. C'est ce qui a été fait ici, à la source : ce fichier remplace
// couleurs.test.ts, dont la prémisse (échelle red supprimée) n'est plus vraie.
//
// Le chemin passe par une variable pour que tsc ne cherche pas de types à un
// fichier JS situé hors de src/.
const CHEMIN_CONFIG = '../../tailwind.config.js';

async function themeResolu() {
  const { default: config } = await import(/* @vite-ignore */ CHEMIN_CONFIG);
  return resolveConfig(config).theme.colors as unknown as Record<string, unknown>;
}

describe('thème Tailwind : les couleurs de marque gardent l\'échelle numérique', () => {
  const FAMILLES = { red: '#E8544A', amber: '#F0A429', teal: '#2BB89A', neutral: '#EEF4F7' } as const;

  it.each(Object.entries(FAMILLES))('%s : couleur de marque en DEFAULT, échelle 50 à 950 conservée', async (nom, marque) => {
    const couleurs = await themeResolu();
    const famille = couleurs[nom] as Record<string, string>;

    expect(typeof famille, `« ${nom} » doit rester un objet (échelle), pas une chaîne`).toBe('object');
    // Couleur de marque : bg-red, text-teal… inchangés.
    expect(famille.DEFAULT).toBe(marque);
    // Échelle : identique à celle de Tailwind, sur toutes les nuances.
    const attendue = (defaultColors as unknown as Record<string, Record<string, string>>)[nom];
    for (const nuance of ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']) {
      expect(famille[nuance], `${nom}-${nuance}`).toBe(attendue[nuance]);
    }
  });

  it('les variantes nommées du projet existent toujours (bg-red-light, text-teal-dark…)', async () => {
    const couleurs = await themeResolu();
    expect(couleurs['red-light']).toBe('#FEF0EF');
    expect(couleurs['amber-light']).toBe('#FEF5E7');
    expect(couleurs['teal-light']).toBe('#E6F5F1');
    expect(couleurs['teal-dark']).toBe('#1A9A7F');
  });

  it('aucune autre clé du thème ne masque une échelle Tailwind par une chaîne', async () => {
    const couleurs = await themeResolu();
    const masquees = Object.keys(defaultColors)
      .filter(nom => typeof (defaultColors as unknown as Record<string, unknown>)[nom] === 'object')
      .filter(nom => typeof couleurs[nom] === 'string');
    expect(masquees, `échelle(s) Tailwind remplacée(s) par une chaîne : ${masquees.join(', ')}`).toEqual([]);
  });
});
