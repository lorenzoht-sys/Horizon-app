import React from 'react';
import { pdf } from '@react-pdf/renderer';
import type { Bilan, Participant, NotesBilan, Programme, ProgrammeV2, Exercice } from '../types';
import type { PdfPraticienSettings } from '../components/export/PdfShared';
import FicheBilanPDF from '../components/export/FicheBilanPDF';
import FicheBilanBeneficiairePDF from '../components/export/FicheBilanBeneficiairePDF';
import ProgrammePDF from '../components/export/ProgrammePDF';
import { normaliserProgrammeV1, normaliserProgrammeV2 } from '../lib/programmePDF';
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
//
// Accepte un programme V1 (`Programme`, une seule liste d'exercices à plat)
// ou V2 (`ProgrammeV2`, plusieurs séances nommées) : les deux sont
// normalisés vers la même forme avant le rendu (src/lib/programmePDF.ts),
// ProgrammePDF.tsx ne connaît que cette forme unique.

export interface ExportProgrammeData {
  programme: Programme | ProgrammeV2;
  exercices: Exercice[];
  participant: Participant;
  settings: PdfPraticienSettings;
  /** V2 uniquement : restreint l'export à ces séances (undefined = toutes).
   *  Sans effet sur un programme V1, qui n'a qu'une séance implicite. */
  seanceIds?: string[];
}

export async function exportProgrammePDF(
  data: ExportProgrammeData,
  fileName: string
): Promise<void> {
  const { programme, exercices, participant, settings, seanceIds } = data;

  const programmeNormalise = 'seances' in programme
    ? normaliserProgrammeV2(programme, exercices, participant.profilHandicap, seanceIds)
    : normaliserProgrammeV1(programme, exercices, participant.profilHandicap);

  // Pré-générer les QR codes pour les exercices avec vidéo, toutes séances
  // retenues confondues.
  const qrCodes: Record<string, string> = {};
  const avecVideo = programmeNormalise.seances
    .flatMap(s => s.exercices)
    .filter((ex): ex is typeof ex & { videoYoutubeId: string } => !!ex.videoYoutubeId);

  await Promise.all(
    avecVideo.map(async ex => {
      qrCodes[ex.videoYoutubeId] = await QRCode.toDataURL(
        `https://youtu.be/${ex.videoYoutubeId}`,
        { width: 80, margin: 1, color: { dark: '#0D2B4B', light: '#ffffff' } }
      );
    })
  );

  const element = React.createElement(ProgrammePDF, { participant, programme: programmeNormalise, settings, qrCodes });
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
