import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { chargerLignesAvoir } from '../../hooks/useFacturesAValider';
import { aRembourser, calculerAvoir, motifValide, quantiteRestante, type Choix, type Credit, type LigneOrigine } from '../../lib/avoirs';
import { formaterEuro, type FactureValidee } from '../../lib/facturesAValider';

// « Créer un avoir » (plan facturation PR 9, décisions du 2026-10-22) : lignes de la facture à cocher (et
// quantité pour les frais), et/ou un geste commercial, motif obligatoire. L'avoir est validé IMMÉDIATEMENT
// (numéro définitif) : la fenêtre le dit et affiche le montant exact, celui que la base vérifie.

/** « 12,5 » ou « 12.50 » -> 12.5 ; vide, négatif, plus de 2 décimales -> NaN. */
function lireMontant(v: string): number {
  const t = v.trim().replace(',', '.');
  if (t === '') return 0;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}

export default function ModalCreerAvoir({ facture, avoirs, onClose, onCreer }: {
  facture: FactureValidee;
  avoirs: FactureValidee[];
  onClose: () => void;
  onCreer: (lignes: Choix[], geste: number, motif: string, total: number) => Promise<boolean>;
}) {
  const [donnees, setDonnees] = useState<{ lignes: LigneOrigine[]; credits: Credit[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [geste, setGeste] = useState('');
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);

  // Clé stable : `avoirs` est recalculé à chaque rendu de la page.
  const idsAvoirs = avoirs.map(a => a.id).join(',');
  useEffect(() => {
    let annule = false;
    void chargerLignesAvoir(facture.id, idsAvoirs ? idsAvoirs.split(',') : []).then(r => {
      if (annule) return;
      if ('erreur' in r) setErreur(r.erreur); else setDonnees(r);
    });
    return () => { annule = true; };
  }, [facture.id, idsAvoirs]);

  const restes = useMemo(
    () => Object.fromEntries((donnees?.lignes ?? []).map(l => [l.id, quantiteRestante(l, donnees?.credits ?? [])])),
    [donnees],
  );
  const choix: Choix[] = Object.entries(quantites).filter(([, q]) => q > 0).map(([ligneId, quantite]) => ({ ligneId, quantite }));
  const montantGeste = lireMontant(geste);
  const calcul = calculerAvoir(facture, donnees?.lignes ?? [], choix, Number.isNaN(montantGeste) ? 0 : montantGeste, avoirs);
  const totalAvoirs = avoirs.reduce((t, a) => t + a.total, 0) + calcul.total;
  const rembourser = aRembourser(facture.paye, facture.total, totalAvoirs);
  const assujetti = facture.tauxTva > 0;
  const valide = calcul.total > 0 && !calcul.depasse && !Number.isNaN(montantGeste) && motifValide(motif) && !envoi;

  function basculer(l: LigneOrigine, coche: boolean) {
    setQuantites(q => ({ ...q, [l.id]: coche ? restes[l.id] : 0 }));
  }
  function toutCrediter() {
    setQuantites(Object.fromEntries((donnees?.lignes ?? []).map(l => [l.id, restes[l.id]])));
    setGeste('');
  }
  async function confirmer() {
    if (!valide) return;
    setEnvoi(true);
    const ok = await onCreer(choix, Number.isNaN(montantGeste) ? 0 : montantGeste, motif, calcul.total);
    setEnvoi(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="titre-avoir">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" data-testid="modal-avoir">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 id="titre-avoir" className="font-heading font-bold text-dark text-lg">Créer un avoir — facture n° {facture.numero}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-gray-400 hover:text-dark"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          {erreur && <p role="alert" className="text-red-700">Impossible de lire les lignes de la facture : {erreur}</p>}
          {!donnees && !erreur && <p className="text-gray-500">Chargement…</p>}

          {donnees && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Lignes à créditer</p>
                <button type="button" onClick={toutCrediter} data-testid="avoir-tout" className="text-xs font-medium text-primary">Tout créditer</button>
              </div>
              <ul className="space-y-1.5">
                {donnees.lignes.map(l => {
                  const reste = restes[l.id];
                  const q = quantites[l.id] ?? 0;
                  return (
                    <li key={l.id} className="flex items-center gap-2" data-testid="avoir-ligne">
                      <input type="checkbox" checked={q > 0} disabled={reste <= 0} aria-label={l.libelle}
                        onChange={e => basculer(l, e.target.checked)} />
                      <span className={`flex-1 min-w-0 ${reste <= 0 ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{l.libelle}</span>
                      {l.quantite > 1 && reste > 0 && q > 0 && (
                        <input type="number" min={1} max={reste} step={1} value={q} aria-label={`Quantité : ${l.libelle}`}
                          onChange={e => setQuantites(s => ({ ...s, [l.id]: Math.min(Math.max(Math.floor(Number(e.target.value) || 0), 0), reste) }))}
                          className="w-14 border border-gray-200 rounded-lg px-1.5 py-0.5 text-right" />
                      )}
                      <span className="tabular-nums text-gray-500">{reste <= 0 ? 'déjà créditée' : formaterEuro(l.prixUnitaire * (q > 0 ? q : reste))}</span>
                    </li>
                  );
                })}
              </ul>

              <label className="block">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Geste commercial {assujetti ? '(€ HT)' : '(€)'}</span>
                <input type="text" inputMode="decimal" value={geste} placeholder="0,00" data-testid="avoir-geste"
                  onChange={e => setGeste(e.target.value)}
                  className="mt-1 block w-32 border border-gray-200 rounded-lg px-2 py-1" />
                {Number.isNaN(montantGeste) && <span className="text-xs text-red-600">Montant invalide</span>}
              </label>

              <label className="block">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Motif (imprimé sur l'avoir) *</span>
                <textarea value={motif} maxLength={500} rows={2} data-testid="avoir-motif" placeholder="Ex. : séance du 12/09 annulée"
                  onChange={e => setMotif(e.target.value)}
                  className="mt-1 block w-full border border-gray-200 rounded-lg px-2 py-1" />
              </label>

              <div className="rounded-xl bg-gray-50 p-3 space-y-1" data-testid="avoir-resume">
                <div className="flex justify-between font-semibold text-gray-900">
                  <span>Montant de l'avoir</span>
                  <span className="tabular-nums" data-testid="avoir-total">{formaterEuro(calcul.total)}</span>
                </div>
                {assujetti && <div className="flex justify-between text-xs text-gray-500"><span>dont TVA ({facture.tauxTva} %)</span><span className="tabular-nums">{formaterEuro(calcul.montantTva)}</span></div>}
                <div className="flex justify-between text-xs text-gray-500"><span>Reste créditable sur la facture</span><span className="tabular-nums">{formaterEuro(calcul.resteCreditable)}</span></div>
                {calcul.depasse && <p className="text-xs text-red-700" role="alert">Le montant dépasse le reste créditable.</p>}
                {calcul.annuleOrigine && <p className="text-xs text-gray-700" data-testid="avoir-annule">La facture n° {facture.numero} sera annulée ; ses séances seront libérées.</p>}
                {rembourser > 0 && calcul.total > 0 && !calcul.depasse && (
                  <p className="text-xs font-medium text-amber-800" data-testid="avoir-rembourser">À rembourser au client : {formaterEuro(rembourser)} (hors d'Horizon)</p>
                )}
              </div>

              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <p>L'avoir est <strong>validé immédiatement</strong> : il reçoit un numéro définitif et ne pourra être <strong>ni modifié ni supprimé</strong>.</p>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="text-sm text-gray-600 px-3 py-2">Annuler</button>
                <button type="button" disabled={!valide} onClick={() => void confirmer()} data-testid="confirmer-avoir"
                  className="text-sm font-semibold text-white bg-primary rounded-xl px-4 py-2 disabled:opacity-50">
                  {envoi ? 'Création…' : `Créer l'avoir de ${formaterEuro(calcul.total)}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
