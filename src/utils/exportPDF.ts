import React from 'react';
import { pdf } from '@react-pdf/renderer';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Bilan, Participant, NotesBilan, Programme, Exercice } from '../types';
import type { PdfPraticienSettings } from '../components/export/PdfShared';
import FicheBilanPDF from '../components/export/FicheBilanPDF';
import ProgrammePDF from '../components/export/ProgrammePDF';
import QRCode from 'qrcode';

// ─── Helper DOM→PDF (legacy — utilisé par ExportButton) ──────────────────────

async function captureElement(id: string, delayMs = 150): Promise<HTMLCanvasElement> {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Élément #${id} introuvable`);
  el.style.display = 'block';
  await new Promise<void>(r => setTimeout(r, delayMs));
  const canvas = await html2canvas(el, {
    scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
  });
  el.style.display = 'none';
  return canvas;
}

function placeCanvas(pdf: jsPDF, canvas: HTMLCanvasElement) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageW) / canvas.width;
  const img = canvas.toDataURL('image/png');
  if (imgH <= pageH) {
    pdf.addImage(img, 'PNG', 0, 0, pageW, imgH);
  } else {
    let y = 0;
    while (y < imgH) {
      if (y > 0) pdf.addPage();
      pdf.addImage(img, 'PNG', 0, -y, pageW, imgH);
      y += pageH;
    }
  }
}

// ─── Export rapport HTML (ExportButton) ───────────────────────────────────────

export async function exportPDF(elementId: string, fileName: string): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const canvas = await captureElement(elementId, 100);
  placeCanvas(doc, canvas);
  doc.save(fileName);
}

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
