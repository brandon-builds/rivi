"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GuardianStepStore } from "@/lib/stores/guardianStepStore";
import { CaregiverSessionStore } from "@/lib/stores/caregiverSessionStore";
import { GuardianStep } from "@/lib/types";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const TRANSITION_MS = 200;
const WAKE_PHRASE = "hey rivi";
const TURN_OFF_PHRASE = "turn off guidance";

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export default function HandsFreePage() {
  const [steps, setSteps] = useState<GuardianStep[]>([]);
  const [index, setIndex] = useState(0);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const [guidanceOn, setGuidanceOn] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [guidanceStream, setGuidanceStream] = useState<MediaStream | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [wakeArmed, setWakeArmed] = useState(false);

  const [latestTranscript, setLatestTranscript] = useState("");
  const [guidanceReply, setGuidanceReply] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [replyVersion, setReplyVersion] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const guidanceOnRef = useRef(false);
  const lastProcessedRef = useRef("");
  const router = useRouter();

  useEffect(() => {
    guidanceOnRef.current = guidanceOn;
  }, [guidanceOn]);

  useEffect(() => {
    const savedSteps = GuardianStepStore.loadSteps();
    setSteps(savedSteps);
    setIndex(0);
    CaregiverSessionStore.begin(savedSteps.map((step) => step.id));
  }, []);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = guidanceStream;

    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [guidanceStream]);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const speakOut = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopGuidance = useCallback((announce: boolean) => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);

    setGuidanceStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });

    stopSpeaking();

    setGuidanceOn(false);
    setWakeArmed(false);

    if (announce) {
      speakOut("Guidance is off.");
    }
  }, [speakOut, stopSpeaking]);

  useEffect(() => {
    return () => {
      stopGuidance(false);
    };
  }, [stopGuidance]);

  const currentStep = useMemo(() => steps[index], [steps, index]);
  const isLastStep = index >= steps.length - 1;

  const advanceAfterTransition = () => {
    if (!currentStep) {
      return;
    }

    CaregiverSessionStore.markCompleted(currentStep.id);
    setIsTransitioning(true);

    window.setTimeout(() => {
      if (isLastStep) {
        CaregiverSessionStore.finish(new Date().toISOString());
        router.push("/caregiver/summary");
        return;
      }

      setIndex((current) => Math.min(current + 1, steps.length - 1));
      requestAnimationFrame(() => {
        setIsTransitioning(false);
        setIsAdvancing(false);
      });
    }, TRANSITION_MS);
  };

  const handleConfirmComplete = () => {
    if (isAdvancing || isTransitioning) {
      return;
    }

    setShowCompleteConfirm(false);
    setIsAdvancing(true);
    advanceAfterTransition();
  };

  const requestGuidance = useCallback(async (spokenText: string) => {
    if (!currentStep) {
      return;
    }

    const question = spokenText.trim();
    if (!question) {
      return;
    }

    setLatestTranscript(question);
    setIsThinking(true);
    setGuidanceReply("Thinking...");
    setReplyVersion((curr) => curr + 1);

    try {
      const response = await fetch("/api/rivi-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: question,
          stepContext: {
            stepTitle: currentStep.title,
            guardianNotes: currentStep.notes,
            stepNumber: index + 1,
            totalSteps: steps.length
          }
        })
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      const payload = (await response.json()) as { response?: string };
      const nextReply = payload.response?.trim() || "Take your time. Stay with this step and follow the guardian notes carefully.";
      setGuidanceReply(nextReply);
      setReplyVersion((curr) => curr + 1);
      speakOut(nextReply);
    } catch {
      const fallbackReply = "I could not connect right now. Keep going step by step, and seek urgent professional help if there are immediate safety concerns.";
      setGuidanceReply(fallbackReply);
      setReplyVersion((curr) => curr + 1);
      speakOut(fallbackReply);
    } finally {
      setIsThinking(false);
    }
  }, [currentStep, index, speakOut, steps.length]);

  const processFinalTranscript = useCallback((rawTranscript: string) => {
    const transcript = rawTranscript.trim();
    if (!transcript) {
      return;
    }

    const normalized = transcript.toLowerCase();
    if (lastProcessedRef.current === normalized) {
      return;
    }

    lastProcessedRef.current = normalized;

    if (normalized.includes(TURN_OFF_PHRASE)) {
      stopGuidance(true);
      return;
    }

    if (normalized.includes(WAKE_PHRASE)) {
      const stripped = transcript.replace(/hey\s+rivi/gi, "").replace(/^[-,:\s]+/, "").trim();
      setWakeArmed(true);

      if (stripped) {
        setWakeArmed(false);
        void requestGuidance(stripped);
      }

      return;
    }

    if (wakeArmed) {
      setWakeArmed(false);
      void requestGuidance(transcript);
    }
  }, [requestGuidance, stopGuidance, wakeArmed]);

  const enableGuidance = async () => {
    setPermissionError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionError("Camera and microphone access are required for AI Guidance.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setGuidanceStream(stream);
      setGuidanceOn(true);

      const Recognition = getSpeechRecognition();
      if (Recognition) {
        const recognition = new Recognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => {
          setIsListening(false);

          if (guidanceOnRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              // Browser can throw if restart happens too quickly; ignore and wait for next user action.
            }
          }
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onresult = (event) => {
          const finals: string[] = [];

          for (let i = 0; i < event.results.length; i += 1) {
            const result = event.results[i];
            if (result.isFinal) {
              finals.push(result[0]?.transcript ?? "");
            }
          }

          if (finals.length === 0) {
            return;
          }

          const finalTranscript = finals.join(" ").trim();
          processFinalTranscript(finalTranscript);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setSpeechSupported(true);
      } else {
        setSpeechSupported(false);
      }

      speakOut("I'm on. Ask me anything.");
    } catch {
      setPermissionError("Camera and microphone access are required for AI Guidance.");
      stopGuidance(false);
    }
  };

  const handleGuidanceToggle = async () => {
    if (guidanceOn) {
      stopGuidance(true);
      return;
    }

    await enableGuidance();
  };

  if (!currentStep) {
    return (
      <main className="app-shell flex items-center">
        <section className="rivi-card w-full space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">No Steps Available</p>
          <h1 className="text-2xl font-bold">Run Guardian Setup first.</h1>
          <button type="button" className="btn-primary w-full active:scale-[0.98] transition-transform duration-150" onClick={() => router.push("/guardian/setup")}>
            Open Guardian Setup
          </button>
        </section>
      </main>
    );
  }

  const animatedClass = `step-swap ${isTransitioning ? "step-swap-out" : ""}`;
  const showGuidanceCard = guidanceOn && Boolean(latestTranscript || guidanceReply || isThinking);

  return (
    <>
      <main className="app-shell pb-40">
        <header className="mb-5 flex items-center justify-between">
          <button type="button" className="btn-secondary px-4 active:scale-[0.98] transition-transform duration-150" onClick={() => router.push("/")}>
            Back
          </button>
          <p className="text-base font-bold text-primary">Rivi</p>
        </header>

        <section className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Step {index + 1} of {steps.length}
          </p>

          <h1 className={`text-3xl font-bold tracking-tight text-slate-900 ${animatedClass}`}>{currentStep.title}</h1>

          <div className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 ${animatedClass}`}>
            <p className="text-base leading-relaxed text-slate-700">{currentStep.notes}</p>
          </div>

          <div className={animatedClass}>
            {currentStep.mediaType === "video" && currentStep.mediaUrl ? (
              <video className="w-full rounded-3xl bg-black shadow-sm" src={currentStep.mediaUrl} controls playsInline />
            ) : null}

            {currentStep.mediaType === "image" && currentStep.mediaUrl ? (
              <img className="w-full rounded-3xl bg-white object-cover shadow-sm" src={currentStep.mediaUrl} alt={currentStep.title} />
            ) : null}

            {(currentStep.mediaType === "image" || currentStep.mediaType === "video") && !currentStep.mediaUrl ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                Media for this step is not currently available in local storage.
              </div>
            ) : null}
          </div>

          {showGuidanceCard ? (
            <section className="rivi-card guidance-reply-card" key={replyVersion}>
              <p className="text-sm font-semibold text-primary">Rivi Guidance</p>
              {latestTranscript ? <p className="mt-1 text-xs text-slate-500">You said: {latestTranscript}</p> : null}
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-800">{isThinking ? "Thinking..." : guidanceReply}</p>
              {isSpeaking ? (
                <button type="button" className="btn-secondary mt-3 w-full active:scale-[0.98] transition-transform duration-150" onClick={stopSpeaking}>
                  Stop Speaking
                </button>
              ) : null}
            </section>
          ) : null}
        </section>
      </main>

      {guidanceOn ? (
        <aside className="guidance-panel">
          <div className="guidance-preview-wrap">
            <video ref={videoRef} className="guidance-preview" autoPlay playsInline muted />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`guidance-mic-dot ${isListening ? "guidance-mic-dot-live" : ""}`} />
            <p className="text-xs font-medium text-slate-700">Listening...</p>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Say &quot;Hey Rivi&quot; to ask a question.</p>
          {!speechSupported ? <p className="mt-1 text-[11px] text-slate-500">Voice transcription not supported in this browser.</p> : null}
        </aside>
      ) : null}

      <div className="sticky-cta-bar">
        <div className="mx-auto w-full max-w-md space-y-2">
          <button
            type="button"
            className="btn-primary w-full active:scale-[0.98] transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setShowCompleteConfirm(true)}
            disabled={isAdvancing || isTransitioning}
          >
            Next Step
          </button>
          <button
            type="button"
            className={`w-full rounded-2xl px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.98] ${guidanceOn ? "bg-slate-700 hover:bg-slate-800" : "bg-primary hover:bg-primaryDark"}`}
            onClick={handleGuidanceToggle}
            disabled={isAdvancing || isTransitioning}
          >
            {guidanceOn ? "Turn Off AI Rivi Guidance" : "Enable AI Rivi Guidance"}
          </button>
          {permissionError ? <p className="text-sm text-alert">{permissionError}</p> : null}
        </div>
      </div>

      {showCompleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-soft">
            <h2 className="text-lg font-semibold text-slate-900">Mark this step complete?</h2>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                className="btn-primary w-full active:scale-[0.98] transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleConfirmComplete}
                disabled={isAdvancing || isTransitioning}
              >
                Mark Complete
              </button>
              <button
                type="button"
                className="btn-secondary w-full active:scale-[0.98] transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setShowCompleteConfirm(false)}
                disabled={isAdvancing || isTransitioning}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
