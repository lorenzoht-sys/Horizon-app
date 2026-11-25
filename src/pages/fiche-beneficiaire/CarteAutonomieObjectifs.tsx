import { Pencil } from 'lucide-react';
import type { Participant } from '../../types';
import { aidesMobiliteDepuis, sansEmoji } from '../../lib/formulaireBeneficiaire';

// Compte rendu de Pierre (25/11/2026) : objectifs, aides à la mobilité,
// matériel, GIR et situation de vie étaient saisis dans le formulaire mais
// affichés nulle part dans la fiche. Il fallait les redemander au
// bénéficiaire en préparant un programme. Même carte sur ordinateur et
// téléphone (la fiche est une interface unique).

const NB_OBJECTIFS_PRIORITAIRES = 3;

export function CarteAutonomieObjectifs({ participant, onModifier }: {
  participant: Participant;
  onModifier: () => void;
}) {
  const anamnese = participant.anamnese;
  const autonomie = anamnese?.autonomie;
  const brut = participant.objectifsPatient;
  const objectifs = (Array.isArray(brut) ? brut : brut ? [brut] : []).filter(o => o.trim() !== '');
  const aides = aidesMobiliteDepuis(autonomie);
  const sansAide = aides.length === 0 && autonomie?.aideMarche === 'Aucune';
  const materiel = (anamnese?.activitePhysique?.materielDisponible ?? []).filter(m => m.trim() !== '');
  const gir = autonomie?.gir?.niveau ?? null;
  const origine = anamnese?.cognition?.origineDemarche;
  const origineTexte = origine
    ? sansEmoji(origine) === 'Autre' && anamnese?.cognition?.origineDemarcheDetail
      ? anamnese.cognition.origineDemarcheDetail
      : sansEmoji(origine)
    : null;
  const aideDomicile = autonomie?.aideADomicile === 'oui'
    ? ['oui', (autonomie.aideADomicileTypes ?? []).filter(Boolean).join(', '), autonomie.aideADomicileFrequence?.toLowerCase()].filter(Boolean).join(' · ')
    : autonomie?.aideADomicile === 'non' ? 'non' : null;

  const lignes = ([
    autonomie?.situationVie && { terme: 'Vit', texte: autonomie.situationVie.toLowerCase() },
    aideDomicile && { terme: 'Aide à domicile', texte: aideDomicile },
    gir != null && { terme: 'GIR', texte: `${gir}${autonomie?.gir?.mode === 'calcule' ? ' (estimation)' : ''}` },
    origineTexte && { terme: 'Démarche', texte: origineTexte },
    participant.personneContact && { terme: 'Proche', texte: participant.personneContact },
    participant.codePortail && { terme: 'Digicode', texte: participant.codePortail },
  ] as ({ terme: string; texte: string } | false | null | undefined | '')[]).filter((l): l is { terme: string; texte: string } => Boolean(l));

  if (objectifs.length === 0 && aides.length === 0 && !sansAide && materiel.length === 0 && lignes.length === 0) return null;

  return (
    <div className="bg-white rounded-[18px] p-4 sm:p-5 shadow-sm" style={{ border: '1px solid #E2EEEE' }} data-testid="carte-autonomie-objectifs">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--color-ink-2)' }}>Objectifs et mode de vie</div>
        <button
          onClick={onModifier}
          className="text-[12px] font-semibold hover:text-primary flex items-center gap-1 transition-colors"
          style={{ color: 'var(--color-ink-2)' }}
        >
          <Pencil size={12} aria-hidden="true" /> Modifier
        </button>
      </div>

      {objectifs.length > 0 && (
        <div className="mb-4">
          <Titre>Objectifs</Titre>
          <ol className="space-y-1">
            {objectifs.map((o, i) => (
              <li key={`${o}-${i}`} className="flex gap-2 text-[13px] leading-relaxed" style={{ color: '#3D4C5A' }}>
                <span className="w-4 flex-shrink-0 font-bold" style={{ color: 'var(--color-ink)' }}>{i + 1}.</span>
                <span className={i < NB_OBJECTIFS_PRIORITAIRES ? 'font-semibold' : ''} style={i < NB_OBJECTIFS_PRIORITAIRES ? { color: 'var(--color-ink)' } : undefined}>
                  {sansEmoji(o)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(aides.length > 0 || sansAide) && (
        <div className="mb-4">
          <Titre>Aides à la mobilité</Titre>
          {sansAide ? (
            <p className="text-[13px]" style={{ color: '#3D4C5A' }}>Aucune</p>
          ) : (
            <p className="text-[13px] leading-relaxed" style={{ color: '#3D4C5A' }}>
              <span className="font-semibold" style={{ color: 'var(--color-ink)' }}>{aides[0]}</span>
              {aides.length > 1 && <> (principale) · {aides.slice(1).join(' · ')}</>}
            </p>
          )}
        </div>
      )}

      {materiel.length > 0 && (
        <div className="mb-4">
          <Titre>Matériel à disposition</Titre>
          <div className="flex flex-wrap gap-1.5">
            {materiel.map(m => (
              <span key={m} className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: '#F2F6F8', color: '#3D4C5A' }}>{m}</span>
            ))}
          </div>
        </div>
      )}

      {lignes.length > 0 && (
        <div className="space-y-2">
          {lignes.map(l => (
            <div key={l.terme} className="flex gap-2 text-[13px] leading-relaxed" style={{ color: '#3D4C5A' }}>
              <span className="flex-shrink-0 font-bold" style={{ color: 'var(--color-ink)' }}>{l.terme}</span>
              <span>{l.texte}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Titre({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 mb-1.5">{children}</div>;
}
