import { useState } from 'react';
import { toast } from 'sonner';
import { useTarifsContrat } from '../../hooks/useTarifsContrat';
import { dateCivileParis, totalFactureSeance } from '../../lib/tarifsContrats';

function formatDateCourt(date: string): string {
  return new Date(date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Tarif d'un contrat (bug 07) — praticien uniquement, desktop uniquement,
 * même réserve que les contacts professionnels (bug 06) : rien ici côté
 * mobile ni espace bénéficiaire.
 *
 * Affiche la version en vigueur et permet d'en ouvrir une nouvelle à une date
 * d'effet choisie, par défaut aujourd'hui en heure de Paris, ou le début du
 * contrat pour un premier tarif (jamais de
 * modification d'une ligne existante — voir fermerEtCreerNouvelleVersion,
 * src/hooks/useTarifsContrat.ts), plus un historique consultable des versions
 * closes. Les séances à partir de la date d'effet sont recalculées dans les
 * brouillons de facture (trigger de base) ; une facture validée ne change pas.
 */
export default function SectionTarifContrat({ contratId, dateDebutContrat }: { contratId: string; dateDebutContrat: string }) {
  const { versions, versionActuelle, historique, loading, modifierTarif, couvrirDebutContrat } = useTarifsContrat(contratId);
  const [editing, setEditing] = useState(false);
  const [showHistorique, setShowHistorique] = useState(false);
  const [tarifSeance, setTarifSeance] = useState('');
  const [fraisDeplacement, setFraisDeplacement] = useState('');
  const [dateEffet, setDateEffet] = useState('');
  const [saving, setSaving] = useState(false);

  function ouvrirEdition() {
    setTarifSeance(versionActuelle ? String(versionActuelle.tarifSeance) : '');
    setFraisDeplacement(versionActuelle ? String(versionActuelle.fraisDeplacement) : '0');
    // Premier tarif : depuis le début du contrat (2026-11-19). Daté du jour, il laissait les séances
    // d'avant sans tarif, donc sans facture (factures d'octobre manquantes).
    setDateEffet(versionActuelle ? dateCivileParis() : dateDebutContrat);
    setEditing(true);
  }

  async function valider() {
    const t = parseFloat(tarifSeance);
    const f = fraisDeplacement.trim() === '' ? 0 : parseFloat(fraisDeplacement);
    if (!Number.isFinite(t) || t < 0) { toast.error('Tarif par séance invalide'); return; }
    if (!Number.isFinite(f) || f < 0) { toast.error('Frais de déplacement invalides'); return; }
    if (!dateEffet) { toast.error('Choisissez une date d\'effet'); return; }
    setSaving(true);
    const ok = await modifierTarif(t, f, dateEffet);
    setSaving(false);
    if (ok) { setEditing(false); toast.success(`Tarif mis à jour à partir du ${formatDateCourt(dateEffet)}`); }
  }

  const premiere = [...versions].sort((a, b) => a.dateDebutValidite.localeCompare(b.dateDebutValidite))[0];

  async function couvrir() {
    setSaving(true);
    const ok = await couvrirDebutContrat(dateDebutContrat);
    setSaving(false);
    if (ok) toast.success(`Tarif appliqué depuis le ${formatDateCourt(dateDebutContrat)}`);
  }

  if (loading) return null;

  return (
    <div className="border border-gray-200 rounded-xl p-3 mb-3 bg-white">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tarif</div>

      {!editing ? (
        <>
          {versionActuelle ? (
            <div className="text-sm text-dark">
              {versionActuelle.tarifSeance.toFixed(2)} € / séance
              {versionActuelle.fraisDeplacement > 0 && (
                <> + {versionActuelle.fraisDeplacement.toFixed(2)} € déplacement</>
              )}
              {' = '}
              <span className="font-semibold">{totalFactureSeance(versionActuelle).toFixed(2)} €</span>
              <span className="text-xs text-gray-400"> · depuis le {formatDateCourt(versionActuelle.dateDebutValidite)}</span>
            </div>
          ) : (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="tarif-absent">
              Aucun tarif : les séances de ce contrat ne peuvent pas être facturées.
            </div>
          )}

          {premiere && premiere.dateDebutValidite > dateDebutContrat && (
            <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="tarif-ecart-debut">
              Le tarif commence le {formatDateCourt(premiere.dateDebutValidite)}, après le début du contrat ({formatDateCourt(dateDebutContrat)}) :
              les séances d'avant ne peuvent pas être facturées.
              <button type="button" onClick={couvrir} disabled={saving} data-testid="tarif-couvrir-debut"
                className="block mt-1.5 font-medium text-primary hover:underline disabled:opacity-50">
                Appliquer {totalFactureSeance(premiere).toFixed(2)} € depuis le début du contrat
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={ouvrirEdition}
              className="text-xs border border-primary text-primary px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors font-medium"
            >
              Modifier le tarif
            </button>
            {historique.length > 0 && (
              <button
                onClick={() => setShowHistorique(s => !s)}
                className="text-xs text-gray-500 hover:text-dark transition-colors"
              >
                {showHistorique ? 'Masquer l\'historique' : `Historique (${historique.length})`}
              </button>
            )}
          </div>

          {showHistorique && (
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
              {historique.map(v => (
                <div key={v.id} className="text-xs text-gray-500 flex items-center justify-between">
                  <span>{formatDateCourt(v.dateDebutValidite)} → {formatDateCourt(v.dateFinValidite as string)}</span>
                  <span>
                    {v.tarifSeance.toFixed(2)} €
                    {v.fraisDeplacement > 0 && ` + ${v.fraisDeplacement.toFixed(2)} €`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-500">Tarif par séance (€)</span>
              <input
                type="number" min={0} step="0.01" autoFocus
                value={tarifSeance}
                onChange={e => setTarifSeance(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Frais de déplacement (€)</span>
              <input
                type="number" min={0} step="0.01"
                value={fraisDeplacement}
                onChange={e => setFraisDeplacement(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:border-primary"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-gray-500">À partir du</span>
            <input
              type="date"
              data-testid="tarif-date-effet"
              value={dateEffet}
              min={versionActuelle?.dateDebutValidite ?? dateDebutContrat}
              onChange={e => setDateEffet(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:border-primary"
            />
          </label>
          <div className="text-xs text-gray-400">
            S'applique aux séances à partir de cette date. Les séances antérieures gardent l'ancien tarif, et une facture déjà validée n'est jamais modifiée.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={valider}
              disabled={saving}
              className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-dark transition-colors disabled:opacity-50 font-medium"
            >
              {saving ? 'Enregistrement…' : 'Valider'}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="text-xs text-gray-500 hover:text-dark transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
