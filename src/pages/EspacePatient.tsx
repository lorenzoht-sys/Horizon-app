import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import type { Participant, Seance, Bilan, Programme, ProgrammeV2, ProgrammeSeanceV2, JourProgramme } from '../types';
import { dbToParticipant, dbToBilan, dbToSeance, dbToProgramme } from '../lib/mappers';
import { type CoursPatientRecord, type ReponseAnnonceeCours } from '../lib/coursPatient';
import { patientFetchMe, patientLogin } from '../lib/patientApi';
import { type FacturePatient } from '../lib/facturesPatient';
import { getSessionPatient, sauvegarderSessionPatient, purgerSessionPatient } from '../hooks/useAccesPatients';
import CarteErreurPatient from '../components/patient/CarteErreurPatient';
import { EcranAccueil } from './espace-patient/EcranAccueil';
import { EcranActivites } from './espace-patient/EcranActivites';
import { EcranDocuments } from './espace-patient/EcranDocuments';
import { EcranProgramme } from './espace-patient/EcranProgramme';
import { EcranProgres } from './espace-patient/EcranProgres';
import { C, type ExerciceLibreActifRecord, type ExerciceLibreValidationRecord, type SeancePatientRecord, type Tab, type TestEtalonResultatRecord } from './espace-patient/communs';

const TABS_CONFIG: { id: Tab; emoji: string; label: string }[] = [
  { id: 'accueil',    emoji: '🏠', label: 'Accueil' },
  { id: 'progres',   emoji: '📊', label: 'Progrès' },
  { id: 'programme', emoji: '🏋️', label: 'Programme & Activités' },
  { id: 'documents', emoji: '📋', label: 'Documents' },
];

// ── Page principale ───────────────────────────────────────────────────────────

export default function EspacePatient() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  // QR code praticien → lien direct /patient/:id?code=xxxx (re-login serveur,
  // écrase une session existante : gère le cas "appareil partagé" quand un
  // autre patient scanne son propre QR code sur le même appareil).
  const codeUrl = searchParams.get('code');
  // Accès direct depuis la fiche patient côté praticien (bouton "Voir l'espace
  // patient") : token déjà signé par /api/patient/session (accès délégué,
  // sans code à saisir). sessionStorage (et non localStorage) garde la trace de
  // cette origine pour le bandeau "Vous consultez l'espace de ..." même après
  // un rechargement de l'onglet, sans la faire fuiter vers d'autres appareils.
  const ptokenUrl = searchParams.get('ptoken');
  const [viaPraticien] = useState(() =>
    Boolean(ptokenUrl) || (id ? sessionStorage.getItem(`horizon_patient_via_praticien_${id}`) === '1' : false)
  );

  const [loading, setLoading]           = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  // Distingue deux échecs qui n'appellent ni le même message ni la même
  // action de récupération : une panne réseau (déjà catchée dans
  // patientApi.ts, `status === 0`) n'a rien à voir avec le bénéficiaire ni
  // son code, alors que `accessDenied` (401, mauvais code) le renvoie à bon
  // droit ressaisir un code. Une erreur de mapping après un fetch réussi
  // (données malformées) est un bug applicatif, journalisé en conséquence.
  const [erreurChargement, setErreurChargement] = useState<{ source: 'reseau' | 'mapping'; detail?: string } | null>(null);
  const [token, setToken]               = useState<string | null>(null);
  const [participant, setParticipant]   = useState<Participant | null>(null);
  const [praticienPrenom, setPraticienPrenom] = useState<string | null>(null);
  const [seances, setSeances]           = useState<Seance[]>([]);
  function majSignalementAbsence(seanceId: string, valeur: string | null) {
    setSeances(prev => prev.map(s => (s.id === seanceId ? { ...s, absenceSignaleeLe: valeur ?? undefined } : s)));
  }
  const [coursCollectifs, setCoursCollectifs] = useState<CoursPatientRecord[]>([]);
  function majAnnonce(coursId: string, reponse: ReponseAnnonceeCours | null) {
    setCoursCollectifs(prev => prev.map(c => (c.coursId === coursId ? { ...c, presenceAnnoncee: reponse } : c)));
  }
  const [bilans, setBilans]             = useState<Bilan[]>([]);
  const [programmes, setProgrammes]     = useState<Programme[]>([]);
  const [programmesV2, setProgrammesV2] = useState<ProgrammeV2[]>([]);
  const [documentsPatient, setDocumentsPatient] = useState<{ id: string; titre: string; contenu: string; date_creation: string }[]>([]);
  const [factures, setFactures] = useState<FacturePatient[]>([]);
  const [seancesPatient, setSeancesPatient]     = useState<SeancePatientRecord[]>([]);
  const [seancesAutonomesCount, setSeancesAutonomesCount] = useState<Record<string, number>>({});
  const [testsEtalonsActifs, setTestsEtalonsActifs] = useState<string[]>([]);
  const [testsEtalonsResultats, setTestsEtalonsResultats] = useState<TestEtalonResultatRecord[]>([]);
  const [exercicesLibresActifs, setExercicesLibresActifs] = useState<ExerciceLibreActifRecord[]>([]);
  const [exercicesLibresValidations, setExercicesLibresValidations] = useState<ExerciceLibreValidationRecord[]>([]);
  const [tab, setTab]                   = useState<Tab>('accueil');

  useEffect(() => {
    if (!id) { setAccessDenied(true); setLoading(false); return; }

    async function resoudreToken(): Promise<string | null> {
      if (ptokenUrl && id) {
        sessionStorage.setItem(`horizon_patient_via_praticien_${id}`, '1');
        sauvegarderSessionPatient({ patientId: id, token: ptokenUrl });
        return ptokenUrl;
      }
      if (codeUrl) {
        const result = await patientLogin(codeUrl);
        if ('error' in result || result.participantId !== id) return null;
        sauvegarderSessionPatient({ patientId: result.participantId, token: result.token });
        return result.token;
      }
      const session = getSessionPatient();
      if (session?.token && session.patientId === id) return session.token;
      return null;
    }

    async function charger() {
      const tok = await resoudreToken();
      if (!tok) { setAccessDenied(true); setLoading(false); return; }

      const result = await patientFetchMe(tok);
      if (!result.ok) {
        // status === 0 : patientFetchMe a catché une erreur réseau (fetch qui
        // rejette), pas une réponse du serveur. Rien à voir avec le code du
        // bénéficiaire — le renvoyer le ressaisir sur /patient serait
        // trompeur (voir docs/PLAN-BETA.md, lot EspacePatient). Toute autre
        // valeur (401, 403, 500…) est une vraie réponse serveur, traitée
        // comme avant.
        if (result.status === 0) {
          setErreurChargement({ source: 'reseau' });
          setLoading(false);
          return;
        }
        if (result.status === 401) purgerSessionPatient();
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      setToken(tok);
      const data = result.data;

      try {
      setParticipant(dbToParticipant(data.participant));
      setPraticienPrenom(data.praticienPrenom ?? null);
      setBilans(data.bilans.map(dbToBilan));
      setSeances(data.seances.map(dbToSeance));
      setCoursCollectifs(data.coursCollectifs ?? []);

      const allProgs = data.programmes;
      setProgrammes(allProgs.map(dbToProgramme));

      // Programmes V2 (avec type != null) + leurs séances/planning/exercices
      const v2Rows = allProgs.filter((p: Record<string, unknown>) => p.type != null);
      if (v2Rows.length > 0) {
        const seanceRows = data.programmeSeances;
        const planningRows = data.programmePlanning;
        const exerciceRows = data.programmeExercices;

        const v2Programmes: ProgrammeV2[] = v2Rows.map((progRow: Record<string, unknown>) => {
          const progSeances = seanceRows
            .filter((s: Record<string, unknown>) => s.programme_id === progRow.id)
            .map((s: Record<string, unknown>) => ({
              id: s.id as string,
              programmeId: s.programme_id as string,
              nom: (s.nom as string) ?? '',
              description: (s.description as string | null) ?? undefined,
              ordre: (s.ordre as number) ?? 0,
              exercices: exerciceRows
                .filter((e: Record<string, unknown>) => e.seance_id === s.id)
                .map((e: Record<string, unknown>) => ({
                  id: e.id as string,
                  seanceId: e.seance_id as string,
                  nom: (e.nom as string) ?? '',
                  categorie: (e.categorie as string | null) ?? undefined,
                  description: (e.description as string | null) ?? undefined,
                  conseilSecurite: (e.conseil_securite as string | null) ?? undefined,
                  series: (e.series as number | null) ?? undefined,
                  repetitions: (e.repetitions as number | null) ?? undefined,
                  dureeSecondes: (e.duree_secondes as number | null) ?? undefined,
                  ordre: (e.ordre as number) ?? 0,
                })),
            })) as ProgrammeSeanceV2[];

          const progPlanning = planningRows
            .filter((p: Record<string, unknown>) => p.programme_id === progRow.id)
            .map((p: Record<string, unknown>) => ({
              id: p.id as string,
              programmeId: p.programme_id as string,
              seanceId: p.seance_id as string,
              jour: p.jour as JourProgramme,
            }));

          return {
            id: progRow.id as string,
            participantId: progRow.participant_id as string,
            nom: (progRow.nom as string | null) ?? (progRow.titre as string | null) ?? '',
            objectif: (progRow.objectif as string | null) ?? undefined,
            messageMotivation: (progRow.message_motivation as string | null) ?? undefined,
            type: ((progRow.type as string) ?? 'domicile') as ProgrammeV2['type'],
            actif: (progRow.actif as boolean) ?? true,
            createdAt: (progRow.created_at as string | null) ?? (progRow.date_creation as string | null) ?? '',
            seances: progSeances,
            planning: progPlanning,
            objectifSeancesAutonomes: (progRow.objectif_seances_autonomes as number | null) ?? undefined,
          } as ProgrammeV2;
        });

        setProgrammesV2(v2Programmes);
      }

      setSeancesAutonomesCount(data.seancesAutonomesCount ?? {});
      setTestsEtalonsActifs(data.testsEtalonsActifs ?? []);
      setTestsEtalonsResultats((data.testsEtalonsResultats ?? []).map(r => ({
        id: r.id, testId: r.test_id, valeur: r.valeur, dateTest: r.date_test,
      })));
      setExercicesLibresActifs((data.exercicesLibresActifs ?? []).map(r => ({
        id: r.id, exerciceId: r.exercice_id, nom: r.nom,
        description: r.description, consigneSecurite: r.consigne_securite,
      })));
      setExercicesLibresValidations((data.exercicesLibresValidations ?? []).map(r => ({
        exerciceId: r.exercice_id, date: r.date, fait: r.fait,
      })));

      setDocumentsPatient(data.documentsPatient);
      setFactures(data.factures ?? []);

      // Historique des séances patient (dernières 15)
      const spRows = data.seancesPatient;
      const erRows = data.exercicesRealises;
      setSeancesPatient(spRows.map((sp: Record<string, unknown>) => {
        const items = erRows.filter(e => e.seance_patient_id === sp.id);
        return {
          id: sp.id as string,
          programmeId: sp.programme_id as string,
          seanceId: sp.seance_id as string,
          dateSeance: sp.date_seance as string,
          statut: (sp.statut as SeancePatientRecord['statut']) ?? 'en_cours',
          commentairePatient: (sp.commentaire_patient as string | null) ?? null,
          dureeMinutes: (sp.duree_minutes as number | null) ?? null,
          nbRealises: items.filter(e => e.realise).length,
          nbTotal: items.length,
        };
      }));
      } catch (err) {
        // Données reçues du serveur, mais dont la forme a fait planter le
        // mapping (champ manquant, type inattendu…) — pas un problème de
        // réseau, un bug applicatif. Même pattern que ErrorBoundaryPatient
        // (console.error, pas d'appel Sentry direct : voir son commentaire
        // « Pas de dépendance à Sentry » — Sentry n'est pas utilisé
        // manuellement ailleurs côté bénéficiaire, aucune raison de commencer
        // ici. En production, si Sentry tourne, son propre hook global ne
        // captera PAS cette erreur puisqu'elle est interceptée ici et ne
        // remonte jamais comme rejet non géré).
        console.error('[espace patient] échec du traitement des données reçues :', err);
        setErreurChargement({ source: 'mapping', detail: err instanceof Error ? err.message : String(err) });
      } finally {
        setLoading(false);
      }
    }

    void charger();
  }, [id, codeUrl, ptokenUrl]);

  if (!id || accessDenied) return <Navigate to="/patient" replace />;

  if (erreurChargement) {
    return erreurChargement.source === 'reseau' ? (
      <CarteErreurPatient
        titre="La connexion a échoué"
        messagePrincipal="Votre code n'y est pour rien — c'est la connexion à internet qui a été interrompue pendant le chargement."
        messageSecondaire="Réessayez dans un instant. Si ça persiste, vérifiez votre connexion."
        onReessayer={() => window.location.reload()}
      />
    ) : (
      <CarteErreurPatient
        titre="L'application n'a pas réussi à s'afficher"
        messagePrincipal="Le problème vient de l'application, pas de vous, et vos données n'ont rien perdu."
        messageSecondaire="Réessayez maintenant. Si l'écran revient, prévenez votre enseignant en Activité Physique Adaptée : il saura quoi faire."
        detailTechnique={erreurChargement.detail}
        onReessayer={() => window.location.reload()}
      />
    );
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: C.dark,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "var(--font-sans)",
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🌊</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.teal, marginBottom: 6 }}>Chargement…</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Récupération de vos données</div>
        </div>
      </div>
    );
  }

  if (!participant || !token) return <Navigate to="/patient" replace />;

  return (
    <div style={{
      maxWidth: 600, margin: '0 auto',
      minHeight: '100vh',
      background: C.bg,
      fontFamily: "var(--font-sans)",
      fontSize: 14,
      paddingBottom: 72, // espace pour la nav bas
    }}>

      {/* HEADER COMPACT */}
      <div style={{
        background: C.dark,
        padding: '14px 16px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <img
          src="/logo-horizon.png"
          style={{ height: 22, flexShrink: 0 }}
          alt="Horizon"
          onError={e => { (e.target as HTMLImageElement).src = '/logo-horizon.svg'; }}
        />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {participant.prenom} {participant.nom}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
            Espace personnel · Horizon
          </div>
        </div>
      </div>

      {/* Bandeau "vue praticien" — évite toute confusion quand c'est le praticien qui consulte */}
      {viaPraticien && (
        <div style={{
          background: 'rgba(43,184,154,0.1)',
          borderBottom: '1px solid rgba(43,184,154,0.2)',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: 12, fontWeight: 600, color: 'var(--color-teal)',
        }}>
          👁 Vous consultez l'espace de {participant.prenom}
        </div>
      )}

      {/* CONTENU */}
      <div style={{ padding: '16px' }}>
        {tab === 'accueil' && (
          <EcranAccueil
            participant={participant}
            praticienPrenom={praticienPrenom}
            seances={seances}
            coursCollectifs={coursCollectifs}
            onAnnonce={majAnnonce}
            onSignalementAbsence={majSignalementAbsence}
            bilans={bilans}
            programmes={programmes}
            programmesV2={programmesV2}
            token={token}
          />
        )}
        {tab === 'progres' && <EcranProgres participant={participant} bilans={bilans} />}
        {tab === 'programme' && (
          <>
            <EcranProgramme participant={participant} programmes={programmes} programmesV2={programmesV2} historiqueSeances={seancesPatient} seancesAutonomesCount={seancesAutonomesCount} token={token} />
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                Activités complémentaires
              </div>
              <EcranActivites
                token={token}
                testsActifs={testsEtalonsActifs}
                resultats={testsEtalonsResultats}
                onNouveauResultat={r => setTestsEtalonsResultats(prev => [r, ...prev])}
                exercicesActifs={exercicesLibresActifs}
                validations={exercicesLibresValidations}
                onValidation={v => setExercicesLibresValidations(prev => [
                  v, ...prev.filter(p => !(p.exerciceId === v.exerciceId && p.date === v.date)),
                ])}
              />
            </div>
          </>
        )}
        {tab === 'documents' && (
          <EcranDocuments bilans={bilans} participant={participant} programmeActif={programmes.find(p => p.actif) ?? null} documentsPatient={documentsPatient} factures={factures} token={token} />
        )}
      </div>

      {/* NAVIGATION BAS DE PAGE */}
      <nav style={{
        position: 'fixed',
        bottom: 0, left: '50%',
        transform: 'translateX(-50%)',
        width: '100%', maxWidth: 600,
        background: 'white',
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        zIndex: 30,
        boxShadow: '0 -4px 16px rgba(13,43,43,0.08)',
      }}>
        {/* L'onglet « Progrès » est TOUJOURS proposé : il explique lui-même son
            état (aucun bilan, en attente de partage, pas encore comparable).
            L'ancien réglage visibilite.progression le masquait alors qu'il ne
            commandait aucune donnée — voir src/lib/partageBeneficiaire.ts. */}
        {TABS_CONFIG.filter(t => {
          const v = participant?.visibiliteBeneficiaire;
          if (t.id === 'programme') return v?.programme !== false;
          return true;
        }).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: '10px 4px 12px',
              background: 'none', border: 'none',
              borderTop: tab === t.id ? `2px solid ${C.teal}` : '2px solid transparent',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
              minHeight: 60,
            }}
          >
            <span style={{ fontSize: 20 }}>{t.emoji}</span>
            <span style={{
              fontSize: 10, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? C.teal : C.muted,
              letterSpacing: '0.01em',
            }}>
              {t.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
