"use client";

import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AIService } from "@/lib/services/aiService";
import { ProtocolStore } from "@/lib/stores/protocolStore";
import { GuardianProtocol } from "@/lib/types";

type BrowserSpeechRecognition = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
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

export default function ClarifyPage() {
  const [protocol, setProtocol] = useState<GuardianProtocol | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [listening, setListening] = useState(false);
  const [currentStepNumber, setCurrentStepNumber] = useState<number | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const data = ProtocolStore.loadProtocol();
    if (!data) {
      setError("No protocol found. Guardian must upload and define steps first.");
      return;
    }

    setProtocol(data);
  }, []);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError("Unable to access camera. Check browser permissions.");
      }
    };

    void startCamera();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = localStorage.getItem("caregiver_current_step");
    setCurrentStepNumber(raw ? Number(raw) : undefined);
  }, []);

  const askQuestion = async () => {
    if (!protocol || !question.trim()) {
      return;
    }

    setIsAsking(true);
    setAnswer("");

    const result = await AIService.askClarification({
      question: question.trim(),
      currentStepNumber,
      protocol
    });

    setAnswer(result);
    setIsAsking(false);
  };

  const handleVoiceInput = () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setError("Voice input unsupported in this browser. Type your question instead.");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      setQuestion(text);
      setListening(false);
    };

    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-4 sm:p-6">
      <AppHeader />
      <h1 className="mb-4 text-3xl font-bold">Clarification Mode</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-surface p-4 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold">Pick-up Camera</h2>
          <video ref={videoRef} className="aspect-[3/4] w-full rounded-xl bg-black object-cover" autoPlay muted playsInline />
          <p className="mt-2 text-sm text-slate-600">Point camera at the area you need help with.</p>
        </section>

        <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
          <h2 className="text-xl font-semibold">Ask for Clarification</h2>
          <textarea
            rows={5}
            className="w-full rounded-lg border p-3"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask your question..."
          />
          <div className="flex flex-wrap gap-2">
            <button className="rounded-xl bg-primary px-5 py-3 font-semibold text-white" onClick={askQuestion} disabled={isAsking || !protocol}>
              {isAsking ? "Asking..." : "Ask"}
            </button>
            <button className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white" onClick={handleVoiceInput}>
              {listening ? "Listening..." : "Voice Input"}
            </button>
          </div>
          <div className="rounded-lg bg-slate-100 p-3 text-sm">
            <p className="font-semibold">Mock AI Response</p>
            <p>{answer || "No answer yet."}</p>
          </div>
          {error ? <p className="text-sm text-alert">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
