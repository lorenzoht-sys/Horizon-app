import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { utilisateurCourant } from '../lib/session';
import {
  compterBeneficiaires,
  compterBilans,
  compterCoursCollectifs,
  compterProgrammes,
  compterSeances,
  ecrireEtatGuide,
  lireDernierBeneficiaireActif,
  lireEtatGuide,
  lireProfilDemarrage,
} from '../lib/acces/demarrage';
import { lireProfil, profilFacturationManquant } from '../lib/facturesAValider';
import {
  calculerEtapes,
  doitAfficherGuide,
  enPremiersPas,
  etapesNouvellementFaites,
  fusionnerEtats,
  lireEtatDemarrage,
  progression as calculerProgression,
  type CompteursDemarrage,
  type EtatDemarrage,
  type IdEtape,
} from '../lib/demarrage';
import { abonnerInstallation, applicationInstalleeIci } from '../lib/installationPwa';

// Guide de démarrage du praticien connecté (voir src/lib/demarrage.ts).
//
// L'état du guide (fermé, rouvert, application installée) vit dans
// praticiens.demarrage, avec une copie locale : filet si la base ne répond pas
// (hors ligne, ou migration 20261119100000 absente, ce qui ne doit pas arriver :
// elle précède le code). Les étapes, elles, sont recalculées à chaque affichage et au
// retour sur l'onglet : on ne les stocke jamais.

interface Donnees {
  praticienId: string;
  compteurs: CompteursDemarrage;
  profilFacturationComplet: boolean;
  manquesFacturation: string[];
  compteCreeLe: string | null;
  dernierBeneficiaireId: string | null;
  etatBase: EtatDemarrage | null;
}

const cleLocale = (id: string) => `horizon:demarrage:${id}`;
// Étapes déjà constatées faites, pour ne féliciter qu'une fois. Par appareil :
// au pire, une même étape est félicitée une fois sur l'ordinateur et une fois
// sur le téléphone, ce qui reste juste.
const cleVues = (id: string) => `horizon:demarrage:vues:${id}`;

function lireVues(id: string): IdEtape[] | null {
  try {
    const brut: unknown = JSON.parse(localStorage.getItem(cleVues(id)) ?? 'null');
    return Array.isArray(brut) ? brut.filter((v): v is IdEtape => typeof v === 'string') : null;
  } catch {
    return null;
  }
}

function ecrireVues(id: string, vues: IdEtape[]) {
  try { localStorage.setItem(cleVues(id), JSON.stringify(vues)); } catch { /* sans conséquence */ }
}

export interface Bravo {
  nouvelles: IdEtape[];
  /** Nombre d'étapes faites avant : l'anneau part de là pour avancer sous les yeux. */
  faitesAvant: number;
}

function lireLocal(id: string): EtatDemarrage {
  try {
    return lireEtatDemarrage(JSON.parse(localStorage.getItem(cleLocale(id)) ?? 'null'));
  } catch {
    return {};
  }
}

function ecrireLocal(id: string, etat: EtatDemarrage) {
  try {
    localStorage.setItem(cleLocale(id), JSON.stringify(etat));
  } catch {
    // Navigation privée, quota : l'état base suffit.
  }
}

async function charger(): Promise<Donnees | null> {
  if (!supabase) return null;
  const user = await utilisateurCourant();
  if (!user) return null;
  const id = user.id;

  const [benef, bilans, seances, cours, programmes, dernier, profil, guide] = await Promise.all([
    compterBeneficiaires(id),
    compterBilans(id),
    compterSeances(id),
    compterCoursCollectifs(id),
    compterProgrammes(id),
    lireDernierBeneficiaireActif(id),
    lireProfilDemarrage(id),
    lireEtatGuide(id),
  ]);

  // Une étape ne doit jamais s'afficher « à faire » parce qu'une requête a échoué :
  // sans comptages fiables, pas de guide du tout.
  const erreur = [benef, bilans, seances, cours, programmes, profil].find(r => r.error)?.error;
  if (erreur) {
    console.error('[useDemarrage] chargement :', erreur.message);
    return null;
  }

  const ligneProfil = (profil.data as Record<string, unknown> | null) ?? null;
  const manquesFacturation = profilFacturationManquant(lireProfil(ligneProfil));
  return {
    praticienId: id,
    compteurs: {
      beneficiaires: benef.count ?? 0,
      bilans: bilans.count ?? 0,
      seances: (seances.count ?? 0) + (cours.count ?? 0),
      programmes: programmes.count ?? 0,
    },
    profilFacturationComplet: manquesFacturation.length === 0,
    manquesFacturation,
    compteCreeLe: typeof ligneProfil?.created_at === 'string' ? ligneProfil.created_at : null,
    dernierBeneficiaireId: (dernier.data as { id?: string } | null)?.id ?? null,
    // Colonne absente (migration pas encore appliquée) : on s'en remet à la copie locale.
    etatBase: guide.error ? null : lireEtatDemarrage((guide.data as { demarrage?: unknown } | null)?.demarrage),
  };
}

export function useDemarrage() {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [chargement, setChargement] = useState(true);
  const [etatLocal, setEtatLocal] = useState<EtatDemarrage>({});
  const [installeeIci, setInstalleeIci] = useState(applicationInstalleeIci);
  const [bravo, setBravo] = useState<Bravo | null>(null);
  const enCours = useRef(false);

  const rafraichir = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    try {
      const d = await charger();
      if (d) {
        const local = lireLocal(d.praticienId);
        setEtatLocal(local);
        setDonnees(d);
        const faites = calculerEtapes({
          compteurs: d.compteurs,
          profilFacturationComplet: d.profilFacturationComplet,
          applicationInstallee: applicationInstalleeIci() || Boolean(fusionnerEtats(d.etatBase, local).applicationInstallee),
        }).filter(e => e.faite).map(e => e.id);
        const vues = lireVues(d.praticienId);
        ecrireVues(d.praticienId, faites);
        const nouvelles = etapesNouvellementFaites(vues, faites);
        if (nouvelles.length > 0) setBravo({ nouvelles, faitesAvant: faites.length - nouvelles.length });
        // Lancée depuis l'écran d'accueil : on le retient pour les autres appareils
        // (le poste de bureau ne peut pas le constater lui-même).
        const etat = fusionnerEtats(d.etatBase, local);
        if (applicationInstalleeIci() && !etat.applicationInstallee) {
          const suivant = { ...etat, applicationInstallee: true };
          ecrireLocal(d.praticienId, suivant);
          setEtatLocal(suivant);
          const { error } = await ecrireEtatGuide(d.praticienId, suivant);
          if (!error) setDonnees({ ...d, etatBase: suivant });
        }
      } else {
        setDonnees(null);
      }
    } finally {
      enCours.current = false;
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void rafraichir();
    // Le praticien revient d'un autre onglet ou de son téléphone : l'étape
    // qu'il vient de faire doit apparaître cochée sans recharger la page.
    const auRetour = () => { if (document.visibilityState === 'visible') void rafraichir(); };
    document.addEventListener('visibilitychange', auRetour);
    const desabonner = abonnerInstallation(() => {
      setInstalleeIci(applicationInstalleeIci());
      void rafraichir();
    });
    return () => {
      document.removeEventListener('visibilitychange', auRetour);
      desabonner();
    };
  }, [rafraichir]);

  const etat = useMemo(
    () => fusionnerEtats(donnees?.etatBase ?? null, etatLocal),
    [donnees?.etatBase, etatLocal],
  );

  const enregistrer = useCallback(async (modif: Partial<EtatDemarrage>) => {
    if (!donnees) return;
    const suivant = lireEtatDemarrage({ ...etat, ...modif });
    // Optimiste : l'interface suit tout de suite, la base suit derrière.
    setEtatLocal(suivant);
    ecrireLocal(donnees.praticienId, suivant);
    setDonnees(d => (d && d.etatBase ? { ...d, etatBase: suivant } : d));
    const { error } = await ecrireEtatGuide(donnees.praticienId, suivant);
    if (error) console.warn('[useDemarrage] état gardé localement :', error.message);
  }, [donnees, etat]);

  const etapes = useMemo(() => donnees && calculerEtapes({
    compteurs: donnees.compteurs,
    profilFacturationComplet: donnees.profilFacturationComplet,
    applicationInstallee: installeeIci || Boolean(etat.applicationInstallee),
  }), [donnees, installeeIci, etat.applicationInstallee]);

  const progression = useMemo(() => etapes && calculerProgression(etapes), [etapes]);

  const visible = Boolean(progression) && doitAfficherGuide({
    etat,
    termine: Boolean(progression?.termine),
    compteCreeLe: donnees?.compteCreeLe ?? null,
    maintenant: new Date(),
  });

  const premiersPas = enPremiersPas({
    visible,
    termine: Boolean(progression?.termine),
    bilans: donnees?.compteurs.bilans ?? 0,
  });

  return {
    chargement,
    visible,
    premiersPas,
    etapes,
    progression,
    dernierBeneficiaireId: donnees?.dernierBeneficiaireId ?? null,
    bravo,
    rafraichir,
    manquesFacturation: donnees?.manquesFacturation ?? [],
    masquer: () => enregistrer({ masque: true, reaffiche: false }),
    reafficher: () => enregistrer({ masque: false, reaffiche: true }),
    declarerApplicationInstallee: () => enregistrer({ applicationInstallee: true }),
  };
}
