import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { EBAUCHE_FACTURATION_VISIBLE } from './featuresFacturation';

// L'ancienne ébauche de facturation (factures_suivi) a été masquée de l'interface le 2026-10-05 :
// elle n'a pas de mentions légales et ne doit plus servir à de vraies factures. Ces tests ne
// vérifient pas un rendu (pas de DOM ici, la preuve en navigateur est dans la PR) : ils
// empêchent que le masquage soit défait sans que personne le décide.

const racineSrc = fileURLToPath(new URL('..', import.meta.url));
const lire = (relatif: string) => readFileSync(join(racineSrc, relatif), 'utf-8');

function fichiersSource(dossier: string): string[] {
  return readdirSync(dossier).flatMap(nom => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersSource(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
  });
}

describe('Ancienne ébauche de facturation : masquée', () => {
  it("l'interrupteur est coupé", () => {
    expect(EBAUCHE_FACTURATION_VISIBLE).toBe(false);
  });

  it('la section « Factures à envoyer » de la page Stats est derrière l\'interrupteur', () => {
    const src = lire('pages/StatsPage.tsx');
    expect(src).toContain("from '../lib/featuresFacturation'");
    // Chaque montage de <SectionFactures …/> (hors sa définition) doit suivre le garde.
    const montages = [...src.matchAll(/<SectionFactures\b/g)];
    expect(montages).toHaveLength(1);
    expect(src).toMatch(/\{EBAUCHE_FACTURATION_VISIBLE && \(\s*<SectionFactures\b/);
  });

  it('la carte « Facturation » de la fiche structure est derrière l\'interrupteur', () => {
    const src = lire('pages/StructureDetail.tsx');
    expect(src).toContain("from '../lib/featuresFacturation'");
    const garde = src.indexOf('{EBAUCHE_FACTURATION_VISIBLE && (');
    const generer = src.indexOf('onClick={() => genererFactureMois(');
    const colonneDroite = src.indexOf('{/* Colonne droite */}');
    expect(garde).toBeGreaterThan(-1);
    // Le bouton « Générer » est dans le bloc gardé : après le garde, avant la colonne suivante.
    expect(generer).toBeGreaterThan(garde);
    expect(generer).toBeLessThan(colonneDroite);
    // Et les PDF / e-mails de facture ne sont déclenchés que depuis ce même bloc.
    for (const appel of ['onClick={() => genererPDFFacture(', 'envoyerRappelEmail(f)']) {
      for (const m of src.matchAll(new RegExp(appel.replace(/[()[\]{}.*+?^$|\\]/g, '\\$&'), 'g'))) {
        expect(m.index!).toBeGreaterThan(garde);
        expect(m.index!).toBeLessThan(colonneDroite);
      }
    }
  });

  it("aucun autre écran n'utilise le hook de l'ébauche (pas de nouveau point d'entrée silencieux)", () => {
    const utilisateurs = fichiersSource(racineSrc)
      .filter(f => /from '(\.\.?\/)+hooks\/useFactures'/.test(readFileSync(f, 'utf-8')))
      .map(f => f.slice(racineSrc.length))
      .sort();
    // StatsPage et StructureDetail : les deux points d'entrée, tous deux protégés ci-dessus.
    // Tout autre fichier doit être ajouté ici EN MÊME TEMPS qu'une protection équivalente.
    expect(utilisateurs).toEqual(['pages/StatsPage.tsx', 'pages/StructureDetail.tsx']);
  });
});
