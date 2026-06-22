import { useState, useMemo } from 'react';
import { X, Download, Loader } from 'lucide-react';
import { toast } from 'sonner';
import type { Contrat, Participant } from '../../types';
import type { ContratPDFData } from '../export/ContratPDF';
import { exportContratPDF } from '../../utils/exportContratPDF';

function formatDateFR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatDuree(minutes: number): string {
  if (minutes === 60) return '1 heure';
  if (minutes === 90) return '1h30';
  return `${minutes} minutes`;
}

function formatFrequence(nbSeancesSemaine: number, heureDebut: string): string {
  const freq = nbSeancesSemaine === 1 ? '1 fois par semaine' : `${nbSeancesSemaine} fois par semaine`;
  return `${freq} à ${heureDebut.replace(':', 'h')}`;
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); }
  catch { return {}; }
}

interface Props {
  contrat: Contrat;
  participant: Participant;
  onClose: () => void;
}

export default function ModalGenerationContrat({ contrat, participant, onClose }: Props) {
  const settings = useMemo(loadSettings, []);
  const [loading, setLoading] = useState(false);

  const adressePierre = [settings.adresseRue, settings.adresseCodePostal, settings.adresseVille]
    .filter(Boolean).join(', ');
  const adressePatient = [participant.adresseRue, participant.adresseCodePostal, participant.adresseVille]
    .filter(Boolean).join(', ');

  const [form, setForm] = useState({
    lieu: adressePatient || 'Domicile du participant',
    tarif: Number(settings.tarifHoraire) || 45,
    fraisKm: Number(settings.fraisKmDefaut) || 0.5,
    droitImage: '' as 'Oui' | 'Non' | '',
    conditionParticuliere: '',
    villeSignature: settings.adresseVille || settings.villeSignature || '',
    dateSignature: formatDateFR(new Date().toISOString().split('T')[0]),
  });

  const pdfData: ContratPDFData = {
    pierre: {
      nom: `${settings.nom ?? ''} ${settings.prenom ?? ''}`.trim() || 'Pierre CLAVIER',
      adresse: adressePierre,
      siret: settings.siret || '',
      telephone: settings.telephone || '',
      email: settings.email || '',
    },
    societe: settings.societe || undefined,
    logoPraticien: settings.logoPraticien || undefined,
    patient: {
      nomPrenom: `${participant.prenom} ${participant.nom}`,
      adresse: adressePatient,
      telephone: participant.telephone,
      email: participant.email,
    },
    contrat: {
      dateDebut: formatDateFR(contrat.dateDebut),
      duree: formatDuree(contrat.dureeMinutes),
      frequence: formatFrequence(contrat.nbSeancesSemaine, contrat.heureDebut),
      lieu: form.lieu,
    },
    tarif: form.tarif,
    fraisKm: form.fraisKm,
    droitImage: form.droitImage,
    conditionParticuliere: form.conditionParticuliere,
    villeSignature: form.villeSignature,
    dateSignature: form.dateSignature,
  };

  async function handleGenerer() {
    setLoading(true);
    try {
      const nomFichier = `Contrat_${participant.nom}_${participant.prenom}_MouvAPA_${new Date().toISOString().split('T')[0]}.pdf`;
      await exportContratPDF(pdfData, nomFichier);
      toast.success('Contrat PDF téléchargé !');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary";

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
            <div>
              <h2 className="font-heading font-bold text-dark text-lg">Générer le contrat PDF</h2>
              <p className="text-xs text-gray-400 mt-0.5">{participant.prenom} {participant.nom}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-5">

            {/* Récap données auto */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3.5">
              <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
                Données pré-remplies automatiquement
              </div>
              <div className="text-xs text-blue-800 leading-relaxed space-y-1">
                <div>📋 Début du contrat : <strong>{formatDateFR(contrat.dateDebut)}</strong></div>
                <div>⏱ Durée séance : <strong>{formatDuree(contrat.dureeMinutes)}</strong></div>
                <div>📅 Fréquence : <strong>{formatFrequence(contrat.nbSeancesSemaine, contrat.heureDebut)}</strong></div>
                <div>👤 Prestataire : <strong>{settings.prenom} {settings.nom}</strong> — SIRET {settings.siret || 'non renseigné'}</div>
              </div>
            </div>

            {/* Lieu */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Lieu des séances
              </label>
              <input value={form.lieu} onChange={e => setForm(f => ({ ...f, lieu: e.target.value }))}
                placeholder="Domicile du participant" className={inputClass} />
            </div>

            {/* Tarif + km */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Tarif horaire (€)
                </label>
                <input type="number" min={0} step={0.5} value={form.tarif}
                  onChange={e => setForm(f => ({ ...f, tarif: Number(e.target.value) }))}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Frais km (€/km)
                </label>
                <input type="number" min={0} step={0.01} value={form.fraisKm}
                  onChange={e => setForm(f => ({ ...f, fraisKm: Number(e.target.value) }))}
                  className={inputClass} />
              </div>
            </div>

            {/* Droit à l'image */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Droit à l'image
              </label>
              <div className="flex gap-3">
                {(['Oui', 'Non', ''] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, droitImage: v }))}
                    className="px-5 py-2 rounded-xl text-sm font-semibold border-2 transition-colors"
                    style={{
                      borderColor: form.droitImage === v ? '#1A5F9E' : '#E2EEF9',
                      background: form.droitImage === v ? '#1A5F9E' : 'white',
                      color: form.droitImage === v ? 'white' : '#4A6080',
                    }}
                  >
                    {v === '' ? 'Non précisé' : v}
                  </button>
                ))}
              </div>
            </div>

            {/* Condition particulière */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Condition particulière (optionnel)
              </label>
              <textarea
                value={form.conditionParticuliere}
                onChange={e => setForm(f => ({ ...f, conditionParticuliere: e.target.value }))}
                rows={2}
                placeholder="Ex : Séances en présence de l'aidant familial…"
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Ville + date signature */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Ville de signature
                </label>
                <input value={form.villeSignature} onChange={e => setForm(f => ({ ...f, villeSignature: e.target.value }))}
                  placeholder="Nantes" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Date de signature
                </label>
                <input value={form.dateSignature} onChange={e => setForm(f => ({ ...f, dateSignature: e.target.value }))}
                  placeholder="JJ/MM/AAAA" className={inputClass} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-sm py-2.5"
              >
                Annuler
              </button>
              <button
                onClick={handleGenerer}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <Loader size={16} className="animate-spin" /> : <Download size={16} />}
                {loading ? 'Génération en cours…' : 'Télécharger le contrat PDF'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
