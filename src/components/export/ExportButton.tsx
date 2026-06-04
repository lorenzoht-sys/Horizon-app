import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { exportPDF } from '../../utils/exportPDF';
import type { Participant, Bilan } from '../../types';
import { toast } from 'sonner';

interface Props {
  participant: Participant;
  bilan: Bilan;
}

export default function ExportButton({ participant, bilan }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const fileName = `MouvAPA_Suivis_${participant.nom}_${participant.prenom}_${bilan.date}.pdf`;
      await exportPDF('printable-report', fileName);
      toast.success('PDF exporté avec succès !');
    } catch (e) {
      toast.error('Erreur lors de l\'export PDF');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-medium text-sm hover:bg-dark transition-colors disabled:opacity-60"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
      {loading ? 'Génération...' : 'Exporter PDF'}
    </button>
  );
}
