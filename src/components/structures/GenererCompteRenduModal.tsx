import { useState, useMemo } from 'react';
import { X, Upload, FileText, Download, RefreshCw, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Participant, Structure } from '../../types';
import { useContrats } from '../../hooks/useContrats';
import { useProgramme } from '../../hooks/useProgramme';
import { useTemplatesStructure } from '../../hooks/useTemplatesStructure';
import { extraireTexteTemplate, type TemplateFormat } from '../../utils/extractTemplateText';
import { analyserDonneesDisponibles, buildCompteRenduStructurePrompt } from '../../utils/buildCompteRenduStructureContext';
import { downloadMarkdownAsPdf } from '../../utils/markdownToPdf';
import { exportCompteRenduWord } from '../../utils/exportCompteRenduWord';
import { getAuthHeader } from '../../lib/supabase';

interface Props {
  patient: Participant;
  structure: Structure;
  onClose: () => void;
}

type Step = 1 | 2 | 3 | 4;

export default function GenererCompteRenduModal({ patient, structure, onClose }: Props) {
  const { contrats } = useContrats();
  const { programmes } = useProgramme(patient.id);
  const { templates, creerTemplate, supprimerTemplate } = useTemplatesStructure(structure.id);

  const contratActif = useMemo(
    () => contrats.find(c => c.participantId === patient.id && c.statut === 'actif') ?? null,
    [contrats, patient.id],
  );
  const programmeActif = useMemo(() => programmes.find(p => p.actif) ?? null, [programmes]);

  const [step, setStep] = useState<Step>(1);

  // Étape 1 — choix du template
  const [templateSelectionneId, setTemplateSelectionneId] = useState<string | null>(null);
  const [templateTexte, setTemplateTexte] = useState<string | null>(null);
  const [templateFormat, setTemplateFormat] = useState<TemplateFormat | null>(null);
  const [extractionWarning, setExtractionWarning] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [sauvegarderTemplate, setSauvegarderTemplate] = useState(false);
  const [nomNouveauTemplate, setNomNouveauTemplate] = useState('');

  // Étape 3/4 — génération
  const [generating, setGenerating] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<string>('');

  const apercu = useMemo(
    () => analyserDonneesDisponibles(patient, contratActif, programmeActif),
    [patient, contratActif, programmeActif],
  );

  async function handleFileUpload(file: File) {
    setExtracting(true);
    setErreur(null);
    try {
      const { texte, format, avertissement } = await extraireTexteTemplate(file);
      setTemplateTexte(texte);
      setTemplateFormat(format);
      setExtractionWarning(avertissement);
      setTemplateSelectionneId(null);
      setNomNouveauTemplate(file.name.replace(/\.(pdf|docx)$/i, ''));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la lecture du fichier');
    } finally {
      setExtracting(false);
    }
  }

  function choisirTemplateExistant(id: string) {
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setTemplateSelectionneId(id);
    setTemplateTexte(t.contenuTexte);
    setTemplateFormat(t.formatOrigine);
    setExtractionWarning(null);
    setSauvegarderTemplate(false);
  }

  async function passerEtape2() {
    if (!templateTexte) return;
    if (sauvegarderTemplate && !templateSelectionneId && nomNouveauTemplate.trim()) {
      await creerTemplate({ nom: nomNouveauTemplate.trim(), contenuTexte: templateTexte, formatOrigine: templateFormat });
    }
    setStep(2);
  }

  async function lancerGeneration() {
    if (!templateTexte) return;
    setStep(3);
    setGenerating(true);
    setErreur(null);
    try {
      const prompt = buildCompteRenduStructurePrompt({ templateTexte, patient, structure, contratActif, programmeActif });
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ prompt, model: 'claude-sonnet-4-6' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la génération');
      setResultat(data.text ?? '');
      setStep(4);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue lors de la génération');
    } finally {
      setGenerating(false);
    }
  }

  function nomFichier(ext: string): string {
    const date = new Date().toISOString().split('T')[0];
    return `CR-${structure.nom}_${patient.nom}-${patient.prenom}_${date}.${ext}`.replace(/\s+/g, '-');
  }

  function telechargerPdf() {
    downloadMarkdownAsPdf({ markdownContent: resultat, filename: nomFichier('pdf') });
  }

  async function telechargerWord() {
    await exportCompteRenduWord({ contenu: resultat, filename: nomFichier('docx') });
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-full flex flex-col" style={{ maxWidth: 640, maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <div className="text-base font-bold text-dark">Générer un compte rendu structure</div>
            <div className="text-xs text-gray-400 mt-0.5">{patient.prenom} {patient.nom} · {structure.nom}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" type="button">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {/* Étape 1 — Choix du template */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700">1. Choisir le template de la structure</p>

              {templates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Templates déjà sauvegardés pour {structure.nom} :</p>
                  {templates.map(t => (
                    <div key={t.id} className="flex items-center gap-2">
                      <button type="button"
                        onClick={() => choisirTemplateExistant(t.id)}
                        className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-sm transition-colors ${
                          templateSelectionneId === t.id ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-700 hover:border-primary/50'
                        }`}>
                        <FileText size={14} />
                        {t.nom}
                      </button>
                      <button type="button" onClick={() => supprimerTemplate(t.id)} className="text-gray-300 hover:text-red-500" title="Supprimer ce template">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 mb-2">Ou uploader un nouveau template (PDF ou Word) :</p>
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-6 cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload size={20} className="text-gray-400" />
                  <span className="text-xs text-gray-500">{extracting ? 'Extraction en cours...' : 'Cliquer pour choisir un fichier .pdf ou .docx'}</span>
                  <input type="file" accept=".pdf,.docx" className="hidden" disabled={extracting}
                    onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); }} />
                </label>
              </div>

              {extractionWarning && (
                <div className="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  {extractionWarning}
                </div>
              )}

              {templateTexte && !templateSelectionneId && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="save-template" checked={sauvegarderTemplate}
                    onChange={e => setSauvegarderTemplate(e.target.checked)} />
                  <label htmlFor="save-template" className="text-xs text-gray-600">Sauvegarder ce template pour {structure.nom} (prochaine fois)</label>
                </div>
              )}
              {sauvegarderTemplate && !templateSelectionneId && (
                <input type="text" value={nomNouveauTemplate} onChange={e => setNomNouveauTemplate(e.target.value)}
                  placeholder="Nom du template"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              )}
            </div>
          )}

          {/* Étape 2 — Aperçu des données */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700">2. Données qui seront utilisées</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="text-gray-400 text-xs">Bilans</div>
                  <div className="font-semibold text-gray-800">{apercu.nbBilans} {apercu.dernierBilanDate ? `(dernier : ${apercu.dernierBilanDate})` : ''}</div>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="text-gray-400 text-xs">Progression</div>
                  <div className="font-semibold text-gray-800">{apercu.aProgression ? 'Disponible' : 'Non disponible'}</div>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="text-gray-400 text-xs">Séances</div>
                  <div className="font-semibold text-gray-800">
                    {apercu.nbSeancesRealisees != null ? `${apercu.nbSeancesRealisees} réalisées` : 'Non renseigné'}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="text-gray-400 text-xs">Programme actif</div>
                  <div className="font-semibold text-gray-800">{apercu.aProgrammeActif ? 'Oui' : 'Non'}</div>
                </div>
              </div>

              {apercu.avertissements.length > 0 && (
                <div className="space-y-1.5">
                  {apercu.avertissements.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-700">
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      {a}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Étape 3 — Génération en cours */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              {generating ? (
                <>
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <p className="text-sm text-gray-500">Génération du compte rendu en cours...</p>
                </>
              ) : erreur && (
                <>
                  <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    {erreur}
                  </div>
                  <button type="button" onClick={lancerGeneration}
                    className="text-sm font-semibold text-primary border border-primary/30 hover:bg-primary/5 rounded-lg px-4 py-2 transition-colors">
                    Réessayer
                  </button>
                </>
              )}
            </div>
          )}

          {/* Étape 4 — Résultat */}
          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700">4. Compte rendu généré — modifiable avant export</p>
              <textarea value={resultat} onChange={e => setResultat(e.target.value)} rows={16}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono leading-relaxed focus:outline-none focus:border-primary resize-none" />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2">
          {step === 1 && (
            <>
              <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Annuler</button>
              <button type="button" disabled={!templateTexte} onClick={passerEtape2}
                className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-40">
                Suivant
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button type="button" onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">Retour</button>
              <button type="button" onClick={lancerGeneration}
                className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-xl">
                Générer le compte rendu
              </button>
            </>
          )}
          {step === 3 && (
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Fermer</button>
          )}
          {step === 4 && (
            <>
              <button type="button" onClick={lancerGeneration}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-xl px-3 py-2">
                <RefreshCw size={14} /> Régénérer
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={telechargerPdf}
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl px-3 py-2">
                  <Download size={14} /> PDF
                </button>
                <button type="button" onClick={() => void telechargerWord()}
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl px-3 py-2">
                  <Download size={14} /> Word
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
