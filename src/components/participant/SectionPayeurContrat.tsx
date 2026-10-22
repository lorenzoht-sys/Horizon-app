import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import {
  SELECT_PAYEUR, lirePayeur, messagePayeurLisible, payeurVersMiseAJour, resumePayeur, validerPayeur,
  type ErreursPayeur, type FormulairePayeur,
} from '../../lib/payeurContrat';

/**
 * Payeur d'un contrat (point E, E1) : le bénéficiaire, ou un proche (nom, adresse, e-mail) qui reçoit la
 * facture. Lecture et écriture ciblées sous la RLS du praticien, jamais par contratToDb (qui réécrirait tout
 * le contrat). Le payeur est figé dans chaque facture à sa validation : le changer vaut pour les prochaines.
 */
export default function SectionPayeurContrat({ contratId }: { contratId: string }) {
  const [enBase, setEnBase] = useState<FormulairePayeur | null>(null);
  const [f, setF] = useState<FormulairePayeur | null>(null);
  const [erreurs, setErreurs] = useState<ErreursPayeur>({});
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('contrats').select(SELECT_PAYEUR).eq('id', contratId).maybeSingle();
    if (error) { console.error('[SectionPayeurContrat] lecture :', error); return; }
    setEnBase(lirePayeur(data as Record<string, unknown> | null));
  }, [contratId]);

  useEffect(() => { void charger(); }, [charger]);

  if (!enBase) return null;

  function maj<K extends keyof FormulairePayeur>(champ: K, valeur: FormulairePayeur[K]) {
    setF(prev => (prev ? { ...prev, [champ]: valeur } : prev));
    setErreurs(e => ({ ...e, [champ]: undefined }));
  }

  async function enregistrer() {
    if (!f || !supabase) return;
    const e = validerPayeur(f);
    if (Object.keys(e).length > 0) { setErreurs(e); return; }
    setEnCours(true);
    const { data, error } = await supabase.from('contrats').update(payeurVersMiseAJour(f)).eq('id', contratId).select(SELECT_PAYEUR);
    setEnCours(false);
    if (error) { toast.error(messagePayeurLisible(error.message)); return; }
    if (!data || data.length === 0) { toast.error('Contrat introuvable ou non modifiable'); return; }
    setEnBase(lirePayeur(data[0] as Record<string, unknown>));
    setF(null);
    toast.success('Payeur enregistré : il s\'applique aux prochaines factures validées');
  }

  const champ = (erreur?: string) =>
    `w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none ${erreur ? 'border-red bg-red-light' : 'border-gray-200 focus:border-primary'}`;

  return (
    <div className="border border-gray-200 rounded-xl p-3 mb-3 bg-white" data-testid="section-payeur">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Payeur</div>
      {!f ? (
        <>
          <div className="text-sm text-dark" data-testid="payeur-resume">{resumePayeur(enBase)}</div>
          {enBase.type === 'proche' && <div className="text-xs text-gray-400 whitespace-pre-line mt-0.5">{enBase.adresse}</div>}
          <button
            type="button" data-testid="modifier-payeur" onClick={() => setF(enBase)}
            className="mt-2 text-xs border border-primary text-primary px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors font-medium"
          >
            Modifier le payeur
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Qui paie">
            {(['beneficiaire', 'proche'] as const).map(t => (
              <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name={`payeur-${contratId}`} checked={f.type === t} onChange={() => maj('type', t)} className="accent-primary" data-testid={`payeur-${t}`} />
                {t === 'beneficiaire' ? 'Le bénéficiaire' : 'Un proche'}
              </label>
            ))}
          </div>
          {f.type === 'proche' && (
            <>
              <label className="block">
                <span className="text-xs text-gray-500">Nom et prénom du proche</span>
                <input value={f.nom} onChange={e => maj('nom', e.target.value)} className={champ(erreurs.nom)} data-testid="payeur-nom" />
                {erreurs.nom && <span role="alert" className="text-xs text-red">{erreurs.nom}</span>}
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Adresse postale (sur la facture)</span>
                <textarea rows={2} value={f.adresse} onChange={e => maj('adresse', e.target.value)} placeholder={'3 rue de la Paix\n75000 Paris'} className={champ(erreurs.adresse)} data-testid="payeur-adresse" />
                {erreurs.adresse && <span role="alert" className="text-xs text-red">{erreurs.adresse}</span>}
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">E-mail (la facture lui est envoyée)</span>
                <input type="email" value={f.email} onChange={e => maj('email', e.target.value)} className={champ(erreurs.email)} data-testid="payeur-email" />
                {erreurs.email && <span role="alert" className="text-xs text-red">{erreurs.email}</span>}
              </label>
            </>
          )}
          <p className="text-xs text-gray-400">S'applique aux prochaines factures validées, y compris le brouillon en cours ; les factures déjà émises ne changent pas.</p>
          <div className="flex gap-2">
            <button type="button" disabled={enCours} onClick={() => void enregistrer()} data-testid="enregistrer-payeur"
              className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 font-medium">
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" onClick={() => { setF(null); setErreurs({}); }} className="text-xs text-gray-500 hover:text-dark px-2">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
