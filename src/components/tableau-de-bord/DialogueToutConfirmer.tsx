import { useEffect, useRef } from 'react';
import type { PlanConfirmation } from '../../lib/confirmationGroupee';
import { libelleMois } from '../../lib/confirmationGroupee';

// « Tout confirmer » (retour de Pierre du 2026-11-24) : confirmation préalable détaillée, partagée
// par le tableau de bord et l'accueil mobile. Le praticien voit, avant d'écrire, ce qui entre dans
// ses factures (séances et montant par mois) et ce qui est laissé de côté, et pourquoi.

const euros = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`;

export function DialogueToutConfirmer({ plan, enCours, avancement, onConfirmer, onAnnuler }: {
  plan: PlanConfirmation;
  enCours: boolean;
  /** Séances déjà enregistrées pendant l'écriture. */
  avancement: number;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  const confirmer = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirmer.current?.focus(); }, []);
  const n = plan.aConfirmer.length;
  const laissees = plan.moisFactures.length + plan.absences.length;
  return (
    // Même z-index que DialogueConfirmation : au-dessus de la barre de navigation mobile (100).
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-black/40"
      onClick={enCours ? undefined : onAnnuler}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="tout-confirmer-titre"
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-white rounded-[20px] shadow-2xl p-5 flex flex-col gap-3.5"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape' && !enCours) onAnnuler(); }}>
        <h2 id="tout-confirmer-titre" className="m-0 text-base font-extrabold" style={{ color: 'var(--color-ink)' }}>
          {n === 0 ? 'Aucune séance à confirmer en groupe' : `Confirmer que ces ${n} séance${n > 1 ? 's ont' : ' a'} bien eu lieu ?`}
        </h2>

        {n > 0 && (
          <>
            <p className="m-0 text-sm" style={{ color: '#3D4C5A' }}>
              Elles passeront en « réalisée » et entreront dans la facture de leur mois. Une séance qui n’a pas eu lieu
              doit d’abord être annulée dans l’agenda.
            </p>
            <ul className="list-none m-0 p-0 rounded-[14px] overflow-hidden" style={{ border: '1px solid #E2EEEE' }}>
              {plan.parMois.map((m, i) => (
                <li key={m.mois} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #EEF4F4' }}>
                  <span className="font-semibold" style={{ color: 'var(--color-ink)' }}>{libelleMois(m.mois).replace(/^./, c => c.toUpperCase())}</span>
                  <span style={{ color: '#3D4C5A' }}>
                    {m.nombre} séance{m.nombre > 1 ? 's' : ''}{m.montant > 0 && <> · <strong style={{ color: '#147A64' }}>+{euros(m.montant)}</strong></>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="m-0 text-xs" style={{ color: 'var(--color-ink-2)' }}>
              Montant estimé au tarif de chaque contrat (séance + déplacement) : <strong>{euros(plan.montant)}</strong>.
              {plan.sansTarif > 0 && ` ${plan.sansTarif} séance${plan.sansTarif > 1 ? 's' : ''} sans tarif : non comptée${plan.sansTarif > 1 ? 's' : ''}, et absente${plan.sansTarif > 1 ? 's' : ''} de la facture tant que le contrat n’a pas de tarif.`}
            </p>
          </>
        )}

        {laissees > 0 && (
          <div className="rounded-[14px] px-3.5 py-3 text-xs flex flex-col gap-1.5" style={{ background: '#FEF5E7', color: '#8A5300' }}>
            <strong className="text-[13px]">Laissées de côté, à traiter une par une :</strong>
            {plan.moisFactures.length > 0 && (
              <span>
                {plan.moisFactures.length} séance{plan.moisFactures.length > 1 ? 's' : ''} d’un mois déjà facturé : la facture est
                émise, elle{plan.moisFactures.length > 1 ? 's' : ''} n’y entrerai{plan.moisFactures.length > 1 ? 'en' : ''}t plus.
              </span>
            )}
            {plan.absences.length > 0 && (
              <span>
                {plan.absences.length} séance{plan.absences.length > 1 ? 's' : ''} où le bénéficiaire a signalé son absence.
              </span>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-1">
          <button type="button" onClick={onAnnuler} disabled={enCours}
            className="flex-1 h-12 rounded-[12px] bg-white text-sm font-bold disabled:opacity-60" style={{ border: '1.5px solid #D5E4E6', color: '#3D4C5A' }}>
            {n === 0 ? 'Fermer' : 'Annuler'}
          </button>
          {n > 0 && (
            <button ref={confirmer} type="button" onClick={onConfirmer} disabled={enCours}
              className="flex-1 h-12 rounded-[12px] text-white text-sm font-bold disabled:opacity-60" style={{ background: '#1A9A7F' }}>
              {enCours ? `Enregistrement… ${avancement}/${n}` : `Confirmer les ${n}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
