import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, MapPin } from 'lucide-react';
import { useParticipants } from '../../../hooks/useParticipants';
import { useAgenda } from '../../../hooks/useAgenda';
import { useContrats } from '../../../hooks/useContrats';
import { useCoursCollectifs } from '../../../hooks/useCoursCollectifs';
import { useCategoriesSeance } from '../../../hooks/useCategoriesSeance';
import { useFacturesAValider, useFacturesValidees } from '../../../hooks/useFacturesAValider';
import ModalPresenceCoursCollectif from '../../../components/agenda/ModalPresenceCoursCollectif';
import { Pastille, type TonPastille } from '../../../components/ui/Carte';
import type { CoursCollectif, Participant, Seance } from '../../../types';
import { LABEL_TYPE } from '../../../lib/agendaCommun';
import { getContreIndications } from '../../../lib/anamnese';
import { URLS_MOBILE } from '../../../lib/routesMobile';
import { contratsDesBeneficiairesActifs } from '../../../lib/archivage';
import { chargerRetoursParBeneficiaire, ressentisPreoccupants } from '../../../lib/suiviBeneficiaire';
import { dateCivileParis, separerBrouillons } from '../../../lib/facturesAValider';
import { niveauBienEtre, niveauEffort } from '../../../lib/ressentiCours';
import {
  astuceDuJour, contexteBeneficiaire, delaiRendezVous, echeanceBilan, libelleRendezVous, phraseDuJour,
  prochainRendezVous, progresDepuisInitial, resumeFactures, type EtatEcheance,
} from '../../../lib/tableauDeBord';
import { formatDateCourt, usePraticienSettings } from './communs';
import { GuideDemarrage } from '../../../components/demarrage/GuideDemarrage';
import { seancePrincipale, seancesAConfirmer } from '../../../lib/accueilSeances';

export function ouvrirMaps(adresse: string) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`, '_blank');
}

// Accueil mobile V1 (maquette validée par Lorenzo le 23/11/2026) : même ordre et mêmes mots que
// le tableau de bord sur ordinateur, en une colonne. Prochain rendez-vous (avec l'objectif de la
// personne), séances à confirmer, la journée, bilans, factures, une bonne nouvelle, une astuce.
// Avant : en-tête sombre, tuiles de chiffres, bandeau jaune replié pour les séances à confirmer.
//
// La barre du bas vit dans components/layout/BarreNavigationMobile.tsx : elle est partagée avec
// le cadre commun, qui la montre sous 768 px sur les écrans fusionnés (la fiche bénéficiaire).

const AVATAR_COLORS = ['#2BB89A', '#1D9E9E', '#7D3C98', '#E67E22', '#C2187A', '#1A7F5A'];
const ENCRE = 'var(--color-ink)';
const AIDE = 'var(--color-ink-2)';
const SECONDAIRE = '#3D4C5A';
const VERT_ACTION = '#1A9A7F';
const VERT_TEXTE = '#147A64';
const CARTE: React.CSSProperties = { background: 'white', border: '1px solid #E2EEEE', borderRadius: 20, padding: 16 };
const A_CONFIRMER_VISIBLES = 4;

// Astuces écartées : même clé que sur ordinateur (Dashboard.tsx), propre au navigateur.
const CLE_ASTUCES = 'horizon.astucesEcartees';
function lireAstucesEcartees(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CLE_ASTUCES) ?? '[]') as string[]); } catch { return new Set(); }
}

function dateDuJour(d: Date): string {
  const texte = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

function Titre({ id, children, droite }: { id: string; children: React.ReactNode; droite?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3 mb-1">
      <h2 id={id} className="m-0 font-extrabold" style={{ fontSize: 16, color: ENCRE }}>{children}</h2>
      {droite}
    </div>
  );
}

const TON_ECHEANCE: Record<EtatEcheance, TonPastille> = { retard: 'rouge', initial: 'orange', bientot: 'orange', a_jour: 'neutre' };

export function EcranAujourdhui({ onVoirFiche }: { onVoirFiche: (id: string) => void; onNaviguerSaisie?: () => void }) {
  // `participants` (tous) sert aux recherches par identifiant ; les listes du quotidien
  // n'utilisent que les actifs — un archivé n'est plus suivi.
  const { participants, participantsActifs } = useParticipants();
  const { seances: allSeances, seancesDuJour, modifierSeance } = useAgenda();
  const { contratsARenouveler: contratsARenouvelerTous } = useContrats();
  const contratsARenouveler = contratsDesBeneficiairesActifs(contratsARenouvelerTous, participants);
  const { settings: praticienSettings } = usePraticienSettings();
  const { coursCollectifs, participationsDuCours, modifierStatutCours, modifierCours, mettreAJourParticipation } = useCoursCollectifs();
  const { categories } = useCategoriesSeance();
  // Factures : lecture seule, pour la ligne « Factures ».
  const { brouillons: brouillonsFactures } = useFacturesAValider();
  const { factures } = useFacturesValidees();
  const navigate = useNavigate();

  const [coursSelectionneId, setCoursSelectionneId] = useState<string | null>(null);
  // Séances écartées à la main (« Passer à la suivante ») : le temps de la session seulement,
  // rien n'est écrit en base. Règles de choix : src/lib/accueilSeances.ts.
  const [ecartees, setEcartees] = useState<ReadonlySet<string>>(new Set());
  const [validationEnCours, setValidationEnCours] = useState<string | null>(null);
  const [toutesAConfirmer, setToutesAConfirmer] = useState(false);
  const [retours, setRetours] = useState<Record<string, { borgRpe: number; bienEtre: number }[]>>({});
  const retoursCharges = useRef(false);
  const [astucesEcartees, setAstucesEcartees] = useState<Set<string>>(lireAstucesEcartees);

  useEffect(() => {
    if (participantsActifs.length === 0 || retoursCharges.current) return;
    retoursCharges.current = true;
    void chargerRetoursParBeneficiaire(participantsActifs.map(p => p.id)).then(setRetours);
  }, [participantsActifs]);

  const maintenant = new Date();
  const today = dateCivileParis(maintenant);
  const currentTimeStr = `${String(maintenant.getHours()).padStart(2, '0')}:${String(maintenant.getMinutes()).padStart(2, '0')}`;
  const actifs = new Set(participantsActifs.map(p => p.id));
  const seances = seancesDuJour(today);
  const nbRealisees = seances.filter(s => s.statut === 'realisee').length;
  const categorieDe = (sc: Seance) => categories.find(c => c.id === sc.categorieId);
  const nomDe = (p: Participant | undefined) => (p ? `${p.prenom} ${p.nom}` : 'Bénéficiaire');

  const principale = seancePrincipale(seances, currentTimeStr, ecartees);
  const suivanteExiste = principale !== null
    && seancePrincipale(seances, currentTimeStr, new Set([...ecartees, principale.id])) !== null;
  // Plus rien aujourd'hui : on annonce le prochain rendez-vous des jours suivants.
  const plusTard = principale ? null : prochainRendezVous(allSeances.filter(s => actifs.has(s.participantId)), today, currentTimeStr);
  const rdv = principale ?? plusTard;
  const aConfirmer = seancesAConfirmer(allSeances, today, currentTimeStr)
    .filter(s => actifs.has(s.participantId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.heureDebut.localeCompare(a.heureDebut));

  const coursDuJour = coursCollectifs
    .filter(c => c.date === today && c.statut !== 'annule')
    .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  const coursSelectionne = coursCollectifs.find(c => c.id === coursSelectionneId) ?? null;

  // Bilans : d'abord ceux déjà planifiés (date dans l'agenda), puis ceux à prévoir (85 jours, même
  // règle que l'ordinateur ; l'accueil comptait jusqu'ici 90 jours).
  const bilansPlanifies = allSeances
    .filter(sc => sc.type !== 'seance' && sc.statut === 'planifiee' && sc.date > today && actifs.has(sc.participantId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut))
    .slice(0, 3);
  const dejaPlanifies = new Set(bilansPlanifies.map(b => b.participantId));
  const bilansAPrevoir = participantsActifs
    .filter(p => !dejaPlanifies.has(p.id))
    .map(p => ({ p, e: echeanceBilan(p.bilans, today) }))
    .filter(x => x.e.etat === 'retard' || x.e.etat === 'initial')
    .slice(0, 2);

  const resume = resumeFactures(separerBrouillons(brouillonsFactures, today).validables.length, factures);
  const detailFactures = [
    resume.aValider > 0 && `${resume.aValider} à valider`,
    resume.enRetard > 0 && `${resume.enRetard} en retard de paiement`,
    resume.nonReglees > 0 && `${resume.nonReglees} pas encore réglée${resume.nonReglees > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');

  const bonneNouvelle = participantsActifs
    .map(p => ({ p, g: progresDepuisInitial(p.bilans) }))
    .find(x => x.g !== null);
  const astuce = astuceDuJour(today, astucesEcartees);
  const ressentis = participantsActifs.filter(p => ressentisPreoccupants(retours[p.id] ?? []));

  async function cloturer(seance: Seance, statut: 'realisee' | 'annulee') {
    setValidationEnCours(seance.id);
    const ok = await modifierSeance(seance.id, { statut });
    setValidationEnCours(null);
    if (ok) toast.success(statut === 'realisee' ? 'Séance marquée comme réalisée' : 'Séance marquée comme annulée');
    else toast.error('La séance n’a pas pu être enregistrée. Réessayez dans un instant.');
  }

  function ecarterAstuce(cle: string) {
    const suivantes = new Set(astucesEcartees).add(cle);
    setAstucesEcartees(suivantes);
    try { localStorage.setItem(CLE_ASTUCES, JSON.stringify([...suivantes])); } catch { /* stockage indisponible */ }
  }

  // Timeline du jour : séances individuelles et cours collectifs mêlés, triés par heure.
  type ItemJour =
    | { kind: 'seance'; heureDebut: string; seance: Seance }
    | { kind: 'cours'; heureDebut: string; cours: CoursCollectif; nbInscrits: number };
  const itemsJour: ItemJour[] = [
    ...seances.map(seance => ({ kind: 'seance' as const, heureDebut: seance.heureDebut, seance })),
    ...coursDuJour.map(cours => ({ kind: 'cours' as const, heureDebut: cours.heureDebut, cours, nbInscrits: participationsDuCours(cours.id).length })),
  ].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

  const prenom = praticienSettings.prenom?.trim();
  const phrase = phraseDuJour({
    nbRendezVous: seances.length + coursDuJour.length,
    prochainDans: principale && principale.heureDebut.slice(0, 5) > currentTimeStr ? delaiRendezVous(principale, today, currentTimeStr) : null,
    nbAConfirmer: aConfirmer.length,
    nbBilansAujourdhui: seances.filter(s => s.type !== 'seance' && s.statut === 'planifiee' && s.heureDebut.slice(0, 5) > currentTimeStr).length,
  });

  return (
    <div style={{ minHeight: '100vh', background: '#EEF4F7' }}>
      <div className="flex flex-col gap-4" style={{ padding: 'calc(env(safe-area-inset-top, 20px) + 18px) 16px 24px' }}>

        {/* ── EN-TÊTE ─────────────────────────────────────────────── */}
        <header>
          {/* Majuscule écrite dans le texte, pas en CSS : l'e2e mobile 30 repère le libellé du jour
              de l'agenda par un texte qui commence par « lundi », « mardi »… en minuscule. */}
          <p className="m-0 text-[13px] font-bold" style={{ color: VERT_TEXTE }}>{dateDuJour(maintenant)}</p>
          <h1 className="m-0 mt-0.5 font-extrabold" style={{ fontSize: 26, color: ENCRE }}>
            {prenom ? `Bonjour ${prenom}` : 'Bonjour et bienvenue'}
          </h1>
          <p className="m-0 mt-1.5 text-sm leading-relaxed" style={{ color: SECONDAIRE }}>{phrase}</p>
          {seances.length > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: AIDE }}>
                <span>Séances du jour</span><span>{nbRealisees} faite{nbRealisees !== 1 ? 's' : ''} sur {seances.length}</span>
              </div>
              <div role="progressbar" aria-valuemin={0} aria-valuemax={seances.length} aria-valuenow={nbRealisees} aria-label="Séances du jour réalisées"
                className="h-1.5 rounded-full overflow-hidden" style={{ background: '#DCE8EC' }}>
                <div className="h-full rounded-full transition-[width]" style={{ width: `${(nbRealisees / seances.length) * 100}%`, background: VERT_ACTION }} />
              </div>
            </div>
          )}
        </header>

        {/* ── PRISE EN MAIN (tant qu'il reste une étape) ─────────── */}
        <GuideDemarrage mobile />

        {/* ── PROCHAIN RENDEZ-VOUS ────────────────────────────────── */}
        {rdv && (() => {
          const p = participants.find(x => x.id === rdv.participantId);
          const ciInfo = p ? getContreIndications(p) : { actif: false, detail: null };
          const adresse = [p?.adresseRue, p?.adresseVille].filter(Boolean).join(', ');
          const cat = categorieDe(rdv);
          const contexte = contexteBeneficiaire(p?.bilans ?? []);
          const dernier = p ? retours[p.id]?.[0] : undefined;
          const bienEtre = dernier ? niveauBienEtre(dernier.bienEtre) : null;
          const effort = dernier ? niveauEffort(dernier.borgRpe) : null;
          const enCours = !!principale && rdv.heureDebut.slice(0, 5) <= currentTimeStr;
          return (
            <section aria-labelledby="m-prochain" className="flex flex-col gap-3" style={{ background: '#E3F4EF', border: '1px solid #C6E8DE', borderRadius: 20, padding: 16 }}>
              <div className="flex justify-between items-center gap-2">
                <h2 id="m-prochain" className="m-0 text-[13px] font-extrabold" style={{ color: VERT_TEXTE }}>
                  {enCours ? 'Séance en cours' : 'Votre prochain rendez-vous'}
                </h2>
                {!enCours && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white" style={{ color: VERT_TEXTE }}>
                    {delaiRendezVous(rdv, today, currentTimeStr)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="w-[46px] h-[46px] rounded-full text-white text-base font-extrabold flex items-center justify-center flex-shrink-0"
                  style={{ background: cat?.couleur ?? AVATAR_COLORS[(p?.id.charCodeAt(0) ?? 0) % AVATAR_COLORS.length] }}>
                  {p ? `${p.prenom[0] ?? ''}${p.nom[0] ?? ''}`.toUpperCase() : '?'}
                </span>
                <div className="min-w-0">
                  <div className="text-lg font-extrabold truncate" style={{ color: ENCRE }}>{nomDe(p)}</div>
                  <div className="text-[13px]" style={{ color: SECONDAIRE }}>
                    {libelleRendezVous(rdv, today)} · {cat?.nom ?? LABEL_TYPE[rdv.type]} · {rdv.dureeMinutes} min
                  </div>
                </div>
              </div>

              {(rdv.objectif || contexte.objectif || contexte.vigilance || bienEtre || effort) && (
                <div className="bg-white rounded-[14px] px-3 py-2.5 text-[13px] flex flex-col gap-1.5" style={{ color: ENCRE }}>
                  {rdv.objectif && <div><strong style={{ color: VERT_TEXTE }}>Objectif de la séance</strong> · {rdv.objectif}</div>}
                  {contexte.objectif && <div><strong style={{ color: VERT_TEXTE }}>Son objectif</strong> · « {contexte.objectif} »</div>}
                  {contexte.vigilance && <div><strong style={{ color: '#8A5300' }}>À garder en tête</strong> · {contexte.vigilance}</div>}
                  {(bienEtre || effort) && (
                    <div><strong style={{ color: SECONDAIRE }}>La dernière fois</strong> · {[bienEtre && `se sentait « ${bienEtre.label.toLowerCase()} »`, effort && `effort « ${effort.label.toLowerCase()} »`].filter(Boolean).join(', ')}</div>
                  )}
                </div>
              )}

              {ciInfo.actif && ciInfo.detail && (
                <div className="rounded-[12px] px-3 py-2 text-xs font-semibold" style={{ background: '#FEF0EF', color: '#B42318' }}>
                  Contre-indication : {ciInfo.detail}
                </div>
              )}

              {adresse && (
                <p className="m-0 flex items-center gap-1.5 text-[13px]" style={{ color: SECONDAIRE }}>
                  <MapPin size={14} aria-hidden="true" style={{ color: VERT_TEXTE }} /> {adresse}
                </p>
              )}

              {/* Seulement une fois la séance commencée : avant, le bouton invitait à valider une
                  séance qui n'avait pas encore eu lieu. */}
              {principale && enCours && (
                <button type="button" onClick={() => cloturer(principale, 'realisee')} disabled={validationEnCours === principale.id}
                  className="w-full h-12 rounded-[12px] text-[15px] font-extrabold text-white disabled:opacity-60" style={{ background: VERT_ACTION }}>
                  ✓ Marquer comme réalisée
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => p && onVoirFiche(p.id)} className="h-12 rounded-[12px] bg-white text-sm font-bold" style={{ border: '1.5px solid #B5DDD2', color: ENCRE }}>
                  Préparer
                </button>
                {adresse ? (
                  <button type="button" onClick={() => ouvrirMaps(adresse)} className="h-12 rounded-[12px] bg-white text-sm font-bold" style={{ border: '1.5px solid #B5DDD2', color: ENCRE }}>
                    Itinéraire
                  </button>
                ) : (
                  <button type="button" onClick={() => navigate(URLS_MOBILE.agendaJour(rdv.date))} className="h-12 rounded-[12px] bg-white text-sm font-bold" style={{ border: '1.5px solid #B5DDD2', color: ENCRE }}>
                    Agenda
                  </button>
                )}
              </div>
              {principale && (
                <div className="flex justify-between gap-2">
                  <button type="button" onClick={() => navigate(URLS_MOBILE.agendaJour(principale.date))} className="h-11 text-[13px] font-bold" style={{ color: SECONDAIRE }}>
                    Modifier ou annuler
                  </button>
                  {suivanteExiste && (
                    <button type="button" onClick={() => setEcartees(prev => new Set([...prev, principale.id]))} className="h-11 text-[13px] font-bold" style={{ color: VERT_TEXTE }}>
                      Passer à la suivante →
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })()}

        {/* ── SÉANCES À CONFIRMER ─────────────────────────────────── */}
        {aConfirmer.length > 0 && (
          <section aria-labelledby="m-confirmer" style={CARTE} className="flex flex-col gap-2.5">
            <Titre id="m-confirmer" droite={<Pastille ton="orange">{aConfirmer.length}</Pastille>}>À confirmer</Titre>
            <p className="m-0 text-[13px]" style={{ color: AIDE }}>Un geste par séance, et votre facture du mois est juste.</p>
            {(toutesAConfirmer ? aConfirmer : aConfirmer.slice(0, A_CONFIRMER_VISIBLES)).map(sc => {
              const p = participants.find(x => x.id === sc.participantId);
              const occupe = validationEnCours === sc.id;
              const quand = `${formatDateCourt(sc.date)} · ${sc.heureDebut.slice(0, 5)}`;
              return (
                <div key={sc.id} className="flex flex-col gap-2 pt-2.5" style={{ borderTop: '1px solid #EEF4F4' }}>
                  <div>
                    <div className="text-sm font-bold" style={{ color: ENCRE }}>{nomDe(p)}</div>
                    <div className="text-xs" style={{ color: AIDE }}>{quand} · {LABEL_TYPE[sc.type]}</div>
                    {sc.absenceSignaleeLe && <div className="text-xs font-semibold mt-0.5" style={{ color: '#8A5300' }}>Absence signalée par le bénéficiaire</div>}
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => cloturer(sc, 'realisee')} disabled={occupe}
                      aria-label={`Marquer comme réalisée : ${nomDe(p)}, ${quand}`}
                      className="flex-1 h-12 rounded-[12px] text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: '#E6F5F1', color: VERT_TEXTE }}>
                      <Check size={16} aria-hidden="true" /> Marquer comme réalisée
                    </button>
                    <button type="button" onClick={() => cloturer(sc, 'annulee')} disabled={occupe}
                      aria-label={`Annulée : ${nomDe(p)}, ${quand}`}
                      className="h-12 px-3 rounded-[12px] bg-white text-[13px] font-bold disabled:opacity-60" style={{ border: '1px solid #E2EEEE', color: SECONDAIRE }}>
                      Annulée
                    </button>
                  </div>
                </div>
              );
            })}
            {aConfirmer.length > A_CONFIRMER_VISIBLES && (
              <button type="button" onClick={() => setToutesAConfirmer(t => !t)} className="h-11 text-[13px] font-bold self-start" style={{ color: VERT_TEXTE }}>
                {toutesAConfirmer ? 'Réduire' : `Voir les ${aConfirmer.length - A_CONFIRMER_VISIBLES} autres`}
              </button>
            )}
          </section>
        )}

        {/* ── AUJOURD'HUI ─────────────────────────────────────────── */}
        <section aria-labelledby="m-jour" style={CARTE}>
          <Titre id="m-jour" droite={
            <button type="button" onClick={() => navigate(URLS_MOBILE.agenda)} className="h-11 text-[13px] font-bold" style={{ color: VERT_TEXTE }}>Agenda →</button>
          }>Aujourd’hui</Titre>
          {itemsJour.length === 0 ? (
            <p className="m-0 py-3 text-sm" style={{ color: SECONDAIRE }}>Aucune séance aujourd’hui : un bon moment pour préparer les bilans de la semaine.</p>
          ) : (
            <ul className="list-none m-0 p-0">
              {itemsJour.map((item, i) => {
                const bord = { borderTop: i === 0 ? 'none' : '1px solid #EEF4F4' };
                if (item.kind === 'cours') {
                  const { cours, nbInscrits } = item;
                  return (
                    <li key={`cours-${cours.id}`} style={bord}>
                      <button type="button" onClick={() => setCoursSelectionneId(cours.id)} className="w-full flex items-center gap-2.5 py-2.5 text-left">
                        <span className="w-[46px] text-sm font-extrabold" style={{ color: ENCRE }}>{cours.heureDebut.slice(0, 5)}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold truncate" style={{ color: ENCRE }}>{cours.titre}</span>
                          <span className="block text-xs" style={{ color: AIDE }}>Cours collectif · {nbInscrits} inscrit{nbInscrits !== 1 ? 's' : ''}</span>
                        </span>
                        <ChevronRight size={16} aria-hidden="true" style={{ color: AIDE }} />
                      </button>
                    </li>
                  );
                }
                const s = item.seance;
                const p = participants.find(x => x.id === s.participantId);
                const cat = categorieDe(s);
                const faite = s.statut === 'realisee';
                const passee = !faite && s.heureFin.slice(0, 5) <= currentTimeStr;
                const enCours = !faite && !passee && s.heureDebut.slice(0, 5) <= currentTimeStr;
                const estProchaine = !faite && !passee && !enCours && principale?.id === s.id;
                const [ton, libelle]: [TonPastille, string] = faite ? ['vert', 'Réalisée'] : passee ? ['orange', 'À confirmer'] : enCours ? ['plein', 'En cours'] : estProchaine ? ['plein', 'Prochaine'] : ['neutre', 'À venir'];
                return (
                  <li key={s.id} style={bord}>
                    <button type="button" onClick={() => p && onVoirFiche(p.id)} className="w-full flex items-center gap-2.5 py-2.5 text-left">
                      <span className="w-[46px] text-sm font-extrabold" style={{ color: estProchaine || enCours ? VERT_ACTION : faite || passee ? AIDE : ENCRE }}>{s.heureDebut.slice(0, 5)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold truncate" style={{ color: ENCRE }}>{nomDe(p)}</span>
                        <span className="block text-xs truncate" style={{ color: AIDE }}>{[cat?.nom ?? LABEL_TYPE[s.type], p?.adresseVille].filter(Boolean).join(' · ')}</span>
                      </span>
                      <Pastille ton={ton}>{libelle}</Pastille>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── BILANS ──────────────────────────────────────────────── */}
        {(bilansPlanifies.length > 0 || bilansAPrevoir.length > 0) && (
          <section aria-labelledby="m-bilans" style={CARTE}>
            <Titre id="m-bilans">Bilans à prévoir</Titre>
            <ul className="list-none m-0 p-0">
              {bilansPlanifies.map((b, i) => {
                const p = participants.find(x => x.id === b.participantId);
                return (
                  <li key={b.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #EEF4F4' }}>
                    <button type="button" onClick={() => navigate(URLS_MOBILE.agendaJour(b.date))} className="w-full flex items-center gap-2.5 py-2.5 text-left">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold truncate" style={{ color: ENCRE }}>{nomDe(p)}</span>
                        <span className="block text-xs" style={{ color: AIDE }}>{LABEL_TYPE[b.type]} planifié</span>
                      </span>
                      <Pastille ton="neutre">{libelleRendezVous(b, today)}</Pastille>
                    </button>
                  </li>
                );
              })}
              {bilansAPrevoir.map(({ p, e }, i) => (
                <li key={p.id} style={{ borderTop: i === 0 && bilansPlanifies.length === 0 ? 'none' : '1px solid #EEF4F4' }}>
                  <button type="button" onClick={() => onVoirFiche(p.id)} className="w-full flex items-center gap-2.5 py-2.5 text-left">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold truncate" style={{ color: ENCRE }}>{nomDe(p)}</span>
                      <span className="block text-xs" style={{ color: AIDE }}>{e.etat === 'initial' ? 'Bilan initial' : 'Pas encore planifié'}</span>
                    </span>
                    <Pastille ton={TON_ECHEANCE[e.etat]}>{e.etat === 'initial' ? 'À faire' : e.libelle}</Pastille>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── FACTURES (lecture seule) ────────────────────────────── */}
        {detailFactures && (
          <button type="button" onClick={() => navigate(resume.aValider > 0 ? '/factures/a-valider' : '/factures')}
            className="flex items-center gap-3 text-left" style={{ ...CARTE, padding: '14px 16px' }}>
            <span className="flex-1">
              <span className="block font-extrabold" style={{ fontSize: 16, color: ENCRE }}>Factures</span>
              <span className="block text-[13px]" style={{ color: SECONDAIRE }}>{detailFactures}</span>
            </span>
            <ChevronRight size={18} aria-hidden="true" style={{ color: AIDE }} />
          </button>
        )}

        {/* ── À SURVEILLER ────────────────────────────────────────── */}
        {(ressentis.length > 0 || contratsARenouveler.length > 0) && (
          <section aria-labelledby="m-surveiller" style={CARTE} className="flex flex-col gap-1">
            <Titre id="m-surveiller">À surveiller</Titre>
            {ressentis.map(p => (
              <button key={p.id} type="button" onClick={() => onVoirFiche(p.id)} className="min-h-11 flex items-center gap-2 text-left text-[13px]" style={{ color: ENCRE }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#E8544A' }} aria-hidden="true" />
                {p.prenom} {p.nom} : 3 séances difficiles de suite (effort ou fatigue). Prendre des nouvelles ?
              </button>
            ))}
            {contratsARenouveler.map(c => {
              const p = participants.find(x => x.id === c.participantId);
              return (
                <button key={c.id} type="button" onClick={() => p && onVoirFiche(p.id)} className="min-h-11 flex items-center gap-2 text-left text-[13px]" style={{ color: ENCRE }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#F0A429' }} aria-hidden="true" />
                  Contrat de {nomDe(p)} : se termine le {formatDateCourt(c.dateFin)}
                </button>
              );
            })}
          </section>
        )}

        {/* ── UNE BONNE NOUVELLE ──────────────────────────────────── */}
        {bonneNouvelle?.g && (
          <section aria-labelledby="m-progres" style={CARTE} className="flex flex-col gap-1.5">
            <Titre id="m-progres">Une bonne nouvelle</Titre>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[26px] font-extrabold" style={{ color: VERT_TEXTE }}>{bonneNouvelle.g.delta}</span>
              <span className="text-sm font-bold" style={{ color: ENCRE }}>{nomDe(bonneNouvelle.p)}, {bonneNouvelle.g.test}</span>
            </div>
            <p className="m-0 text-[13px]" style={{ color: SECONDAIRE }}>Depuis son bilan initial. {bonneNouvelle.g.sens} À lui dire à la prochaine séance !</p>
          </section>
        )}

        {/* ── LE SAVIEZ-VOUS ? ────────────────────────────────────── */}
        {astuce && (
          <aside aria-labelledby="m-astuce" className="flex flex-col gap-2" style={{ background: '#FFFBF2', border: '1px solid #F4E3C2', borderRadius: 20, padding: 16 }}>
            <h2 id="m-astuce" className="m-0 text-[13px] font-extrabold" style={{ color: '#8A5300' }}>Le saviez-vous ?</h2>
            <p className="m-0 text-sm leading-relaxed" style={{ color: ENCRE }}>{astuce.texte}</p>
            <button type="button" onClick={() => ecarterAstuce(astuce.cle)} className="self-start h-11 text-[13px] font-semibold" style={{ color: AIDE }}>Compris</button>
          </aside>
        )}
      </div>

      {coursSelectionne && (
        <ModalPresenceCoursCollectif
          cours={coursSelectionne}
          participations={participationsDuCours(coursSelectionne.id)}
          participants={participants}
          onMettreAJourParticipation={(participationId, patch) => mettreAJourParticipation(participationId, patch)}
          onModifierStatutCours={async statut => modifierStatutCours(coursSelectionne.id, statut)}
          onModifierCours={async patch => {
            const ok = await modifierCours(coursSelectionne.id, patch);
            if (ok) toast.success('Cours modifié');
            return ok;
          }}
          onClose={() => setCoursSelectionneId(null)}
        />
      )}
    </div>
  );
}
