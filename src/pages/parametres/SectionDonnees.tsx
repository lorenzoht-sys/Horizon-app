import { useState, useRef, type ChangeEvent } from 'react';
import { Download, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import type { Participant } from '../../types';
import { supabase } from '../../lib/supabase';
import { exporterParticipantsComplets, restaurerParticipant, restaurerBilan, restaurerProgramme } from '../../lib/acces/sauvegarde';
import { dbToParticipant, participantToDb, bilanToDb, programmeToDb } from '../../lib/mappers';

// ── Section import / export JSON ───────────────────────────────────────────────

export interface ImportStats {
  patients: number;
  bilans: number;
  programmes: number;
}

export function SectionDonnees() {
  const [exporting, setExporting]     = useState(false);
  const [importing, setImporting]     = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    if (!supabase) { toast.error('Supabase non configuré'); return; }
    setExporting(true);
    try {
      const { data, error } = await exporterParticipantsComplets();
      if (error) throw error;
      const mapped = (data ?? []).map(dbToParticipant);
      const blob = new Blob([JSON.stringify(mapped, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `horizon-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Export réussi — ${mapped.length} bénéficiaires`);
    } catch (err) {
      toast.error('Erreur lors de l\'export');
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input pour permettre re-sélection du même fichier
    e.target.value = '';
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        toast.error('Format invalide — le fichier doit être un tableau JSON Horizon');
        return;
      }
      const bilansCount = data.reduce((sum: number, p: Participant) => sum + (p.bilans?.length ?? 0), 0);
      const progCount   = data.reduce((sum: number, p: Participant) => sum + (p.programmes?.length ?? 0), 0);
      setPendingFile(file);
      setImportStats({ patients: data.length, bilans: bilansCount, programmes: progCount });
    } catch {
      toast.error('Fichier JSON invalide');
    }
  }

  async function handleImportConfirm() {
    if (!pendingFile || !supabase) return;
    setImporting(true);
    try {
      const text = await pendingFile.text();
      const data: Participant[] = JSON.parse(text);
      let inserted = 0;
      let refuses = 0;
      let premiereErreur = '';

      for (const p of data) {
        const { bilans: pBilans, programmes: pProgs, ...rest } = p as Participant & { programmes?: unknown[] };
        // L'erreur était ignorée : une fiche refusée par la base était comptée
        // comme importée, puis ses bilans échouaient en silence. Cas concret
        // depuis le 2026-09-13 : RE-créer une fiche supprimée qui n'a pas de
        // consentement RGPD est refusé (trigger BEFORE INSERT) — restaurer une
        // fiche qui existe encore reste possible.
        const { error: erreurFiche } = await restaurerParticipant(participantToDb(rest));
        if (erreurFiche) {
          refuses++;
          premiereErreur ||= erreurFiche.message;
          continue;
        }

        for (const b of pBilans ?? []) {
          await restaurerBilan(bilanToDb(p.id, b));
        }
        for (const prog of (pProgs ?? []) as Parameters<typeof programmeToDb>[0][]) {
          await restaurerProgramme({
            ...programmeToDb(prog),
            date_creation: (prog as { dateCreation?: string }).dateCreation ?? new Date().toISOString().slice(0, 10),
          });
        }
        inserted++;
      }

      setPendingFile(null);
      setImportStats(null);
      if (refuses > 0) {
        // Pas de rechargement automatique : il effacerait ce message.
        toast.error(
          `${refuses} bénéficiaire${refuses > 1 ? 's' : ''} non restauré${refuses > 1 ? 's' : ''} — ${premiereErreur}`,
          { duration: 15000 },
        );
        if (inserted > 0) toast.success(`${inserted} bénéficiaire${inserted > 1 ? 's' : ''} restauré${inserted > 1 ? 's' : ''}`);
      } else {
        toast.success(`Import réussi — ${inserted} bénéficiaires ajoutés`);
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (err) {
      console.error('Erreur import:', err);
      toast.error('Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  }

  function handleImportCancel() {
    setPendingFile(null);
    setImportStats(null);
  }

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Mes données</h2>
        <div className="h-px bg-gray-100" />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        {/* Export */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Download size={15} />
          {exporting ? 'Export en cours…' : '📤 Exporter mes données (JSON)'}
        </button>

        {/* Import */}
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => importRef.current?.click()}
          className="flex items-center gap-2 border border-primary/40 text-primary hover:bg-primary/5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <FileUp size={15} />
          📥 Importer un fichier JSON
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Importez un fichier <span className="font-mono">horizon-backup-*.json</span> pour restaurer vos données depuis une sauvegarde.
      </p>

      {/* Modal confirmation import */}
      {importStats && pendingFile && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileUp size={18} className="text-primary" />
              </div>
              <h3 className="font-heading font-bold text-dark text-lg">Confirmer l'import</h3>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-1">
              <p className="text-sm text-gray-600">
                Cette action ajoutera à votre compte :
              </p>
              <ul className="mt-2 space-y-1">
                <li className="text-sm font-semibold text-dark">• {importStats.patients} bénéficiaire{importStats.patients > 1 ? 's' : ''}</li>
                <li className="text-sm font-semibold text-dark">• {importStats.bilans} bilan{importStats.bilans > 1 ? 's' : ''}</li>
                {importStats.programmes > 0 && (
                  <li className="text-sm font-semibold text-dark">• {importStats.programmes} programme{importStats.programmes > 1 ? 's' : ''}</li>
                )}
              </ul>
              <p className="text-xs text-gray-500 mt-2">
                Les bénéficiaires existants (même identifiant) seront mis à jour.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleImportCancel}
                disabled={importing}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleImportConfirm}
                disabled={importing}
                className="flex-1 bg-primary text-white hover:bg-dark px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Import en cours…' : 'Continuer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
