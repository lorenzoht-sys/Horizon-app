import { useState, useRef, useCallback } from 'react';

export interface SpeechRecognitionHook {
  isRecording: boolean;
  finalTranscript: string;
  interimTranscript: string;
  isSupported: boolean;
  isIOS: boolean;
  error: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  reset: () => void;
}

const isIOSDevice =
  typeof window !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !('MSStream' in window);

export function useSpeechRecognition(): SpeechRecognitionHook {
  const [isRecording, setIsRecording]         = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError]                     = useState<string | null>(null);

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const recognitionRef    = useRef<any>(null);
  const wantsRecordingRef = useRef(false);
  const accumulatedRef    = useRef('');

  // Ref vers la fonction de setup pour éviter les closures périmées sur iOS
  const setupRecognitionRef = useRef<(r: any) => void>(null!);
  setupRecognitionRef.current = (recognition: any) => {
    recognition.lang            = 'fr-FR';
    recognition.continuous      = !isIOSDevice; // iOS : sessions courtes
    recognition.interimResults  = true;

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = (e: any) => {
      let newFinal = '';
      let currentInterim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          newFinal += e.results[i][0].transcript;
        } else {
          currentInterim += e.results[i][0].transcript;
        }
      }
      if (newFinal) {
        accumulatedRef.current += newFinal + ' ';
        setFinalTranscript(accumulatedRef.current);
      }
      setInterimTranscript(currentInterim);
    };

    recognition.onerror = (e: any) => {
      // Sur iOS, 'no-speech' est normal en fin de session — ne pas afficher d'erreur
      if (e.error === 'no-speech') return;
      const messages: Record<string, string> = {
        'not-allowed':    "Microphone non autorisé. Autorisez l'accès dans les paramètres du navigateur.",
        'audio-capture':  "Impossible d'accéder au microphone.",
        'network':        'Erreur réseau lors de la reconnaissance.',
      };
      setError(messages[e.error] ?? `Erreur microphone : ${e.error}`);
      wantsRecordingRef.current = false;
      setIsRecording(false);
    };

    recognition.onend = () => {
      setInterimTranscript('');
      // Sur iOS : redémarrer automatiquement si l'utilisateur veut toujours dicter
      if (isIOSDevice && wantsRecordingRef.current) {
        setTimeout(() => {
          const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          if (!SR || !wantsRecordingRef.current) {
            setIsRecording(false);
            return;
          }
          const newRec = new SR();
          setupRecognitionRef.current(newRec);
          recognitionRef.current = newRec;
          try {
            newRec.start();
          } catch {
            setIsRecording(false);
            wantsRecordingRef.current = false;
          }
        }, 150);
      } else {
        setIsRecording(false);
      }
    };
  };

  const startRecording = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('Fonctionnalité disponible sur Chrome ou Safari uniquement');
      return;
    }

    setError(null);
    wantsRecordingRef.current = true;
    accumulatedRef.current    = '';

    const recognition = new SR();
    setupRecognitionRef.current(recognition);
    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setError('Impossible de démarrer le microphone.');
      wantsRecordingRef.current = false;
    }
  }, []);

  const stopRecording = useCallback(() => {
    wantsRecordingRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    wantsRecordingRef.current = false;
    recognitionRef.current?.stop();
    accumulatedRef.current = '';
    setIsRecording(false);
    setFinalTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    isRecording,
    finalTranscript,
    interimTranscript,
    isSupported,
    isIOS: isIOSDevice,
    error,
    startRecording,
    stopRecording,
    reset,
  };
}
