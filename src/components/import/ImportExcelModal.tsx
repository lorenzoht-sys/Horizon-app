import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { Participant } from '../../types';
import { downloadTemplate, exportPatientsExcel, parseExcelRows, type ImportError } from '../../utils/excelImport';
import { X, Download, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Info, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';

type Phase = 'idle' | 'processing' | 'result';

interface ResultState {
  succes: number;
  erreurs: ImportError[];
  ignores: ImportError[];
}

interface ProgressState {
  done: number;
  total: number;
}

interface Props {
  onClose: () => void;
  participants: Participant[];
  addParticipant: (data: Omit<Participant, 'id' | 'token' | 'bilans'>) => Promise<Participant>;
}

export default function ImportExcelModal({ onClose, participants, addParticipant }: Props) {
  const [phase, setPhase]       = useState<Phase>('idle');
  const [result, setResult]     = useState<ResultState | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ done: 0, total: 0 });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Format non supporté — utilisez .xlsx, .xls ou .csv');
      return;
    }

    setPhase('processing');
    setProgress({ done: 0, total: 0 });

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { cellDates: true });

      const sheetName = wb.SheetNames.includes('Patients')
        ? 'Patients'
        : wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(
        wb.Sheets[sheetName],
        { header: 1, raw: true, defval: '' }
      );

      const parsed = parseExcelRows(rows as unknown[][], participants);
      const total = parsed.succes.length;
      setProgress({ done: 0, total });

      let nbSucces = 0;
      const erreursSupabase: ImportError[] = [];

      // Insertion séquentielle avec await — chaque patient est inséré dans Supabase
      // avant de passer au suivant, ce qui permet de suivre la progression.
      for (let i = 0; i < parsed.succes.length; i++) {
        const data = parsed.succes[i];
        try {
          await addParticipant(data);
          nbSucces++;
        } catch (error: any) {
          erreursSupabase.push({
            ligne: i + 2,
            message: `${data.prenom} ${data.nom} — ${error?.message || error?.details || JSON.stringify(error)}`,
          });
        }
        setProgress({ done: i + 1, total });
      }

      const withAddr = parsed.succes.filter(d => d.adresseRue && d.adresseVille).length;
      if (withAddr > 0) {
        setTimeout(() => {
          toast(`📍 Géolocalisation de ${withAddr} patient${withAddr > 1 ? 's' : ''} en cours…`, {
            duration: 4000,
          });
        }, 600);
      }

      setResult({
        succes: nbSucces,
        erreurs: [...parsed.erreurs, ...erreursSupabase],
        ignores: parsed.ignores,
      });
      setPhase('result');

    } catch {
      setPhase('idle');
      toast.error('Impossible de lire ce fichier. Vérifiez le format.');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleExportAll() {
    exportPatientsExcel(participants);
    toast.success(`${participants.length} patients exportés`);
  }

  const isEmpty = result && result.succes === 0 && result.erreurs.length === 0 && result.ignores.length === 0;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* En-tête */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-heading font-bold text-dark text-lg">Import / Export patients</h2>
            <p className="text-sm text-gray-400 mt-0.5">Fichier Excel (.xlsx, .xls, .csv)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-dark transition-colors p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">

          {/* ── Phase idle ── */}
          {phase === 'idle' && (
            <div className="space-y-5">

              {/* Étape 1 : template */}
              <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
                  <span className="text-sm font-semibold text-dark">Téléchargez le template Excel</span>
                </div>
                <p className="text-xs text-gray-500 mb-3 ml-8">
                  Modèle pré-formaté avec toutes les colonnes attendues et une feuille "Instructions".
                </p>
                <button
                  onClick={downloadTemplate}
                  className="ml-8 flex items-center gap-2 border border-primary/30 text-primary hover:bg-primary hover:text-white px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Download size={13} />
                  Télécharger Template_Import_MouvAPA.xlsx
                </button>
              </div>

              {/* Étape 2 : instructions */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-gray-300 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</div>
                  <span className="text-sm font-semibold text-dark">Remplissez-le avec vos données</span>
                </div>
                <ul className="text-xs text-gray-500 ml-8 space-y-0.5 mt-1">
                  <li>• <strong>Obligatoires :</strong> Nom, Prénom, Date de naissance (JJ/MM/AAAA)</li>
                  <li>• Consultez la feuille "Instructions" du template pour les tags</li>
                  <li>• Remplir à partir de la ligne 2 (ligne 1 = en-têtes)</li>
                </ul>
              </div>

              {/* Étape 3 : import */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-gray-300 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</div>
                  <span className="text-sm font-semibold text-dark">Importez le fichier complété</span>
                </div>

                <label
                  onDragEnter={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDrop={handleDrop}
                  className={`block w-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    dragging
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-primary/40 hover:bg-gray-50'
                  }`}
                >
                  <FileSpreadsheet size={32} className={`mx-auto mb-3 ${dragging ? 'text-primary' : 'text-gray-300'}`} />
                  <p className="text-sm font-medium text-gray-600 mb-1">
                    Glissez votre fichier ici
                  </p>
                  <p className="text-xs text-gray-400 mb-3">ou</p>
                  <span className="inline-flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold">
                    <Upload size={14} />
                    Choisir un fichier
                  </span>
                  <p className="text-xs text-gray-400 mt-3">Formats acceptés : .xlsx · .xls · .csv</p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Export */}
              <div className="border-t border-gray-100 pt-5">
                <p className="text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wide">Exporter ma base existante</p>
                <button
                  onClick={handleExportAll}
                  disabled={participants.length === 0}
                  className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 w-full"
                >
                  <FileDown size={15} />
                  Exporter tous mes patients en Excel
                  <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {participants.length} patient{participants.length !== 1 ? 's' : ''}
                  </span>
                </button>
                <p className="text-xs text-gray-400 mt-1.5">
                  Même format que le template — peut être réimporté sans modification.
                </p>
              </div>
            </div>
          )}

          {/* ── Phase processing ── */}
          {phase === 'processing' && (
            <div className="py-16 text-center">
              <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
              {progress.total === 0 ? (
                <>
                  <p className="text-sm font-medium text-gray-700">Lecture du fichier…</p>
                  <p className="text-xs text-gray-400 mt-1">Validation des données</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">
                    Import en cours… {progress.done}/{progress.total} patients
                  </p>
                  <div className="w-48 mx-auto mt-3 bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-200"
                      style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Phase result ── */}
          {phase === 'result' && result && (
            <div className="space-y-4">

              {/* Titre */}
              <div className="text-center pt-2 pb-1">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle size={24} className="text-green-600" />
                </div>
                <h3 className="font-heading font-bold text-dark text-xl">Import terminé</h3>
              </div>

              {/* Résumé */}
              <div className="space-y-2.5">

                {result.succes > 0 && (
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <CheckCircle size={17} className="text-green-600 flex-shrink-0" />
                    <span className="text-sm font-semibold text-green-800">
                      {result.succes} patient{result.succes > 1 ? 's' : ''} importé{result.succes > 1 ? 's' : ''} avec succès
                    </span>
                  </div>
                )}

                {result.ignores.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Info size={16} className="text-orange-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-orange-800">
                        {result.ignores.length} doublon{result.ignores.length > 1 ? 's' : ''} ignoré{result.ignores.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <ul className="space-y-0.5 ml-6">
                      {result.ignores.map((e, i) => (
                        <li key={i} className="text-xs text-orange-700">
                          Ligne {e.ligne} — {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.erreurs.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-red-800">
                        {result.erreurs.length} erreur{result.erreurs.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <ul className="space-y-0.5 ml-6">
                      {result.erreurs.map((e, i) => (
                        <li key={i} className="text-xs text-red-700">
                          Ligne {e.ligne} — {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {isEmpty && (
                  <div className="text-center text-gray-400 py-6 text-sm">
                    Aucune donnée trouvée dans ce fichier.
                    <br />
                    <span className="text-xs">Vérifiez que vous utilisez bien le template fourni.</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setPhase('idle'); setResult(null); }}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Importer un autre fichier
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-dark transition-colors"
                >
                  {result.succes > 0 ? 'Voir les patients →' : 'Fermer'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
