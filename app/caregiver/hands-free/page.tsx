"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FloatingAskRivi } from "@/components/FloatingAskRivi";
import { useRiviRealtimeAssistant } from "@/lib/hooks/useRiviRealtimeAssistant";
import { GuardianStepStore } from "@/lib/stores/guardianStepStore";
import { CaregiverSessionStore } from "@/lib/stores/caregiverSessionStore";
import { GuardianStep } from "@/lib/types";

const TRANSITION_MS = 200;

export default function HandsFreePage() {
  const [steps, setSteps] = useState<GuardianStep[]>([]);
  const [index, setIndex] = useState(0);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const [guidanceOn, setGuidanceOn] = useState(false);
  const [permissionError, setPermissionError] = useState("");

  const [latestTranscript, setLatestTranscript] = useState("");
  const [guidanceReply, setGuidanceReply] = useState("");
  const [replyVersion, setReplyVersion] = useState(0);

  const previewRef = useRef<HTMLVideoElement | null>(null);
  const stepIntroPendingRef = useRef(false);
  const isAdvancingRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    isAdvancingRef.current = isAdvancing;
  }, [isAdvancing]);

  useEffect(() => {
    isTransitioningRef.current = isTransitioning;
  }, [isTransitioning]);

  const currentStep = useMemo(() => steps[index], [steps, index]);
  const isLastStep = index >= steps.length - 1;

  const assistant = useRiviRealtimeAssistant({
    steps,
    currentStepId: currentStep?.id,
    requireVideo: true,
    onTranscript: (transcript) => {
      const compact = transcript.trim().toLowerCase().replace(/[.!?]/g, "");
      const isConfirmation = /\b(done|okay|ok|got it|finished)\b/.test(compact);

      if (isConfirmation) {
        setLatestTranscript(transcript);
        setGuidanceReply("Great. Let's move to the next step.");
        setReplyVersion((curr) => curr + 1);

        if (!isAdvancingRef.current && !isTransitioningRef.current && currentStep) {
          setIsAdvancing(true);
          stepIntroPendingRef.current = true;
          setShowCompleteConfirm(false);
          CaregiverSessionStore.markCompleted(currentStep.id);
          setIsTransitioning(true);

          window.setTimeout(() => {
            if (isLastStep) {
              CaregiverSessionStore.finish(new Date().toISOString());
              router.push("/caregiver/summary");
              return;
            }

            setIndex((curr) => Math.min(curr + 1, steps.length - 1));
            requestAnimationFrame(() => {
              setIsTransitioning(false);
              setIsAdvancing(false);
            });
          }, TRANSITION_MS);
        }

        return;
      }

      setLatestTranscript(transcript);
      setGuidanceReply("Thinking...");
      setReplyVersion((curr) => curr + 1);
    },
    onReplyDelta: (text) => {
      setGuidanceReply(text);
    },
    onReplyDone: (text) => {
      setGuidanceReply(text);
      setReplyVersion((curr) => curr + 1);
    }
  });

  const {
    error: assistantError,
    sessionActive,
    updateContext,
    sendRealtimeEvent,
    stopAll,
    remoteAudioRef,
    mediaStream,
    voiceState,
    realtimeSupported,
    tapWidget
  } = assistant;

  useEffect(() => {
    setPermissionError(assistantError);
  }, [assistantError]);

  useEffect(() => {
    const savedSteps = GuardianStepStore.loadSteps();
    setSteps(savedSteps);
    setIndex(0);
    CaregiverSessionStore.begin(savedSteps.map((step) => step.id));
  }, []);

  useEffect(() => {
    if (!sessionActive || !guidanceOn) {
      return;
    }

    updateContext();

    if (stepIntroPendingRef.current && currentStep) {
      sendRealtimeEvent({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: `Start with: Great. Let's move to the next step. Then briefly guide step ${index + 1} of ${steps.length}: "${currentStep.title}" using guardian notes first in 1-2 short sentences.`
        }
      });
      stepIntroPendingRef.current = false;
    }
  }, [currentStep, guidanceOn, index, sendRealtimeEvent, sessionActive, steps.length, updateContext]);

  useEffect(() => {
    if (!sessionActive || !guidanceOn || !currentStep) {
      return;
    }

    sendRealtimeEvent({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: `Start with a calm transition phrase. Then guide step ${index + 1} of ${steps.length}: "${currentStep.title}" using guardian notes first in 1-2 short sentences.`
      }
    });
  }, [currentStep, guidanceOn, index, sendRealtimeEvent, sessionActive, steps.length]);

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, [stopAll]);

  useEffect(() => {
    if (!previewRef.current) {
      return;
    }

    previewRef.current.srcObject = mediaStream;
  }, [mediaStream]);

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

      setIndex((curr) => Math.min(curr + 1, steps.length - 1));
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
    stepIntroPendingRef.current = true;
    advanceAfterTransition();
  };

  const handleGuidanceToggle = async () => {
    if (guidanceOn) {
      stopAll();
      setGuidanceOn(false);
      return;
    }

    setPermissionError("");
    setGuidanceOn(true);
  };

  if (!currentStep) {
    return (
      <main className="app-shell flex items-center">
        <section className="rivi-card w-full space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">No Steps Available</p>
          <h1 className="text-2xl font-bold">Run Guardian Setup first.</h1>
          <button type="button" className="btn-primary w-full active:scale-[0.98] transition-transform duration-150" onClick={() => router.push("/guardian/setup")}>Open Guardian Setup</button>
        </section>
      </main>
    );
  }

  const animatedClass = `step-swap ${isTransitioning ? "step-swap-out" : ""}`;
  const showGuidanceCard = Boolean(latestTranscript || guidanceReply);

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline hidden />
      <main className="app-shell pb-40">
        <header className="mb-5 flex items-center justify-between">
          <button type="button" className="btn-secondary px-4 active:scale-[0.98] transition-transform duration-150" onClick={() => router.push("/")}>Back</button>
          <p className="text-base font-bold text-primary">Rivi</p>
        </header>

        <section className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Step {index + 1} of {steps.length}</p>
          <h1 className={`text-3xl font-bold tracking-tight text-slate-900 ${animatedClass}`}>{currentStep.title}</h1>

          <div className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 ${animatedClass}`}>
            <p className="text-base leading-relaxed text-slate-700">{currentStep.notes}</p>
          </div>

          <div className={animatedClass}>
            {currentStep.mediaType === "video" && currentStep.mediaUrl ? <video className="w-full rounded-3xl bg-black shadow-sm" src={currentStep.mediaUrl} controls playsInline /> : null}
            {currentStep.mediaType === "image" && currentStep.mediaUrl ? <img className="w-full rounded-3xl bg-white object-cover shadow-sm" src={currentStep.mediaUrl} alt={currentStep.title} /> : null}
            {(currentStep.mediaType === "image" || currentStep.mediaType === "video") && !currentStep.mediaUrl ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">Media for this step is not currently available in local storage.</div> : null}
          </div>

          {showGuidanceCard ? (
            <section className="rivi-card guidance-reply-card" key={replyVersion}>
              <p className="text-sm font-semibold text-primary">Rivi Guidance</p>
              {latestTranscript ? <p className="mt-1 text-xs text-slate-500">You said: {latestTranscript}</p> : null}
              {guidanceReply ? <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-800">{guidanceReply}</p> : null}
            </section>
          ) : null}
        </section>
      </main>

      {guidanceOn ? (
        <>
          <aside className="guidance-panel">
            <div className="guidance-preview-wrap">
              <video ref={previewRef} className="guidance-preview" autoPlay playsInline muted />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`guidance-mic-dot ${voiceState === "listening" ? "guidance-mic-dot-live" : ""}`} />
              <p className="text-xs font-medium text-slate-700">{voiceState === "connecting" ? "Connecting..." : voiceState === "listening" ? "Listening..." : voiceState === "speaking" ? "Speaking..." : voiceState === "error" ? "Error" : "Ready"}</p>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Guidance is on. Tap Ask Rivi whenever you need help.</p>
            {!realtimeSupported ? <p className="mt-1 text-[11px] text-slate-500">Realtime voice is not supported in this browser.</p> : null}
          </aside>

          <FloatingAskRivi state={voiceState} onTap={() => { void tapWidget(); }} disabled={voiceState === "connecting" || !realtimeSupported} visible />
        </>
      ) : null}

      <div className="sticky-cta-bar">
        <div className="mx-auto w-full max-w-md space-y-2">
          <button type="button" className="btn-primary w-full active:scale-[0.98] transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => setShowCompleteConfirm(true)} disabled={isAdvancing || isTransitioning}>Next Step</button>
          <button type="button" className={`w-full rounded-2xl px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.98] ${guidanceOn ? "bg-slate-700 hover:bg-slate-800" : "bg-primary hover:bg-primaryDark"}`} onClick={() => { void handleGuidanceToggle(); }} disabled={isAdvancing || isTransitioning}>{guidanceOn ? "Turn Off AI Rivi Guidance" : "Enable AI Rivi Guidance"}</button>
          {permissionError ? <p className="text-sm text-alert">{permissionError}</p> : null}
        </div>
      </div>

      {showCompleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-soft">
            <h2 className="text-lg font-semibold text-slate-900">Mark this step complete?</h2>
            <div className="mt-4 space-y-2">
              <button type="button" className="btn-primary w-full active:scale-[0.98] transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-60" onClick={handleConfirmComplete} disabled={isAdvancing || isTransitioning}>Mark Complete</button>
              <button type="button" className="btn-secondary w-full active:scale-[0.98] transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => setShowCompleteConfirm(false)} disabled={isAdvancing || isTransitioning}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
