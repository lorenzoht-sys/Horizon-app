import { useState, useRef, useCallback } from 'react';

export interface SpeechRecognitionHook {
  isRecording: boolean;
  finalTranscript: string;
  interimTranscript: string;
  isSupported: boolean;
  error: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  reset: () => void;
}

export function useSpeechRecognition(): SpeechRecognitionHook {
  const [isRecording, setIsRecording] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const recognitionRef = useRef<any>(null);

  const startRecording = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('Fonctionnalité disponible sur Chrome uniquement');
      return;
    }

    setError(null);

    const recognition = new SR();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;

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

      if (newFinal) setFinalTranscript(prev => prev + newFinal + ' ');
      setInterimTranscript(currentInterim);
    };

    recognition.onerror = (e: any) => {
      const messages: Record<string, string> = {
        'not-allowed': "Microphone non autorisé. Veuillez autoriser l'accès dans les paramètres du navigateur.",
        'audio-capture': "Impossible d'accéder au microphone.",
        'no-speech': 'Aucune parole détectée.',
        'network': 'Erreur réseau lors de la reconnaissance.',
      };
      setError(messages[e.error] ?? `Erreur microphone : ${e.error}`);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setError('Impossible de démarrer le microphone.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    recognitionRef.current?.stop();
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
    error,
    startRecording,
    stopRecording,
    reset,
  };
}
