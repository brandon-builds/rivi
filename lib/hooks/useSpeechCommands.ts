"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CommandMap = {
  next: () => void;
  repeat: () => void;
  clarify: () => void;
};

type SpeechState = {
  supported: boolean;
  listening: boolean;
  transcript: string;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognition = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const getSpeechRecognition = (): BrowserSpeechRecognition | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const w = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognition;
    webkitSpeechRecognition?: BrowserSpeechRecognition;
  };

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const useSpeechCommands = (commands: CommandMap): SpeechState => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<InstanceType<BrowserSpeechRecognition> | null>(null);

  const Recognition = useMemo(() => getSpeechRecognition(), []);
  const supported = Boolean(Recognition);

  useEffect(() => {
    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.onresult = (event) => {
      const latest = event.results[event.results.length - 1];
      const text = latest[0]?.transcript?.toLowerCase().trim() ?? "";
      setTranscript(text);

      if (!latest.isFinal) {
        return;
      }

      if (text.includes("next")) {
        commands.next();
        return;
      }

      if (text.includes("repeat")) {
        commands.repeat();
        return;
      }

      if (text.includes("what is that") || text.includes("i'm unsure") || text.includes("i am unsure")) {
        commands.clarify();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [Recognition, commands]);

  const start = () => {
    recognitionRef.current?.start();
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  return { supported, listening, transcript, start, stop };
};
