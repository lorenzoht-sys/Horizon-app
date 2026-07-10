import { describe, it, expect } from 'vitest';
import { resoudreTranscriptionFinale } from './dicteeTranscription';

describe('resoudreTranscriptionFinale', () => {
  it('utilise finalTranscript quand il est présent', () => {
    const res = resoudreTranscriptionFinale('Trois séries de dix squats. ', 'et ensuite');
    expect(res).toEqual({ texte: 'Trois séries de dix squats.', aUtiliseSecoursInterim: false });
  });

  it('se replie sur interimTranscript quand finalTranscript est vide', () => {
    const res = resoudreTranscriptionFinale('', '  Trois séries de dix squats  ');
    expect(res).toEqual({ texte: 'Trois séries de dix squats', aUtiliseSecoursInterim: true });
  });

  it('se replie sur interimTranscript quand finalTranscript ne contient que des espaces', () => {
    const res = resoudreTranscriptionFinale('   ', 'dix squats');
    expect(res).toEqual({ texte: 'dix squats', aUtiliseSecoursInterim: true });
  });

  it("renvoie texte: null quand finalTranscript et interimTranscript sont vides", () => {
    const res = resoudreTranscriptionFinale('', '');
    expect(res).toEqual({ texte: null, aUtiliseSecoursInterim: false });
  });

  it("renvoie texte: null quand les deux ne contiennent que des espaces", () => {
    const res = resoudreTranscriptionFinale('   ', '\t\n');
    expect(res).toEqual({ texte: null, aUtiliseSecoursInterim: false });
  });
});
