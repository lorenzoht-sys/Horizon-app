// Reconnaissance vocale du navigateur (Web Speech API). TypeScript ne la
// déclare pas (elle reste préfixée « webkit » dans Chrome et Safari) : ce
// module en décrit le sous-ensemble utilisé par la dictée (27/11/2026).

interface ResultatReconnaissance {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
}

export interface EvenementResultat {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: ResultatReconnaissance };
}

export interface EvenementErreur {
  readonly error: string;
}

export interface ReconnaissanceVocale {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((e: EvenementResultat) => void) | null;
  onerror: ((e: EvenementErreur) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type ConstructeurReconnaissance = new () => ReconnaissanceVocale;

/** Constructeur du navigateur, ou null s'il ne propose pas la dictée. */
export function constructeurReconnaissance(): ConstructeurReconnaissance | null {
  const w = window as unknown as {
    SpeechRecognition?: ConstructeurReconnaissance;
    webkitSpeechRecognition?: ConstructeurReconnaissance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
