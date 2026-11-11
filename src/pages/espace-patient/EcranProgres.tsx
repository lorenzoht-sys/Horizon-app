import type { Participant, Bilan } from '../../types';
import { getTestsAutonomie } from '../../lib/anamnese';
import { libelleSedentariteBeneficiaire, libelleFatigueBeneficiaire } from '../../lib/formulationBienveillante';
import { etatSedentarite, etatFatigue, getSedProfil, getFSSProfil } from '../../lib/scoresAutonomie';
import { etatProgresBeneficiaire } from '../../lib/partageBeneficiaire';
import { distanceTm6 } from '../../lib/tm6';
import { C, fmtCourt, fmtMoisAnnee } from './communs';

// ── ÉCRAN 2 — Mes progrès ─────────────────────────────────────────────────────

// Traduction des tests en langage patient
export const TEST_LABELS_PATIENT: Record<string, { label: string; emoji: string; description: string }> = {
  equilibre:  { label: 'Équilibre sur un pied',        emoji: '🦵', description: 'Durée d\'équilibre unipodal' },
  chairStand: { label: 'Force pour se lever',          emoji: '💪', description: 'Lever de chaise 30 secondes' },
  handGrip:   { label: 'Force des mains',              emoji: '✊', description: 'Préhension de la main' },
  tug:        { label: 'Vitesse de marche',            emoji: '🚶', description: 'Test de marche et demi-tour' },
  tm6:        { label: 'Endurance à la marche',        emoji: '🏃', description: 'Distance de marche en 6 minutes' },
};

export type ProgItem = {
  key: string;
  label: string;
  emoji: string;
  val0: number;
  val1: number;
  unite: string;
  lowerBetter: boolean;
};

export function calculerProgressions(bilanInitial: Bilan, dernierBilan: Bilan): ProgItem[] {
  const items: ProgItem[] = [];

  const eq0 = bilanInitial.equilibre?.droite, eq1 = dernierBilan.equilibre?.droite;
  if (eq0 != null && eq1 != null)
    items.push({ key: 'equilibre', ...TEST_LABELS_PATIENT.equilibre, val0: +eq0.toFixed(1), val1: +eq1.toFixed(1), unite: 's', lowerBetter: false });

  const cs0 = bilanInitial.chairStand30, cs1 = dernierBilan.chairStand30;
  if (cs0 != null && cs1 != null)
    items.push({ key: 'chairStand', ...TEST_LABELS_PATIENT.chairStand, val0: cs0, val1: cs1, unite: ' rép.', lowerBetter: false });

  const hg0 = bilanInitial.handGrip?.droite, hg1 = dernierBilan.handGrip?.droite;
  if (hg0 != null && hg1 != null)
    items.push({ key: 'handGrip', ...TEST_LABELS_PATIENT.handGrip, val0: +hg0.toFixed(1), val1: +hg1.toFixed(1), unite: ' kg', lowerBetter: false });

  const tug0 = bilanInitial.tug3m, tug1 = dernierBilan.tug3m;
  if (tug0 != null && tug1 != null)
    items.push({ key: 'tug', ...TEST_LABELS_PATIENT.tug, val0: +tug0.toFixed(1), val1: +tug1.toFixed(1), unite: 's', lowerBetter: true });

  const tm0 = distanceTm6(bilanInitial.tm6), tm1 = distanceTm6(dernierBilan.tm6);
  if (tm0 != null && tm1 != null)
    items.push({ key: 'tm6', ...TEST_LABELS_PATIENT.tm6, val0: tm0, val1: tm1, unite: ' m', lowerBetter: false });

  return items;
}

export function CarteProgression({ item }: { item: ProgItem }) {
  const delta = item.lowerBetter ? item.val0 - item.val1 : item.val1 - item.val0;
  const improved = delta > 0;
  const stable = Math.abs(delta) < 0.1;
  const regression = delta < -0.1;

  // Barre de progression : représente l'amélioration relative
  const ref = Math.max(Math.abs(item.val0), 0.1);
  const rawPct = Math.min(Math.abs(delta) / ref * 100, 100);
  const barPct = improved ? rawPct : stable ? 50 : rawPct;

  const barColor = improved ? C.green : stable ? C.gray : C.orange;

  const deltaAbs = Math.abs(+delta.toFixed(1));
  const message = improved
    ? `Vous avez gagné ${deltaAbs}${item.unite.trim()} ! 🎉`
    : stable
    ? 'On continue à travailler dessus 💪'
    : `Encore ${deltaAbs}${item.unite.trim()} à récupérer — c'est le chemin !`;

  const badge = improved ? '✅ Progression' : stable ? '➡️ Stable' : '⬇️ En cours';

  return (
    <div style={{
      background: 'white', border: `1px solid ${C.border}`,
      borderRadius: 18, overflow: 'hidden',
    }}>
      {/* En-tête */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{item.emoji}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{item.label}</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
          background: improved ? '#DCFCE7' : stable ? '#F1F5F9' : '#FEF3C7',
          color: improved ? C.green : stable ? C.gray : C.orange,
        }}>
          {badge}
        </span>
      </div>
      {/* Corps */}
      <div style={{ padding: '14px 16px' }}>
        {/* Valeurs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Départ</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#94A3B8' }}>{item.val0}{item.unite}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 16, color: C.muted }}>→</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Aujourd'hui</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.dark }}>{item.val1}{item.unite}</div>
          </div>
        </div>
        {/* Barre */}
        <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            height: '100%',
            width: `${Math.max(barPct, 4)}%`,
            background: barColor,
            borderRadius: 4,
            transition: 'width 0.8s ease',
          }} />
        </div>
        {/* Message */}
        <div style={{ fontSize: 13, color: improved ? C.green : regression ? C.orange : C.muted }}>
          {message}
        </div>
      </div>
    </div>
  );
}

/**
 * Questionnaire entamé mais incomplet, côté bénéficiaire.
 *
 * Aucun score n'est affiché : un total calculé sur des réponses manquantes
 * serait indistinguable d'un résultat fiable (src/lib/scoresAutonomie.ts).
 * On dit qu'il manque des réponses, sans chiffre et sans jugement — et sans
 * demander au bénéficiaire une action qui revient au praticien.
 */
export function LigneQuestionnaireIncomplet({ libelle }: { libelle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 13, color: C.muted }}>{libelle}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#BA7517' }}>
        Questionnaire à compléter ⏳
      </span>
    </div>
  );

}
/** Page « Progrès » sans contenu à montrer. Le texte dit POURQUOI elle est
 *  vide : « aucun bilan » et « bilans non partagés » se ressemblent à l'écran
 *  mais ne veulent pas dire la même chose. */
export function EtatVideProgres({ emoji, titre, texte }: { emoji: string; titre: string; texte: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{emoji}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
        {titre}
      </div>
      <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
        {texte}
      </div>
    </div>
  );
}


export function EcranProgres({ participant, bilans }: { participant: Participant; bilans: Bilan[] }) {
  const sorted = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const bilanInitial = sorted.find(b => b.type === 'initial') ?? sorted[0] ?? null;
  const dernierBilan = sorted[sorted.length - 1] ?? null;
  const { sedentarite, fatigue } = getTestsAutonomie(participant, bilanInitial);

  // ── Profil affiché seulement si le questionnaire est COMPLET ────────────
  //
  // Cet écran lisait `sedentarite.profil` / `fatigue.profil`, c'est-à-dire les
  // valeurs STOCKÉES. Celles calculées avant le 2026-09-14 comptaient les
  // réponses manquantes comme des zéros (Ricci & Gagnon) ou les ignoraient
  // (FSS) : un questionnaire à moitié rempli produisait quand même un profil.
  //
  // Le correctif du matin a couvert la fiche praticien et le contexte de
  // l'assistant, pas cet écran-ci — le plus exposé, puisque c'est le
  // bénéficiaire lui-même qui lit. On dérive donc l'état des RÉPONSES, comme
  // ailleurs, et un questionnaire incomplet n'affiche aucun profil.
  //
  // Réponses absentes : `etat` vaut 'vide' et rien ne s'affiche — c'est aussi
  // le cas quand le praticien n'a pas partagé ces résultats (api/patient/me.ts
  // retire les trois clés ensemble). Ce silence est voulu : ne rien dire d'un
  // résultat non partagé.
  const etatSed = etatSedentarite(sedentarite.reponses);
  const etatFss = etatFatigue(fatigue.reponses);
  const sedLibelle = etatSed.etat === 'complet'
    ? libelleSedentariteBeneficiaire(getSedProfil(etatSed.score).profil)
    : null;
  const fssLibelle = etatFss.etat === 'complet'
    ? libelleFatigueBeneficiaire(getFSSProfil(etatFss.score).profil)
    : null;
  // « À régulariser » s'adresse au praticien : le bénéficiaire ne peut pas
  // régulariser son propre questionnaire. Même état, registre de l'écran.
  const sedIncomplet = etatSed.etat === 'a_regulariser';
  const fssIncomplet = etatFss.etat === 'a_regulariser';
  const afficheProfil = sedLibelle || fssLibelle || sedIncomplet || fssIncomplet;

  const hasDeux = bilanInitial && dernierBilan && bilanInitial.id !== dernierBilan.id;
  const progressions = hasDeux ? calculerProgressions(bilanInitial!, dernierBilan!) : [];
  const nProgressed = progressions.filter(p =>
    (p.lowerBetter ? p.val0 - p.val1 : p.val1 - p.val0) > 0
  ).length;

  // Pourquoi la page est vide, quand elle l'est. Quatre causes distinctes, qui
  // n'appellent ni le même message ni la même action — voir
  // src/lib/partageBeneficiaire.ts.
  const etatPage = etatProgresBeneficiaire(bilans, progressions.length);

  if (etatPage.etat === 'aucun_bilan') {
    return (
      <EtatVideProgres
        emoji="📊"
        titre="Pas encore de bilan"
        texte={<>Votre premier bilan permettra de mesurer<br />vos capacités de départ.</>}
      />
    );
  }

  // Des bilans existent, rien n'est partagé. On dit qu'ils EXISTENT, jamais ce
  // qu'ils contiennent : le partage appartient au praticien, pas à cet écran.
  if (etatPage.etat === 'en_attente_partage') {
    return (
      <EtatVideProgres
        emoji="🔒"
        titre="Vos résultats ne sont pas encore partagés"
        texte={<>Votre praticien a réalisé un ou plusieurs bilans.<br />
          Il choisit quels résultats vous sont montrés ici.</>}
      />
    );
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Titre + dates */}
      <div style={{ background: C.dark, borderRadius: 18, padding: '18px 16px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'white', marginBottom: 4 }}>
          Votre évolution 📈
        </div>
        {hasDeux ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            De {fmtMoisAnnee(bilanInitial!.date)} à {fmtMoisAnnee(dernierBilan!.date)}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            1er bilan réalisé le {fmtCourt(bilanInitial.date)}
          </div>
        )}
      </div>

      {/* Cas un seul bilan */}
      {etatPage.etat === 'un_seul_bilan' && (
        <div style={{
          background: 'white', border: `1px solid ${C.border}`,
          borderRadius: 18, padding: '24px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌱</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
            Premier bilan enregistré !
          </div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            Votre prochain bilan permettra de mesurer<br />
            vos progrès depuis le départ.
          </div>
        </div>
      )}

      {/* Plusieurs bilans, des résultats partagés, mais aucun test partagé sur
          DEUX bilans : il n'y a pas de quoi tracer une courbe. Ne rien dire
          laisserait croire qu'il n'y a rien. */}
      {etatPage.etat === 'partage_non_comparable' && (
        <div style={{
          background: 'white', border: `1px solid ${C.border}`,
          borderRadius: 18, padding: '24px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
            Comparaison bientôt disponible
          </div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            Vos progrès s'afficheront dès qu'un même test<br />
            sera partagé sur deux bilans par votre praticien.
          </div>
        </div>
      )}

      {/* Cartes de progression */}
      {progressions.map(item => (
        <CarteProgression key={item.key} item={item} />
      ))}

      {/* Activité physique & Fatigue */}
      {afficheProfil && (
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 10 }}>
            Votre profil de forme
          </div>
          {sedLibelle && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Votre niveau d'activité</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: sedLibelle.color }}>
                {sedLibelle.label} {sedLibelle.emoji}
              </span>
            </div>
          )}
          {sedIncomplet && <LigneQuestionnaireIncomplet libelle="Votre niveau d'activité" />}
          {fssLibelle && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Votre fatigue</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: fssLibelle.color }}>
                {fssLibelle.label} {fssLibelle.emoji}
              </span>
            </div>
          )}
          {fssIncomplet && <LigneQuestionnaireIncomplet libelle="Votre fatigue" />}
          <p style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            {sedIncomplet || fssIncomplet
              ? 'Votre praticien complétera ce questionnaire avec vous lors d\'une prochaine séance.'
              : 'Votre praticien adapte vos séances en conséquence.'}
          </p>
        </div>
      )}

      {/* Message d'encouragement global */}
      {progressions.length > 0 && (
        <div style={{
          background: nProgressed > 0
            ? 'rgba(22,163,74,0.08)'
            : C.bg,
          border: `1px solid ${nProgressed > 0 ? 'rgba(22,163,74,0.2)' : C.border}`,
          borderRadius: 18, padding: '18px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>
            {nProgressed >= 3 ? '🌟' : nProgressed >= 1 ? '💪' : '🔄'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
            {nProgressed >= 3
              ? `Excellent ! Vous progressez sur ${nProgressed} domaine${nProgressed > 1 ? 's' : ''}.`
              : nProgressed >= 1
              ? `Vous progressez sur ${nProgressed} domaine${nProgressed > 1 ? 's' : ''} — continuez !`
              : 'Continuez à suivre votre programme. Les progrès arrivent !'}
          </div>
          <div style={{ fontSize: 13, color: C.muted }}>
            {bilans.length} bilan{bilans.length > 1 ? 's' : ''} réalisé{bilans.length > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
