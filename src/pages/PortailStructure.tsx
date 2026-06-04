import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { dbToParticipant, dbToBilan, dbToSeance, dbToProgramme } from '../lib/mappers';
import type { Participant, Seance } from '../types';

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

// Traduction scores → langage structure
const LABELS_PATIENT: Record<string, { label: string; unite: string; lowerBetter?: boolean }> = {
  tug:        { label: 'Vitesse de marche',     unite: 's',    lowerBetter: true },
  chairStand: { label: 'Force pour se lever',   unite: ' rép.' },
  handGrip:   { label: 'Force des mains',       unite: ' kg' },
  equilibre:  { label: 'Équilibre',             unite: 's' },
  tm6:        { label: 'Endurance à la marche', unite: ' m' },
};

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

// ── Composant Vue progrès individuelle ────────────────────────────────────────

function VueProgressPatient({ p, seances }: { p: Participant; seances: Seance[] }) {
  const sorted = [...p.bilans].sort((a, b) => a.date.localeCompare(b.date));
  const ini = sorted[0] ?? null;
  const act = sorted[sorted.length - 1] ?? null;
  const seancesPatient = seances.filter(s => s.participantId === p.id && s.statut === 'realisee')
    .sort((a, b) => b.date.localeCompare(a.date));

  type ProgRow = { key: string; label: string; unite: string; v0: number; v1: number; lowerBetter?: boolean };
  const rows: ProgRow[] = [];
  if (ini && act && ini.id !== act.id) {
    const push = (key: string, v0: number | null, v1: number | null) => {
      if (v0 != null && v1 != null) rows.push({ key, ...LABELS_PATIENT[key], v0, v1 });
    };
    push('tug',        ini.tug3m,              act.tug3m);
    push('chairStand', ini.chairStand30,       act.chairStand30);
    push('handGrip',   ini.handGrip?.droite,   act.handGrip?.droite);
    push('equilibre',  ini.equilibre?.droite,  act.equilibre?.droite);
    push('tm6',        ini.tm6?.distanceMetres, act.tm6?.distanceMetres);
  }

  const programmeActif = p.programmes?.filter(pr => pr.actif).sort((a, b) => b.dateCreation.localeCompare(a.dateCreation))[0] ?? null;

  return (
    <div style={{ padding: 16, maxWidth: 600, margin: '0 auto', fontFamily: "var(--font-sans)" }}>
      <div style={{ background: 'var(--color-ink)', borderRadius: 16, padding: '18px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>{p.prenom} {p.nom}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
          {p.dateNaissance && `${calcAge(p.dateNaissance)} ans`}
          {p.dateCreation && ` · Suivi depuis ${fmtMois(new Date(p.dateCreation).getMonth() + 1, new Date(p.dateCreation).getFullYear())}`}
          {seancesPatient.length > 0 && ` · ${seancesPatient.length} séances`}
        </div>
      </div>

      {/* Progression */}
      {rows.length > 0 && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E0EEEE', padding: '16px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8FA8A8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Progression
          </div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E0EEEE' }}>
                <th style={{ textAlign: 'left', padding: '6px 0', color: '#8FA8A8', fontWeight: 600, fontSize: 11 }}>Test</th>
                <th style={{ textAlign: 'center', color: '#8FA8A8', fontWeight: 600, fontSize: 11 }}>Départ</th>
                <th style={{ textAlign: 'center', color: '#8FA8A8', fontWeight: 600, fontSize: 11 }}>Dernier</th>
                <th style={{ textAlign: 'center', color: '#8FA8A8', fontWeight: 600, fontSize: 11 }}>Évol.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const delta = r.lowerBetter ? r.v0 - r.v1 : r.v1 - r.v0;
                const ok = delta > 0;
                return (
                  <tr key={r.key} style={{ borderBottom: '1px solid #F4FAFA' }}>
                    <td style={{ padding: '8px 0', color: 'var(--color-ink)', fontWeight: 600 }}>{r.label}</td>
                    <td style={{ textAlign: 'center', color: '#94A3B8' }}>{r.v0.toFixed(1)}{r.unite}</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-ink)', fontWeight: 700 }}>{r.v1.toFixed(1)}{r.unite}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: ok ? '#22C55E' : '#6B7280', fontWeight: 700 }}>{ok ? '✅' : '➡️'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dernières séances */}
      {seancesPatient.length > 0 && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E0EEEE', padding: '16px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8FA8A8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Dernières séances
          </div>
          {seancesPatient.slice(0, 5).map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F4FAFA', fontSize: 13 }}>
              <span style={{ color: 'var(--color-ink)' }}>· {fmtCourt(s.date)}</span>
              <span style={{ color: '#22C55E', fontWeight: 700 }}>✅ Réalisée</span>
            </div>
          ))}
        </div>
      )}

      {/* Programme */}
      {programmeActif && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E0EEEE', padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8FA8A8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Programme en cours
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)', marginBottom: 8 }}>🏋️ {programmeActif.titre}</div>
          {programmeActif.objectif && <div style={{ fontSize: 13, color: 'var(--color-ink-2)', fontStyle: 'italic' }}>🎯 {programmeActif.objectif}</div>}
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

type Tab = 'patients' | 'seances' | 'facturation';

export default function PortailStructure() {
  const { token, patientId } = useParams<{ token: string; patientId?: string }>();
  const [structure, setStructure] = useState<{ id: string; nom: string; actif: boolean; tarifSeance: number } | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [seances, setSeances] = useState<Seance[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
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
    <div style={{ maxWidth: 600, margin: '0 auto', background: C.bg, minHeight: '100vh', fontFamily: "var(--font-sans)" }}>
      <div style={{ background: C.dark, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => setSelectedPatient(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 22 }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{selectedPatient.prenom} {selectedPatient.nom}</div>
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

  const TABS: { id: Tab; label: string }[] = [
    { id: 'patients',    label: `👥 Mes patients (${participants.length})` },
    { id: 'seances',     label: '📅 Séances' },
    { id: 'facturation', label: '💶 Facturation' },
  ];

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', background: C.bg, minHeight: '100vh', fontFamily: "var(--font-sans)", paddingBottom: 24 }}>

      {/* Header */}
      <div style={{ background: C.dark, padding: '16px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Suivi APA · Accès lecture seule</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>{structure.nom}</div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: `1px solid ${C.border}`, display: 'flex', position: 'sticky', top: 52, zIndex: 10 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '12px 6px', background: 'none', border: 'none',
            borderBottom: tab === t.id ? `2px solid ${C.teal}` : '2px solid transparent',
            color: tab === t.id ? C.teal : C.muted, fontWeight: tab === t.id ? 700 : 400,
            fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>

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
                const derniere = seancesP.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
                const statut = statutPatient(p, seancesP);
                return (
                  <div key={p.id} style={{
                    background: 'white', border: `1px solid ${C.border}`, borderRadius: 16,
                    padding: 16, marginBottom: 10,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%', background: C.teal,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', fontWeight: 700, fontSize: 14, flexShrink: 0,
                        }}>
                          {p.prenom[0]}{p.nom[0]}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{p.prenom} {p.nom}</div>
                          {p.dateNaissance && <div style={{ fontSize: 12, color: C.muted }}>{calcAge(p.dateNaissance)} ans</div>}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: statut.color, background: `${statut.color}18`, padding: '3px 8px', borderRadius: 20 }}>
                        {statut.emoji} {statut.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                      {derniere ? `Dernière séance : ${fmtCourt(derniere.date)}` : 'Aucune séance'}
                    </div>
                    <button
                      onClick={() => setSelectedPatient(p)}
                      style={{ fontSize: 12, fontWeight: 600, color: C.teal, background: 'none', border: `1px solid ${C.teal}30`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
                    >
                      Voir les progrès →
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
                <div style={{ color: C.muted, fontSize: 13 }}>Aucune séance ce mois.</div>
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
            {derniers6Mois.slice(0, 4).map(m => {
              const nb = seances.filter(s => s.date.startsWith(m) && s.statut === 'realisee').length;
              const pct = participants.length > 0 ? Math.round((nb / (participants.length * 4)) * 100) : 0;
              return (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.bg}`, fontSize: 13 }}>
                  <span style={{ color: C.dark }}>{MOIS_COURTS[parseInt(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</span>
                  <span style={{ color: C.muted }}>{nb} séances · {participants.length} patients · {pct}% présence</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Onglet Facturation */}
        {tab === 'facturation' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              Facturation
            </div>
            {factures.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
                Aucune facture disponible.
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
      </div>
    </div>
  );
}
