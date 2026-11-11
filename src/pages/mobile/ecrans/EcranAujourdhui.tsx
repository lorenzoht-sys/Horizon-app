import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParticipants } from '../../../hooks/useParticipants';
import { useAgenda } from '../../../hooks/useAgenda';
import { useContrats } from '../../../hooks/useContrats';
import { useCoursCollectifs } from '../../../hooks/useCoursCollectifs';
import { useCategoriesSeance } from '../../../hooks/useCategoriesSeance';
import ModalPresenceCoursCollectif from '../../../components/agenda/ModalPresenceCoursCollectif';
import type { CoursCollectif, Seance } from '../../../types';
import { LABEL_TYPE } from '../../../lib/agendaCommun';
import { getContreIndications } from '../../../lib/anamnese';
import { URLS_MOBILE } from '../../../lib/routesMobile';
import { contratsDesBeneficiairesActifs } from '../../../lib/archivage';
import { C, formatDateCourt, formatDateLong, usePraticienSettings } from './communs';

export function ouvrirMaps(adresse: string) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`, '_blank');
}

// La barre du bas vit dans components/layout/BarreNavigationMobile.tsx : elle
// est partagée avec le cadre commun, qui la montre sous 768 px sur les écrans
// fusionnés (la fiche bénéficiaire).

// ── EcranAujourdhui ───────────────────────────────────────────────────────────

export function EcranAujourdhui({ onVoirFiche }: { onVoirFiche: (id: string) => void; onNaviguerSaisie?: () => void }) {
  // `participants` (tous) sert aux recherches par identifiant ; les compteurs et listes du
  // quotidien n'utilisent que les actifs — un archivé n'est plus suivi.
  const { participants, participantsActifs } = useParticipants();
  const { seances: allSeances, seancesDuJour } = useAgenda();
  // Alerte « contrat fin proche » (équivalent mobile du Dashboard) : un bénéficiaire archivé
  // n'est plus suivi, son contrat n'appelle aucune action (cf. lib/archivage.ts, Dashboard.tsx).
  const { contratsARenouveler: contratsARenouvelerTous } = useContrats();
  const contratsARenouveler = contratsDesBeneficiairesActifs(contratsARenouvelerTous, participants);
  const { settings: praticienSettings } = usePraticienSettings();
  const {
    coursCollectifs, participationsDuCours,
    modifierStatutCours, mettreAJourParticipation,
  } = useCoursCollectifs();
  const [coursSelectionneId, setCoursSelectionneId] = useState<string | null>(null);
  // Couleurs de catégorie du praticien (les mêmes que dans l'agenda) et accès à l'agenda.
  const { categories } = useCategoriesSeance();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const seances = seancesDuJour(today);
  const nbRealisees = seances.filter(s => s.statut === 'realisee').length;
  const categorieDe = (sc: Seance) => categories.find(c => c.id === sc.categorieId);
  // Échéances : les 3 prochains bilans planifiés (posés à la main ou automatiquement) à partir de demain.
  const bilansAVenir = allSeances
    .filter(sc => sc.type !== 'seance' && sc.statut === 'planifiee' && sc.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut))
    .slice(0, 3);
  // Même filtre que l'agenda desktop (AgendaV2Page) : un cours annulé ne
  // doit pas apparaître dans la timeline du jour.
  const coursDuJour = coursCollectifs
    .filter(c => c.date === today && c.statut !== 'annule')
    .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  const coursSelectionne = coursCollectifs.find(c => c.id === coursSelectionneId) ?? null;
  const prenom = praticienSettings.prenom || 'Praticien';

  const now = new Date();
  const lundiOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const lundi = new Date(now); lundi.setDate(now.getDate() + lundiOffset);
  const dim = new Date(lundi); dim.setDate(lundi.getDate() + 6);
  const seancesSemaine = allSeances.filter(s =>
    s.date >= lundi.toISOString().slice(0, 10) &&
    s.date <= dim.toISOString().slice(0, 10) &&
    s.statut !== 'annulee'
  );

  const il90jFmt = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
  const bilansAFaire = participantsActifs.filter(p =>
    p.bilans.length === 0 || p.bilans.every(b => b.date < il90jFmt)
  );

  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const prochaineSeance = seances.find(s => s.statut === 'planifiee' && s.heureDebut >= currentTimeStr)
    ?? seances.find(s => s.statut === 'planifiee');

  // Timeline du jour : séances individuelles et cours collectifs mêlés,
  // triés par heure — un cours collectif n'a pas de bénéficiaire unique, il
  // ne peut donc pas rejoindre `seances` telle quelle.
  type ItemJour =
    | { kind: 'seance'; heureDebut: string; seance: typeof seances[number] }
    | { kind: 'cours'; heureDebut: string; cours: CoursCollectif; nbInscrits: number };
  const itemsJour: ItemJour[] = [
    ...seances.map(seance => ({ kind: 'seance' as const, heureDebut: seance.heureDebut, seance })),
    ...coursDuJour.map(cours => ({
      kind: 'cours' as const,
      heureDebut: cours.heureDebut,
      cours,
      nbInscrits: participationsDuCours(cours.id).length,
    })),
  ].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

  // Tuile de chiffre (accueil) : icône Tabler dans une pastille teintée, chiffre en grand, libellé.
  const Tuile = ({ icone, valeur, libelle, couleur = C.primary }: { icone: string; valeur: number; libelle: string; couleur?: string }) => (
    <div style={{ background: 'white', borderRadius: 16, padding: '14px 14px', boxShadow: '0 2px 10px rgba(13,43,43,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: `${couleur}1F`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${icone}`} style={{ fontSize: 20, color: couleur }} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: couleur === C.primary ? C.text : couleur, lineHeight: 1 }}>{valeur}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{libelle}</div>
      </div>
    </div>
  );
  const titreSection: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.08em' };
  const pastilleCategorie = (c: { nom: string; couleur: string }) => (
    <span style={{ background: `${c.couleur}22`, color: C.text, border: `1px solid ${c.couleur}`, borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{c.nom}</span>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F4' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ background: C.dark, borderRadius: '0 0 24px 24px', paddingTop: 'calc(env(safe-area-inset-top, 44px) + 18px)', paddingLeft: 20, paddingRight: 20, paddingBottom: 22 }}>
        <img src="/logo-horizon.png?v=2" alt="Horizon" style={{ height: 22, marginBottom: 14 }}
          onError={e => { (e.target as HTMLImageElement).src = '/logo-horizon.svg'; }} />
        <div style={{ fontSize: 24, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>Bonjour {prenom}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4, textTransform: 'capitalize' }}>{formatDateLong(new Date())}</div>

        {/* Progression de la journée : séances faites / séances du jour. */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
              {seances.length} séance{seances.length !== 1 ? 's' : ''} aujourd'hui
            </span>
            {seances.length > 0 && (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{nbRealisees} faite{nbRealisees !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={seances.length} aria-valuenow={nbRealisees} aria-label="Séances du jour réalisées"
            style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            <div style={{ width: seances.length ? `${(nbRealisees / seances.length) * 100}%` : '0%', height: '100%', background: C.primary, borderRadius: 3, transition: 'width .3s' }} />
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* ── PROCHAINE SÉANCE ──────────────────────────────────── */}
        {prochaineSeance && (() => {
          const p = participants.find(x => x.id === prochaineSeance.participantId);
          const ciInfo = p ? getContreIndications(p) : { actif: false, detail: null };
          const contreIndDetail = ciInfo.detail ?? undefined;
          const hasCI = ciInfo.actif;
          const adresse = [p?.adresseRue, p?.adresseVille].filter(Boolean).join(', ');
          const cat = categorieDe(prochaineSeance);
          return (
            <div style={{ background: 'white', borderRadius: 18, boxShadow: '0 4px 16px rgba(13,43,43,0.10)', overflow: 'hidden', display: 'flex' }}>
              <span aria-hidden="true" style={{ width: 6, background: cat?.couleur ?? C.primary, flexShrink: 0 }} />
              <div style={{ padding: 16, flex: 1, minWidth: 0 }}>
                <div style={{ ...titreSection, color: C.primary, marginBottom: 8 }}>Prochaine séance</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1 }}>{prochaineSeance.heureDebut}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.prenom} {p?.nom}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {cat ? pastilleCategorie(cat) : prochaineSeance.type !== 'seance' && (
                    <span style={{ background: '#EDE9FE', color: '#6D28D9', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{LABEL_TYPE[prochaineSeance.type]}</span>
                  )}
                  <span style={{ fontSize: 12, color: C.muted }}>{prochaineSeance.dureeMinutes} min</span>
                </div>
                {prochaineSeance.objectif && (
                  <div style={{ fontSize: 13, color: C.text, marginTop: 8 }}>🎯 {prochaineSeance.objectif}</div>
                )}
                {adresse && (
                  <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginTop: 8 }}>📍 {adresse}</div>
                )}
                {hasCI && contreIndDetail && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 10px', marginTop: 10, fontSize: 12, color: '#B91C1C', fontWeight: 600 }}>
                    ⚠️ {contreIndDetail}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  {adresse && (
                    <button onClick={() => ouvrirMaps(adresse)}
                      style={{ flex: 1, padding: '11px', background: 'white', border: `1.5px solid ${C.primary}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.primary, cursor: 'pointer' }}>
                      🗺️ Itinéraire
                    </button>
                  )}
                  <button onClick={() => p && onVoirFiche(p.id)}
                    style={{ flex: 1, padding: '11px', background: C.primary, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
                    📋 Fiche →
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── TIMELINE ou ÉTAT VIDE ─────────────────────────────── */}
        {itemsJour.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 20px', background: 'white', borderRadius: 18, boxShadow: '0 2px 10px rgba(13,43,43,0.06)' }}>
            <i className="ti ti-calendar-off" style={{ fontSize: 48, color: '#BDD0D0', display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: '#7A9A9A', marginBottom: 6 }}>Aucune séance aujourd'hui</div>
            <div style={{ fontSize: 13, color: C.muted }}>Profitez-en pour avancer sur vos bilans</div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={titreSection}>Aujourd'hui</div>
              <button onClick={() => navigate(URLS_MOBILE.agenda)}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: C.primary, cursor: 'pointer' }}>
                Agenda →
              </button>
            </div>
            <div style={{ background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 10px rgba(13,43,43,0.06)' }}>
              {itemsJour.map((item, index) => {
                const isLast = index === itemsJour.length - 1;
                if (item.kind === 'cours') {
                  const { cours, nbInscrits } = item;
                  return (
                    <div key={`cours-${cours.id}`}>
                      <div onClick={() => setCoursSelectionneId(cours.id)}
                        style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '12px 16px', cursor: 'pointer', background: '#F6F0FF' }}>
                        <span aria-hidden="true" style={{ width: 4, borderRadius: 2, background: '#7C3AED', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flexShrink: 0, width: 40 }}>{cours.heureDebut}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1, minWidth: 0 }}>
                          👥 {cours.titre}
                          <span style={{ fontSize: 11, fontWeight: 500, color: '#7C3AED' }}> · {nbInscrits} inscrit{nbInscrits !== 1 ? 's' : ''}</span>
                        </span>
                        <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#D0DCDC', alignSelf: 'center' }} />
                      </div>
                      {!isLast && <div style={{ height: 1, background: '#F0F4F4', marginLeft: 16 }} />}
                    </div>
                  );
                }
                const seance = item.seance;
                const p = participants.find(x => x.id === seance.participantId);
                const estEnCours = seance.heureDebut <= currentTimeStr && seance.heureFin > currentTimeStr;
                const faite = seance.statut === 'realisee';
                const cat = categorieDe(seance);
                return (
                  <div key={seance.id}>
                    <div onClick={() => p && onVoirFiche(p.id)}
                      style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '12px 16px', cursor: p ? 'pointer' : 'default', background: estEnCours ? '#F0FAFA' : 'white' }}>
                      <span aria-hidden="true" style={{ width: 4, borderRadius: 2, background: cat?.couleur ?? '#B8C7C7', flexShrink: 0, opacity: faite ? 0.5 : 1 }} />
                      <div style={{ flexShrink: 0, width: 40 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{seance.heureDebut}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{seance.heureFin}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: estEnCours ? 700 : 600, color: C.text, textDecoration: faite ? 'line-through' : 'none', opacity: faite ? 0.6 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p?.prenom} {p?.nom}
                        </div>
                        {(cat || seance.type !== 'seance') && (
                          <div style={{ marginTop: 3 }}>
                            {cat ? pastilleCategorie(cat) : (
                              <span style={{ background: '#EDE9FE', color: '#6D28D9', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{LABEL_TYPE[seance.type]}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {faite ? (
                        <i className="ti ti-circle-check" aria-label="Réalisée" style={{ fontSize: 20, color: C.green, alignSelf: 'center' }} />
                      ) : estEnCours ? (
                        <span style={{ background: C.primary, color: 'white', borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 700, alignSelf: 'center' }}>En cours</span>
                      ) : (
                        <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#D0DCDC', alignSelf: 'center' }} />
                      )}
                    </div>
                    {!isLast && <div style={{ height: 1, background: '#F0F4F4', marginLeft: 16 }} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── BILANS À VENIR ────────────────────────────────────── */}
        {bilansAVenir.length > 0 && (
          <div>
            <div style={{ ...titreSection, marginBottom: 10 }}>Bilans à venir</div>
            <div style={{ background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 10px rgba(13,43,43,0.06)' }}>
              {bilansAVenir.map((b, i) => {
                const p = participants.find(x => x.id === b.participantId);
                const cat = categorieDe(b);
                return (
                  <button key={b.id} onClick={() => navigate(URLS_MOBILE.agendaJour(b.date))}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '1px solid #F0F4F4', cursor: 'pointer', textAlign: 'left' }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: cat?.couleur ?? '#8B5CF6', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flexShrink: 0, width: 56 }}>{formatDateCourt(b.date)}</span>
                    <span style={{ fontSize: 14, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.prenom} {p?.nom}</span>
                    <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#D0DCDC' }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CHIFFRES ──────────────────────────────────────────── */}
        <div>
          <div style={{ ...titreSection, marginBottom: 10 }}>En un coup d'œil</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Tuile icone="ti-users" valeur={participantsActifs.length} libelle="bénéficiaires actifs" />
            <Tuile icone="ti-calendar-week" valeur={seancesSemaine.length} libelle="cette semaine" />
            <Tuile icone="ti-clipboard-check" valeur={bilansAFaire.length} libelle="bilans à faire" />
            <Tuile icone="ti-clock-exclamation" valeur={contratsARenouveler.length} libelle="contrat fin proche" couleur={contratsARenouveler.length > 0 ? '#F59E0B' : C.primary} />
          </div>
        </div>

        {/* ── ALERTES ───────────────────────────────────────────── */}
        {contratsARenouveler.length > 0 && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 14, padding: '12px 14px', fontSize: 13, color: '#92400E', fontWeight: 600 }}>
            ⏰ {contratsARenouveler.length} contrat{contratsARenouveler.length > 1 ? 's' : ''} à renouveler bientôt
          </div>
        )}

      </div>

      {coursSelectionne && (
        <ModalPresenceCoursCollectif
          cours={coursSelectionne}
          participations={participationsDuCours(coursSelectionne.id)}
          participants={participants}
          onMettreAJourParticipation={(participationId, patch) => mettreAJourParticipation(participationId, patch)}
          onModifierStatutCours={async statut => modifierStatutCours(coursSelectionne.id, statut)}
          onClose={() => setCoursSelectionneId(null)}
        />
      )}
    </div>
  );
}
