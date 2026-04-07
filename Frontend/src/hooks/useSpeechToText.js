import { useEffect, useMemo, useRef, useState } from "react";

export function useSpeechToText({ onText, onError } = {}) {
  const recognition = useRef(null);
  const [listening, setListening] = useState(false);
  const supported = useMemo(() => {
    return typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    if (!supported) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-US";

    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);

    r.onerror = (e) => {
      setListening(false);
      onError?.(e?.error || "speech_error");
    };

    r.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalText += txt;
        else interimText += txt;
      }

      if (interimText) onText?.(interimText, { interim: true });
      if (finalText) onText?.(finalText, { interim: false });
    };

    recognition.current = r;
  }, [supported, onText, onError]);

  function start() {
    if (!supported) return false;
    try {
      recognition.current?.start();
      return true;
    } catch {
      return false;
    }
  }

  function stop() {
    try {
      recognition.current?.stop();
    } catch {
      // ignore
    }
  }

  return { supported, listening, start, stop };
}