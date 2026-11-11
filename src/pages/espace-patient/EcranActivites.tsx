import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { patientEnregistrerTestEtalon, patientMarquerExerciceLibre } from '../../lib/patientApi';
import { TESTS_ETALONS, getTestEtalon } from '../../data/testsEtalons';
import { C, type ExerciceLibreActifRecord, type ExerciceLibreValidationRecord, type TestEtalonResultatRecord, fmtCourt } from './communs';

// ── ÉCRAN — Activités hors programme (tests étalons & exercices libres) ────
// Complément ponctuel au programme structuré, jamais un remplacement. Rien
// n'apparaît ici sans activation explicite du praticien pour ce patient.

export function EcranActivites({
  token, testsActifs, resultats, onNouveauResultat,
  exercicesActifs, validations, onValidation,
}: {
  token: string;
  testsActifs: string[];
  resultats: TestEtalonResultatRecord[];
  onNouveauResultat: (r: TestEtalonResultatRecord) => void;
  exercicesActifs: ExerciceLibreActifRecord[];
  validations: ExerciceLibreValidationRecord[];
  onValidation: (v: ExerciceLibreValidationRecord) => void;
}) {
  const [testEnCours, setTestEnCours] = useState<string | null>(null);
  const [marquageEnCours, setMarquageEnCours] = useState<string | null>(null);
  const today = new Date().toISOString().split('T')[0];

  const testsActifsCatalog = TESTS_ETALONS.filter(t => testsActifs.includes(t.id));

  async function marquerFait(ex: ExerciceLibreActifRecord, fait: boolean) {
    setMarquageEnCours(ex.exerciceId);
    const result = await patientMarquerExerciceLibre(token, { exerciceId: ex.exerciceId, fait });
    setMarquageEnCours(null);
    if (result.ok) {
      onValidation({ exerciceId: ex.exerciceId, date: today, fait });
      if (fait) toast.success('Bravo, activité notée !');
    } else {
      toast.error(result.error ?? "Erreur d'enregistrement");
    }
  }

  if (testsActifsCatalog.length === 0 && exercicesActifs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 8 }}>Aucune activité complémentaire</div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
          Si votre praticien active un test ou un exercice<br />complémentaire, il apparaîtra ici.
        </div>
      </div>
    );
  }

  if (testEnCours) {
    const test = getTestEtalon(testEnCours);
    if (!test) { setTestEnCours(null); return null; }
    const historique = resultats.filter(r => r.testId === test.id).sort((a, b) => b.dateTest.localeCompare(a.dateTest));
    return (
      <TestEtalonModal
        token={token}
        test={test}
        dernierResultat={historique[0] ?? null}
        onAnnuler={() => setTestEnCours(null)}
        onEnregistre={r => { onNouveauResultat(r); setTestEnCours(null); }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {testsActifsCatalog.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Tests étalons
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {testsActifsCatalog.map(test => {
              const historique = resultats.filter(r => r.testId === test.id).sort((a, b) => b.dateTest.localeCompare(a.dateTest));
              const dernier = historique[0] ?? null;
              return (
                <div key={test.id} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 2 }}>{test.nom}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                    {dernier ? `Dernier résultat : ${dernier.valeur} ${test.unite} (${fmtCourt(dernier.dateTest)})` : 'Aucun résultat encore'}
                  </div>
                  <button
                    onClick={() => setTestEnCours(test.id)}
                    style={{ width: '100%', padding: '11px', background: C.teal, color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                  >
                    ▶ Faire ce test
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {exercicesActifs.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Activités complémentaires
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {exercicesActifs.map(ex => {
              const validationAujourdHui = validations.find(v => v.exerciceId === ex.exerciceId && v.date === today);
              const fait = validationAujourdHui?.fait ?? false;
              return (
                <div key={ex.id} style={{ background: 'white', border: `1px solid ${fait ? 'rgba(43,191,191,0.35)' : C.border}`, borderRadius: 16, padding: '14px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 2 }}>{ex.nom}</div>
                  {ex.description && (
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>{ex.description}</div>
                  )}
                  <button
                    onClick={() => marquerFait(ex, !fait)}
                    disabled={marquageEnCours === ex.exerciceId}
                    style={{
                      width: '100%', padding: '11px',
                      background: fait ? '#DCFCE7' : C.teal,
                      color: fait ? '#166534' : 'white',
                      border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      cursor: marquageEnCours === ex.exerciceId ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {fait ? '✓ Fait aujourd\'hui' : 'Fait aujourd\'hui'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export type EtapeTestEtalon = 'consigne' | 'chrono' | 'resultat';

export function TestEtalonModal({ token, test, dernierResultat, onAnnuler, onEnregistre }: {
  token: string;
  test: { id: string; nom: string; dureeSecondes: number; unite: string; consigne: string; consigneSecurite: string };
  dernierResultat: TestEtalonResultatRecord | null;
  onAnnuler: () => void;
  onEnregistre: (r: TestEtalonResultatRecord) => void;
}) {
  const [etape, setEtape] = useState<EtapeTestEtalon>('consigne');
  const [secondesRestantes, setSecondesRestantes] = useState(test.dureeSecondes);
  const [valeur, setValeur] = useState(0);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (etape !== 'chrono') return;
    const debut = performance.now();
    const interval = setInterval(() => {
      const ecoule = (performance.now() - debut) / 1000;
      const restant = Math.max(0, test.dureeSecondes - ecoule);
      setSecondesRestantes(restant);
      if (restant <= 0) {
        clearInterval(interval);
        setEtape('resultat');
      }
    }, 100);
    return () => clearInterval(interval);
  }, [etape, test.dureeSecondes]);

  async function valider() {
    setSaving(true);
    setErreur(null);
    const result = await patientEnregistrerTestEtalon(token, { testId: test.id, valeur });
    setSaving(false);
    if (!result.ok) {
      setErreur(result.error ?? "L'enregistrement a échoué. Réessayez.");
      return;
    }
    onEnregistre({ id: `local-${Date.now()}`, testId: test.id, valeur, dateTest: new Date().toISOString().split('T')[0] });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: C.bg, zIndex: 200,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '32px 24px',
      maxWidth: 600, margin: '0 auto', fontFamily: 'var(--font-sans)',
    }}>
      {etape === 'consigne' && (
        <>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, marginBottom: 16, textAlign: 'center' }}>{test.nom}</div>
          <div style={{ width: '100%', background: 'white', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 14, fontSize: 14, color: C.dark, lineHeight: 1.6 }}>
            {test.consigne}
          </div>
          <div style={{ width: '100%', background: '#FFF7E6', border: '1px solid #FDE68A', borderRadius: 14, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#92400E', lineHeight: 1.6 }}>
            ⚠️ {test.consigneSecurite}
          </div>
          {dernierResultat && (
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, textAlign: 'center' }}>
              La dernière fois : <strong style={{ color: C.dark }}>{dernierResultat.valeur} {test.unite}</strong>
            </div>
          )}
          <button onClick={() => setEtape('chrono')} style={{ width: '100%', padding: '18px', background: C.teal, color: 'white', border: 'none', borderRadius: 16, fontSize: 16, fontWeight: 800, cursor: 'pointer', marginBottom: 12 }}>
            ▶ Démarrer
          </button>
          <button onClick={onAnnuler} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.muted, padding: 8 }}>
            Annuler
          </button>
        </>
      )}

      {etape === 'chrono' && (
        <>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 8, textAlign: 'center' }}>{test.nom}</div>
          <div style={{
            fontFamily: 'monospace', fontSize: 72, fontWeight: 800, color: C.dark,
            marginBottom: 24,
          }}>
            {Math.ceil(secondesRestantes)}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 32, textAlign: 'center' }}>
            Comptez vos {test.unite}. Arrêtez à tout moment en cas de gêne.
          </div>
          <button onClick={onAnnuler} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 12, cursor: 'pointer', fontSize: 13, color: C.muted, padding: '10px 20px' }}>
            Annuler le test
          </button>
        </>
      )}

      {etape === 'resultat' && (
        <>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏰</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.dark, marginBottom: 20, textAlign: 'center' }}>
            Temps écoulé ! Combien de {test.unite} ?
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
            <button onClick={() => setValeur(v => Math.max(0, v - 1))} style={{ width: 48, height: 48, borderRadius: '50%', border: `1px solid ${C.border}`, background: 'white', fontSize: 22, fontWeight: 700, color: C.dark, cursor: 'pointer' }}>−</button>
            <div style={{ fontSize: 48, fontWeight: 800, color: C.dark, minWidth: 80, textAlign: 'center' }}>{valeur}</div>
            <button onClick={() => setValeur(v => v + 1)} style={{ width: 48, height: 48, borderRadius: '50%', border: `1px solid ${C.border}`, background: 'white', fontSize: 22, fontWeight: 700, color: C.dark, cursor: 'pointer' }}>+</button>
          </div>
          {dernierResultat && (
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20, textAlign: 'center' }}>
              La dernière fois : {dernierResultat.valeur} — aujourd'hui : <strong style={{ color: valeur >= dernierResultat.valeur ? C.green : C.dark }}>{valeur}</strong>
            </div>
          )}
          {erreur && (
            <div style={{ width: '100%', background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 12 }}>
              😕 {erreur}
            </div>
          )}
          <button onClick={valider} disabled={saving} style={{ width: '100%', padding: '18px', background: saving ? C.muted : C.teal, color: 'white', border: 'none', borderRadius: 16, fontSize: 16, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 12 }}>
            {saving ? 'Enregistrement…' : '💾 Valider'}
          </button>
          <button onClick={onAnnuler} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.muted, padding: 8 }}>
            Annuler
          </button>
        </>
      )}
    </div>
  );
}
