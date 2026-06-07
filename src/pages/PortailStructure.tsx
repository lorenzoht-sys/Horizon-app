import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { dbToParticipant, dbToBilan, dbToSeance, dbToProgramme } from '../lib/mappers';
import { useDevice } from '../hooks/useDevice';
import type { Participant, Seance, Bilan } from '../types';

type Praticien = { prenom: string; nom: string; titre?: string | null; email?: string | null; telephone?: string | null };

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOIS_COURTS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
const MOIS_LONGS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function fmtCourt(iso: string) {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
function fmtMois(m: number, y: number) { return `${MOIS_LONGS[m - 1]} ${y}`; }
function calcAge(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

const LABELS_DOCUMENTS: Record<string, string> = {
  compte_rendu_medecin: 'Compte-rendu médecin',
  compte_rendu_famille: 'Compte-rendu famille',
};

function telechargerDocument(d: any, nomPatient: string) {
  const blob = new Blob([d.contenu ?? ''], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(LABELS_DOCUMENTS[d.type_document] ?? 'document').replace(/ /g, '-')}-${nomPatient}-${d.date_document}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// Domaines fonctionnels traduits en langage non médical.
// On ne calcule et n'affiche jamais les scores bruts des tests (TUG, HandGrip…),
// uniquement un indicateur synthétique 0-100 dérivé de ceux-ci.
type DomaineKey = 'equilibre' | 'force' | 'endurance' | 'mobilite';
const DOMAINES_LABELS: Record<DomaineKey, string> = {
  equilibre: 'Équilibre',
  force:     'Force',
  endurance: 'Endurance',
  mobilite:  'Mobilité',
};

function sousScore(valeur: number | null | undefined, max: number, lowerBetter = false): number | null {
  if (valeur == null || max <= 0) return null;
  const ratio = lowerBetter ? Math.max(0, 1 - valeur / max) : Math.min(1, valeur / max);
  return Math.round(ratio * 100);
}

function scoresParDomaine(b: Bilan): Partial<Record<DomaineKey, number>> {
  const d: Partial<Record<DomaineKey, number>> = {};
  const eq = sousScore(b.equilibre?.droite, 30);
  if (eq != null) d.equilibre = eq;
  const force = [sousScore(b.chairStand30, 20), sousScore(b.handGrip?.droite, 35)].filter((x): x is number => x != null);
  if (force.length) d.force = Math.round(force.reduce((a, c) => a + c, 0) / force.length);
  const end = sousScore(b.tm6?.distanceMetres, 600);
  if (end != null) d.endurance = end;
  const mob = sousScore(b.tug3m, 20, true);
  if (mob != null) d.mobilite = mob;
  return d;
}

function scoreGlobal(b: Bilan): number | null {
  const valeurs = Object.values(scoresParDomaine(b));
  if (!valeurs.length) return null;
  return Math.round(valeurs.reduce((a, c) => a + c, 0) / valeurs.length);
}

function statutPatient(p: Participant, _seancesPatient: Seance[]): { emoji: string; label: string; color: string } {
  const sorted = [...p.bilans].sort((a, b) => a.date.localeCompare(b.date));
  const ini = sorted[0] ?? null;
  const act = sorted[sorted.length - 1] ?? null;
  const il90j = new Date(); il90j.setDate(il90j.getDate() - 90);
  if (!act || new Date(act.date) < il90j) return { emoji: '⚠️', label: 'Bilan à faire', color: '#F59E0B' };
  if (ini && act && ini.id !== act.id) {
    const equi = ini.equilibre?.droite != null && act.equilibre?.droite != null && act.equilibre.droite > ini.equilibre.droite;
    const cs   = ini.chairStand30 != null && act.chairStand30 != null && act.chairStand30 > ini.chairStand30;
    if (equi || cs) return { emoji: '✅', label: 'Progression', color: '#22C55E' };
    return { emoji: '➡️', label: 'Stable', color: '#6B7280' };
  }
  return { emoji: '➡️', label: 'Stable', color: '#6B7280' };
}

// ── Composant Vue détail patient (progression, programme, séances) ───────────

function VueProgressPatient({ p, seances }: { p: Participant; seances: Seance[] }) {
  const C = { dark: 'var(--color-ink)', border: '#E0EEEE', muted: '#8FA8A8' };

  const sorted = [...p.bilans].sort((a, b) => a.date.localeCompare(b.date));
  const ini = sorted[0] ?? null;
  const act = sorted[sorted.length - 1] ?? null;
  const aDeuxBilans = !!(ini && act && ini.id !== act.id);

  const seancesPatient = seances.filter(s => s.participantId === p.id).sort((a, b) => b.date.localeCompare(a.date));

  const scoreIni = ini ? scoreGlobal(ini) : null;
  const scoreAct = act ? scoreGlobal(act) : null;

  let ameliores: string[] = [];
  let vigilance: string[] = [];
  let tendance: { emoji: string; label: string; color: string } | null = null;
  if (aDeuxBilans && ini && act) {
    const dIni = scoresParDomaine(ini);
    const dAct = scoresParDomaine(act);
    (Object.keys(DOMAINES_LABELS) as DomaineKey[]).forEach(k => {
      if (dIni[k] != null && dAct[k] != null) {
        const delta = dAct[k]! - dIni[k]!;
        if (delta >= 5) ameliores.push(DOMAINES_LABELS[k]);
        else if (delta <= -5) vigilance.push(DOMAINES_LABELS[k]);
      }
    });
    if (scoreIni != null && scoreAct != null) {
      const delta = scoreAct - scoreIni;
      tendance = delta >= 5
        ? { emoji: '✅', label: 'En progression', color: '#22C55E' }
        : delta <= -5
          ? { emoji: '⚠️', label: 'À surveiller', color: '#F59E0B' }
          : { emoji: '➡️', label: 'Stable', color: '#6B7280' };
    }
  }

  const programmeActif = p.programmes?.filter(pr => pr.actif).sort((a, b) => b.dateCreation.localeCompare(a.dateCreation))[0] ?? null;

  // Suivi des séances : 2 dernières semaines, du lundi au dimanche
  const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const aujourdHui = new Date();
  const decalage = (aujourdHui.getDay() + 6) % 7; // 0 = lundi
  const lundiCourant = new Date(aujourdHui); lundiCourant.setDate(aujourdHui.getDate() - decalage);
  const semaines = [0, 1].map(i => {
    const lundi = new Date(lundiCourant); lundi.setDate(lundiCourant.getDate() - i * 7);
    const jours = Array.from({ length: 7 }, (_, j) => {
      const jour = new Date(lundi); jour.setDate(lundi.getDate() + j);
      const iso = jour.toISOString().slice(0, 10);
      return seancesPatient.find(s => s.date === iso) ?? null;
    });
    return { label: i === 0 ? 'Semaine en cours' : 'Sem. précédente', jours };
  });

  const moisCourant = aujourdHui.toISOString().slice(0, 7);
  const seancesMoisToutes = seancesPatient.filter(s => s.date.startsWith(moisCourant));
  const seancesMoisRealisees = seancesMoisToutes.filter(s => s.statut === 'realisee');
  const tauxPresence = seancesMoisToutes.length > 0
    ? Math.round((seancesMoisRealisees.length / seancesMoisToutes.length) * 100)
    : null;

  const Barre = ({ valeur }: { valeur: number }) => (
    <div style={{ flex: 1, height: 8, background: '#EEF5F5', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ width: `${valeur}%`, height: '100%', background: 'var(--color-teal)', borderRadius: 8 }} />
    </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 640, margin: '0 auto', fontFamily: "var(--font-sans)" }}>

      {/* Progression globale */}
      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          Progression globale
        </div>
        {aDeuxBilans && scoreIni != null && scoreAct != null ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 10 }}>Score global de forme</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.muted, width: 92, flexShrink: 0 }}>Bilan initial</span>
              <Barre valeur={scoreIni} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.dark, width: 56, textAlign: 'right', flexShrink: 0 }}>{scoreIni}/100</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: C.muted, width: 92, flexShrink: 0 }}>Dernier bilan</span>
              <Barre valeur={scoreAct} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.dark, width: 90, textAlign: 'right', flexShrink: 0 }}>
                {scoreAct}/100{scoreAct !== scoreIni && ` ${scoreAct > scoreIni ? '+' : ''}${scoreAct - scoreIni} pts`}
              </span>
            </div>
            {tendance && (
              <div style={{ fontSize: 13, color: C.dark, marginBottom: 6 }}>
                Tendance générale : <span style={{ color: tendance.color, fontWeight: 700 }}>{tendance.emoji} {tendance.label}</span>
              </div>
            )}
            {ameliores.length > 0 && (
              <div style={{ fontSize: 13, color: C.dark, marginBottom: 4 }}>Domaines en amélioration : <strong>{ameliores.join(' · ')}</strong></div>
            )}
            {vigilance.length > 0 && (
              <div style={{ fontSize: 13, color: C.dark }}>Points de vigilance : <strong>{vigilance.join(' · ')}</strong></div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Aucun bilan réalisé pour ce patient.<br />
            Le premier bilan permettra de mesurer les capacités de départ et de définir les objectifs.
          </div>
        )}
      </div>

      {/* Programme en cours */}
      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Programme en cours
        </div>
        {programmeActif ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 6 }}>🏋️ {programmeActif.titre}</div>
            {programmeActif.objectif && <div style={{ fontSize: 13, color: C.dark, marginBottom: 4 }}>🎯 Objectif : {programmeActif.objectif}</div>}
            <div style={{ fontSize: 12, color: C.muted }}>Mis à jour le {fmtCourt(programmeActif.dateCreation)}</div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: C.muted }}>Aucun programme en cours pour ce patient.</div>
        )}
      </div>

      {/* Suivi des séances */}
      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          Suivi des séances (2 dernières semaines)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(7, 1fr)', gap: 6, fontSize: 11, color: C.muted, marginBottom: 6 }}>
          <span />
          {JOURS.map(j => <span key={j} style={{ textAlign: 'center' }}>{j}</span>)}
        </div>
        {semaines.map(sem => (
          <div key={sem.label} style={{ display: 'grid', gridTemplateColumns: '110px repeat(7, 1fr)', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: C.muted }}>{sem.label}</span>
            {sem.jours.map((s, i) => (
              <span key={i} style={{ textAlign: 'center', fontSize: 15 }}>
                {!s ? '○' : s.statut === 'realisee' ? '✅' : (s.statut === 'annulee' || s.statut === 'reportee') ? '⚠️' : '○'}
              </span>
            ))}
          </div>
        ))}
        <div style={{ fontSize: 12, color: C.muted, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          Total {MOIS_LONGS[aujourdHui.getMonth()]} : {seancesMoisRealisees.length} séance{seancesMoisRealisees.length !== 1 ? 's' : ''} réalisée{seancesMoisRealisees.length !== 1 ? 's' : ''}
          {tauxPresence != null && ` · Taux de présence : ${tauxPresence}%`}
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

type Tab = 'patients' | 'seances' | 'progression' | 'documents' | 'facturation';

export default function PortailStructure() {
  const { token, patientId } = useParams<{ token: string; patientId?: string }>();
  const { isMobile } = useDevice();
  const [structure, setStructure] = useState<{ id: string; nom: string; actif: boolean; tarifSeance: number } | null>(null);
  const [praticien, setPraticien] = useState<Praticien | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [seances, setSeances] = useState<Seance[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [tab, setTab] = useState<Tab>('patients');
  const [selectedPatient, setSelectedPatient] = useState<Participant | null>(null);
  const [moisFilter, setMoisFilter] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (!token || !supabase) { setLoading(false); setErreur(true); return; }
    async function charger() {
      try {
        // 1. Vérifier token
        const { data: str, error: strErr } = await supabase!
          .from('structures').select('id, nom, actif, tarif_seance').eq('token_acces', token).single();
        if (strErr || !str || !str.actif) { setErreur(true); setLoading(false); return; }
        setStructure({ id: str.id, nom: str.nom, actif: str.actif, tarifSeance: Number(str.tarif_seance ?? 45) });

        // 1bis. Infos de contact du praticien (nom, titre, téléphone, email)
        const { data: praData } = await supabase!.rpc('get_praticien_structure', { p_token: token });
        if (Array.isArray(praData) && praData.length > 0) setPraticien(praData[0]);

        // 2. Charger participants de cette structure
        const { data: pData } = await supabase!
          .from('participants').select('*, bilans(*), programmes(*)').eq('structure_id', str.id);
        const parts: Participant[] = (pData ?? []).map((row: any) => ({
          ...dbToParticipant(row),
          bilans: (row.bilans ?? []).map(dbToBilan),
          programmes: (row.programmes ?? []).map(dbToProgramme),
        }));
        setParticipants(parts);

        const ids = parts.map(p => p.id);
        if (ids.length > 0) {
          // 3. Séances
          const { data: sData } = await supabase!.from('seances').select('*').in('participant_id', ids).order('date', { ascending: false });
          setSeances((sData ?? []).map(dbToSeance));

          // 4. Factures structure
          const { data: fData } = await supabase!.from('factures_suivi').select('*').eq('structure_id', str.id).order('periode_annee', { ascending: false }).order('periode_mois', { ascending: false });
          setFactures(fData ?? []);

          // 5. Documents partagés avec la structure
          const { data: dData } = await supabase!.from('documents_partages').select('*').eq('structure_id', str.id).order('partage_le', { ascending: false });
          setDocuments(dData ?? []);
        }
      } catch { setErreur(true); }
      finally { setLoading(false); }
    }
    void charger();
  }, [token]);

  // Si patientId dans l'URL → vue progrès
  useEffect(() => {
    if (patientId && participants.length > 0) {
      const p = participants.find(x => x.id === patientId);
      if (p) setSelectedPatient(p);
    }
  }, [patientId, participants]);

  const C = { dark: 'var(--color-ink)', teal: 'var(--color-teal)', bg: 'var(--color-bg)', border: '#E0EEEE', muted: '#8FA8A8' };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "var(--font-sans)" }}>
      <div style={{ textAlign: 'center', color: C.teal }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🌊</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Chargement…</div>
      </div>
    </div>
  );

  if (erreur || !structure) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "var(--font-sans)", background: 'var(--color-bg)' }}>
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.dark, marginBottom: 8 }}>Accès non autorisé</div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
          Ce lien est invalide ou a expiré.<br />
          Contactez votre praticien APA.
        </div>
      </div>
    </div>
  );

  // Vue progrès individuelle
  if (selectedPatient) return (
    <div style={{ maxWidth: 680, margin: '0 auto', background: C.bg, minHeight: '100vh', fontFamily: "var(--font-sans)" }}>
      <div style={{ background: C.dark, padding: '14px 16px', position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => setSelectedPatient(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 10 }}>← Retour aux patients</button>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'white' }}>
          {selectedPatient.prenom} {selectedPatient.nom}{selectedPatient.dateNaissance && ` · ${calcAge(selectedPatient.dateNaissance)} ans`}
        </div>
        {praticien && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Suivi par {praticien.prenom} {praticien.nom} · APA</div>}
      </div>
      <VueProgressPatient p={selectedPatient} seances={seances} />
    </div>
  );

  // Données onglet séances
  const seancesFiltered = seances.filter(s => s.date.startsWith(moisFilter) && s.statut === 'realisee');
  const derniers6Mois = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  // Total 2026 factures
  const totalAnnee = factures
    .filter(f => f.periode_annee === new Date().getFullYear() && f.statut === 'envoyee')
    .reduce((s: number, f: any) => s + Number(f.montant_total), 0);

  // Statistiques pour le résumé (colonne gauche desktop)
  const now = new Date();
  const moisCourant = now.toISOString().slice(0, 7);
  const seancesMoisCount = seances.filter(s => s.date.startsWith(moisCourant) && s.statut === 'realisee').length;
  const tauxPresenceMois = participants.length > 0 ? Math.round((seancesMoisCount / (participants.length * 4)) * 100) : 0;
  const bilansAFaireCount = participants.filter(p => statutPatient(p, []).label === 'Bilan à faire').length;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'patients',    label: `👥 Mes patients (${participants.length})` },
    { id: 'seances',     label: '📅 Séances' },
    { id: 'progression', label: '📈 Progression' },
    { id: 'documents',   label: '📄 Documents' },
    { id: 'facturation', label: '💶 Facturation' },
  ];

  // ── Header ──────────────────────────────────────────────────────────────
  const header = (
    <div style={{
      background: C.dark, padding: isMobile ? '14px 16px' : '16px 24px',
      position: 'sticky', top: 0, zIndex: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {!isMobile && <span style={{ fontSize: 22 }}>🌊</span>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {praticien ? `${praticien.prenom} ${praticien.nom} — ${structure.nom}` : structure.nom}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Suivi APA · Accès lecture seule</div>
        </div>
      </div>
      {!isMobile && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
          {fmtMois(now.getMonth() + 1, now.getFullYear())}
        </div>
      )}
    </div>
  );

  // ── Navigation (onglets) ─────────────────────────────────────────────────
  // Desktop : barre d'onglets horizontale au-dessus du contenu.
  // Mobile : barre d'onglets fixée en bas de l'écran (style app native), scrollable horizontalement.
  const tabsNav = (
    <div style={isMobile ? {
      background: 'white', borderTop: `1px solid ${C.border}`, display: 'flex',
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, overflowX: 'auto',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
    } : {
      background: 'white', borderBottom: `1px solid ${C.border}`, display: 'flex',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          flex: isMobile ? 'none' : 1, padding: isMobile ? '10px 16px' : '12px 14px', background: 'none', border: 'none',
          borderBottom: !isMobile && tab === t.id ? `2px solid ${C.teal}` : !isMobile ? '2px solid transparent' : 'none',
          borderTop: isMobile && tab === t.id ? `2px solid ${C.teal}` : isMobile ? '2px solid transparent' : 'none',
          color: tab === t.id ? C.teal : C.muted, fontWeight: tab === t.id ? 700 : 400,
          fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          {t.label}
        </button>
      ))}
    </div>
  );

  // ── Colonne gauche desktop : résumé + praticien ──────────────────────────
  const sidebar = (
    <aside style={{ width: 300, flexShrink: 0 }}>
      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          Résumé {fmtMois(now.getMonth() + 1, now.getFullYear())}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: C.dark }}>
          <div>👥 {participants.length} patient{participants.length !== 1 ? 's' : ''} suivi{participants.length !== 1 ? 's' : ''}</div>
          <div>📅 {seancesMoisCount} séance{seancesMoisCount !== 1 ? 's' : ''} réalisée{seancesMoisCount !== 1 ? 's' : ''}</div>
          <div>📊 {tauxPresenceMois}% taux de présence</div>
          <div>⚠️ {bilansAFaireCount} bilan{bilansAFaireCount !== 1 ? 's' : ''} à faire</div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
          Praticien
        </div>
        {praticien ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: C.teal,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {praticien.prenom[0]}{praticien.nom[0]}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{praticien.prenom} {praticien.nom}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{praticien.titre || 'Enseignant APA'}</div>
              </div>
            </div>
            {praticien.telephone && <div style={{ fontSize: 13, color: C.dark, marginBottom: 4 }}>📞 {praticien.telephone}</div>}
            {praticien.email && <div style={{ fontSize: 13, color: C.dark }}>✉️ {praticien.email}</div>}
          </>
        ) : (
          <div style={{ fontSize: 13, color: C.muted }}>Informations non disponibles.</div>
        )}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          Dernière mise à jour : aujourd'hui
        </div>
      </div>
    </aside>
  );

  // ── Contenu de l'onglet actif ────────────────────────────────────────────
  const tabContent = (
    <>
        {/* Onglet Patients */}
        {tab === 'patients' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              {participants.length} patient{participants.length !== 1 ? 's' : ''} suivis
            </div>
            {participants.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
                Aucun patient rattaché à cette structure.
              </div>
            ) : (
              participants.map(p => {
                const seancesP = seances.filter(s => s.participantId === p.id && s.statut === 'realisee');
                const statut = statutPatient(p, seancesP);
                const sortedBilans = [...p.bilans].sort((a, b) => a.date.localeCompare(b.date));
                const dernierBilan = sortedBilans[sortedBilans.length - 1] ?? null;
                const score = dernierBilan ? scoreGlobal(dernierBilan) : null;
                const programmeActif = p.programmes?.find(pr => pr.actif) ?? null;
                return (
                  <div key={p.id} style={{
                    background: 'white', border: `1px solid ${C.border}`, borderRadius: 16,
                    padding: 16, marginBottom: 10,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%', background: C.teal,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', fontWeight: 700, fontSize: 14, flexShrink: 0,
                        }}>
                          {p.prenom[0]}{p.nom[0]}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{p.prenom} {p.nom}{p.dateNaissance && ` · ${calcAge(p.dateNaissance)} ans`}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>
                            {p.dateCreation && `Suivi depuis ${fmtMois(new Date(p.dateCreation).getMonth() + 1, new Date(p.dateCreation).getFullYear())}`}
                            {programmeActif && ` · Programme : ${programmeActif.titre}`}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: statut.color, background: `${statut.color}18`, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                        {statut.emoji} {statut.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: C.muted, width: 80, flexShrink: 0 }}>Progression</span>
                      {score != null ? (
                        <>
                          <div style={{ flex: 1, height: 8, background: '#EEF5F5', borderRadius: 8, overflow: 'hidden' }}>
                            <div style={{ width: `${score}%`, height: '100%', background: C.teal, borderRadius: 8 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, flexShrink: 0 }}>{score}/100</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: C.muted }}>Pas encore de bilan</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 12, color: C.muted }}>
                      <span style={{ width: 80, flexShrink: 0 }}>Présence</span>
                      <span>{seancesP.length} séance{seancesP.length !== 1 ? 's' : ''}</span>
                    </div>

                    <button
                      onClick={() => setSelectedPatient(p)}
                      style={{ fontSize: 12, fontWeight: 600, color: C.teal, background: 'none', border: `1px solid ${C.teal}30`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
                    >
                      Voir le détail →
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Onglet Séances */}
        {tab === 'seances' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Séances réalisées
              </div>
              <select
                value={moisFilter}
                onChange={e => setMoisFilter(e.target.value)}
                style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, background: 'white', color: C.dark }}
              >
                {derniers6Mois.map(m => (
                  <option key={m} value={m}>
                    {MOIS_COURTS[parseInt(m.slice(5, 7)) - 1]} {m.slice(0, 4)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, marginBottom: 4 }}>
                {MOIS_LONGS[parseInt(moisFilter.slice(5, 7)) - 1]} {moisFilter.slice(0, 4)} — {seancesFiltered.length} séances réalisées
              </div>
              {seancesFiltered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                    Les séances apparaîtront ici au fur et à mesure<br />qu'elles sont réalisées par votre praticien APA.
                  </div>
                </div>
              ) : (
                seancesFiltered.slice(0, 20).map(s => {
                  const p = participants.find(x => x.id === s.participantId);
                  return (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.bg}`, fontSize: 13 }}>
                      <span style={{ color: C.dark }}>
                        {fmtCourt(s.date)} · <strong>{p ? `${p.prenom} ${p.nom}` : '—'}</strong>
                      </span>
                      <span style={{ color: '#22C55E', fontWeight: 700 }}>✅</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Résumé mensuel */}
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Résumé mensuel
            </div>
            <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    <th style={{ textAlign: 'left', padding: '10px 16px', color: C.muted, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mois</th>
                    <th style={{ textAlign: 'right', padding: '10px 16px', color: C.muted, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Séances</th>
                    <th style={{ textAlign: 'right', padding: '10px 16px', color: C.muted, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Patients</th>
                    <th style={{ textAlign: 'right', padding: '10px 16px', color: C.muted, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Présence</th>
                  </tr>
                </thead>
                <tbody>
                  {derniers6Mois.slice(0, 4).map(m => {
                    const nb = seances.filter(s => s.date.startsWith(m) && s.statut === 'realisee').length;
                    const pct = participants.length > 0 ? Math.round((nb / (participants.length * 4)) * 100) : 0;
                    return (
                      <tr key={m} style={{ borderTop: `1px solid ${C.bg}` }}>
                        <td style={{ padding: '10px 16px', color: C.dark, fontWeight: 600 }}>{MOIS_COURTS[parseInt(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</td>
                        <td style={{ padding: '10px 16px', color: C.dark, textAlign: 'right' }}>{nb}</td>
                        <td style={{ padding: '10px 16px', color: C.dark, textAlign: 'right' }}>{participants.length}</td>
                        <td style={{ padding: '10px 16px', color: C.dark, textAlign: 'right' }}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Onglet Progression */}
        {tab === 'progression' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
              Progression de vos patients
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Données basées sur les bilans fonctionnels</div>
            {participants.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
                Aucun patient rattaché à cette structure.
              </div>
            ) : (
              participants.map(p => {
                const sortedB = [...p.bilans].sort((a, b) => a.date.localeCompare(b.date));
                const ini = sortedB[0] ?? null;
                const act = sortedB[sortedB.length - 1] ?? null;
                const aDeuxBilans = !!(ini && act && ini.id !== act.id);
                const scoreAct = act ? scoreGlobal(act) : null;

                let lignesDomaines: { emoji: string; texte: string }[] = [];
                let tendanceTexte: { emoji: string; label: string; color: string } | null = null;
                if (aDeuxBilans && ini && act) {
                  const dIni = scoresParDomaine(ini);
                  const dAct = scoresParDomaine(act);
                  (Object.keys(DOMAINES_LABELS) as DomaineKey[]).forEach(k => {
                    if (dIni[k] != null && dAct[k] != null) {
                      const delta = dAct[k]! - dIni[k]!;
                      if (delta >= 5) lignesDomaines.push({ emoji: '✅', texte: `${DOMAINES_LABELS[k]} en amélioration` });
                      else if (delta <= -5) lignesDomaines.push({ emoji: '⚠️', texte: `${DOMAINES_LABELS[k]} à travailler` });
                      else lignesDomaines.push({ emoji: '➡️', texte: `${DOMAINES_LABELS[k]} stable` });
                    }
                  });
                  const scoreIni = scoreGlobal(ini);
                  if (scoreIni != null && scoreAct != null) {
                    const delta = scoreAct - scoreIni;
                    tendanceTexte = delta >= 5
                      ? { emoji: '✅', label: 'En progression', color: '#22C55E' }
                      : delta <= -5
                        ? { emoji: '⚠️', label: 'À surveiller', color: '#F59E0B' }
                        : { emoji: '➡️', label: 'Stable', color: '#6B7280' };
                  }
                }

                return (
                  <div key={p.id} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
                      {p.prenom} {p.nom}{p.dateNaissance && ` · ${calcAge(p.dateNaissance)} ans`}
                    </div>
                    {!act ? (
                      <>
                        <div style={{ fontSize: 13, color: '#F59E0B', fontWeight: 600, marginBottom: 2 }}>⚠️ Aucun bilan disponible</div>
                        <div style={{ fontSize: 12, color: C.muted }}>Premier bilan prévu : à planifier</div>
                      </>
                    ) : !aDeuxBilans ? (
                      <div style={{ fontSize: 13, color: C.muted }}>
                        Premier bilan réalisé le {fmtCourt(act.date)}. La progression sera visible après le prochain bilan.
                      </div>
                    ) : (
                      <>
                        {scoreAct != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{ flex: 1, height: 8, background: '#EEF5F5', borderRadius: 8, overflow: 'hidden', maxWidth: 200 }}>
                              <div style={{ width: `${scoreAct}%`, height: '100%', background: C.teal, borderRadius: 8 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{scoreAct}/100</span>
                            {tendanceTexte && <span style={{ fontSize: 12, fontWeight: 700, color: tendanceTexte.color }}>{tendanceTexte.emoji} {tendanceTexte.label}</span>}
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {lignesDomaines.map(l => (
                            <span key={l.texte} style={{ fontSize: 13, color: C.dark }}>{l.emoji} {l.texte}</span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Onglet Documents */}
        {tab === 'documents' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
              Documents partagés
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
              Seuls les documents que {praticien ? `${praticien.prenom} ${praticien.nom}` : 'votre praticien APA'} a choisi de partager avec vous sont visibles ici.
            </div>
            {documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
                Aucun document partagé pour le moment.<br />
                Votre praticien APA peut partager des comptes-rendus depuis son interface.
              </div>
            ) : (
              documents.map((d: any) => {
                const p = participants.find(x => x.id === d.participant_id);
                const nomPatient = p ? `${p.prenom} ${p.nom}` : 'Patient';
                return (
                  <div key={d.id} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 2 }}>
                      📄 {LABELS_DOCUMENTS[d.type_document] ?? 'Document'} — {nomPatient}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                      {d.date_document ? new Date(d.date_document + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                    </div>
                    <button
                      onClick={() => telechargerDocument(d, nomPatient.replace(/ /g, '-'))}
                      style={{ fontSize: 12, fontWeight: 600, color: C.teal, background: 'none', border: `1px solid ${C.teal}30`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
                    >
                      Télécharger →
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Onglet Facturation */}
        {tab === 'facturation' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              Facturation
            </div>
            {factures.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>💶</div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                  Les factures apparaîtront ici une fois générées<br />par votre praticien APA.
                </div>
              </div>
            ) : (
              factures.map((f: any) => (
                <div key={f.id} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{fmtMois(f.periode_mois, f.periode_annee)}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.dark }}>{Number(f.montant_total).toFixed(0)} €</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                    {f.nb_seances} séances × {structure.tarifSeance}€
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: f.statut === 'envoyee' ? '#22C55E' : f.statut === 'en_retard' ? '#EF4444' : '#F59E0B',
                  }}>
                    {f.statut === 'envoyee'
                      ? `✅ Facturée le ${f.date_envoi ? new Date(f.date_envoi + 'T12:00').toLocaleDateString('fr-FR') : '—'}`
                      : f.statut === 'en_retard' ? '⚠️ En attente (en retard)' : '📅 En attente'}
                  </div>
                </div>
              ))
            )}
            {totalAnnee > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}`, fontSize: 14, fontWeight: 700, color: C.dark, textAlign: 'right' }}>
                Total {new Date().getFullYear()} : {totalAnnee.toFixed(0)} €
              </div>
            )}
          </div>
        )}
    </>
  );

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "var(--font-sans)" }}>
      {header}

      {isMobile ? (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ padding: 16, paddingBottom: 80 }}>{tabContent}</div>
          {tabsNav}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 24, maxWidth: 1200, margin: '0 auto', padding: 24, alignItems: 'flex-start' }}>
          {sidebar}
          <main style={{ flex: 1, minWidth: 0 }}>
            {tabsNav}
            <div style={{ paddingTop: 16 }}>{tabContent}</div>
          </main>
        </div>
      )}
    </div>
  );
}
