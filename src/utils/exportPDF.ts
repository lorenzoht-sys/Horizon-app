import React from 'react';
import { pdf } from '@react-pdf/renderer';
import type { Bilan, Participant, NotesBilan, Programme, Exercice } from '../types';
import type { PdfPraticienSettings } from '../components/export/PdfShared';
import FicheBilanPDF from '../components/export/FicheBilanPDF';
import FicheBilanBeneficiairePDF from '../components/export/FicheBilanBeneficiairePDF';
import ProgrammePDF from '../components/export/ProgrammePDF';
import QRCode from 'qrcode';

// ─── Export fiche bilan — @react-pdf/renderer ─────────────────────────────────

export interface ExportFicheBilanData {
  bilan: Bilan;
  participant: Participant;
  notes: NotesBilan;
  settings: PdfPraticienSettings;
}

export async function exportFicheBilanPDF(
  data: ExportFicheBilanData,
  fileName: string
): Promise<void> {
  const element = React.createElement(FicheBilanPDF, data);
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Variante filtrée (visibleBeneficiaire) et reformulée de exportFicheBilanPDF,
 *  destinée à être remise au bénéficiaire — voir FicheBilanBeneficiairePDF.tsx. */
export async function exportFicheBilanBeneficiairePDF(
  data: ExportFicheBilanData,
  fileName: string
): Promise<void> {
  const element = React.createElement(FicheBilanBeneficiairePDF, data);
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Export programme — @react-pdf/renderer ───────────────────────────────────

export interface ExportProgrammeData {
  programme: Programme;
  exercices: Exercice[];
  participant: Participant;
  settings: PdfPraticienSettings;
}

export async function exportProgrammePDF(
  data: ExportProgrammeData,
  fileName: string
): Promise<void> {
  const { programme, exercices } = data;

  // Pré-générer les QR codes pour les exercices avec vidéo
  const qrCodes: Record<string, string> = {};
  const avecVideo = programme.exercices
    .map(ep => exercices.find(e => e.id === ep.exerciceId))
    .filter(ex => !!ex?.videoYoutubeId) as Exercice[];

  await Promise.all(
    avecVideo.map(async ex => {
      if (ex.videoYoutubeId) {
        qrCodes[ex.videoYoutubeId] = await QRCode.toDataURL(
          `https://youtu.be/${ex.videoYoutubeId}`,
          { width: 80, margin: 1, color: { dark: '#0D2B4B', light: '#ffffff' } }
        );
      }
    })
  );

  const element = React.createElement(ProgrammePDF, { ...data, qrCodes });
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
