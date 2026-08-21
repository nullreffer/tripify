import { useRef, useCallback, useEffect, useState } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * Shared hook for SpeechRecognition + speechSynthesis.
 * Returns { supported, listening, startListening, stopListening, speak, cancelSpeech }
 */
export function useVoice({ onResult, onError } = {}) {
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const supported = !!SpeechRecognition && 'speechSynthesis' in window;

  // Clean up on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) return;
    if (recognitionRef.current) recognitionRef.current.abort();

    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);

    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      onResult?.(transcript);
    };

    rec.onerror = (e) => {
      setListening(false);
      if (e.error !== 'no-speech') onError?.(e.error);
    };

    recognitionRef.current = rec;
    rec.start();
  }, [onResult, onError]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback((text, { rate = 1, pitch = 1 } = {}) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = rate;
    utt.pitch = pitch;
    window.speechSynthesis.speak(utt);
  }, []);

  const cancelSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
  }, []);

  return { supported, listening, startListening, stopListening, speak, cancelSpeech };
}
