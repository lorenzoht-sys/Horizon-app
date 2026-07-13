import { useState } from 'react';
import { X, Send } from 'lucide-react';
import BoutonReformulation from '../ui/BoutonReformulation';

interface Props {
  /** Nom lisible du destinataire, affiché tel quel (ex: "Camille Martin (bénéficiaire)"). */
  destinataire: string;
  texteInitial: string;
  onAnnuler: () => void;
  /** Reçoit le texte final (potentiellement modifié) — l'insert en base ne doit
   *  se produire qu'ici, jamais avant l'appel de cette fonction. */
  onConfirmer: (texteFinal: string) => Promise<void>;
}

export default function ModalRelecturePartage({ destinataire, texteInitial, onAnnuler, onConfirmer }: Props) {
  const [texte, setTexte] = useState(texteInitial);
  const [envoi, setEnvoi] = useState(false);

  async function handleConfirmer() {
    setEnvoi(true);
    try {
      await onConfirmer(texte);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1300] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-heading font-bold text-dark text-base">✏️ Relire avant de partager</h2>
            <p className="text-xs text-gray-400 mt-0.5">Destinataire : {destinataire}</p>
          </div>
          <button onClick={onAnnuler} disabled={envoi} className="text-gray-400 hover:text-dark p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Texte qui sera partagé — modifiable</p>
          <textarea
            value={texte}
            onChange={e => setTexte(e.target.value)}
            disabled={envoi}
            rows={16}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:border-primary transition-colors resize-y disabled:opacity-50"
          />
          <div className="mt-2">
            <BoutonReformulation texte={texte} onReformule={setTexte} disabled={envoi} />
          </div>
        </div>

        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white rounded-b-3xl sm:rounded-b-2xl">
          <div className="flex gap-3">
            <button
              onClick={onAnnuler}
              disabled={envoi}
              className="flex items-center gap-1.5 border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirmer}
              disabled={envoi || !texte.trim()}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-50"
            >
              <Send size={16} /> {envoi ? 'Envoi…' : 'Confirmer et partager'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
