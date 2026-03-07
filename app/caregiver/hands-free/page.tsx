"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GuardianStepStore } from "@/lib/stores/guardianStepStore";
import { CaregiverSessionStore } from "@/lib/stores/caregiverSessionStore";
import { GuardianStep } from "@/lib/types";

type CaptureState = "idle" | "recording" | "transcribing" | "thinking";

const TRANSITION_MS = 200;
const MAX_RECORDING_MS = 9000;

const pickRecorderMimeType = (): string | undefined => {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return undefined;
  }

  const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  return preferred.find((type) => MediaRecorder.isTypeSupported(type));
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
  const [recordingSupported, setRecordingSupported] = useState(true);

  const [latestTranscript, setLatestTranscript] = useState("");
  const [guidanceReply, setGuidanceReply] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [replyVersion, setReplyVersion] = useState(0);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordingTracksRef = useRef<MediaStreamTrack[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const guidanceOnRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    guidanceOnRef.current = guidanceOn;
  }, [guidanceOn]);

  useEffect(() => {
    const savedSteps = GuardianStepStore.loadSteps();
    setSteps(savedSteps);
    setIndex(0);
    CaregiverSessionStore.begin(savedSteps.map((step) => step.id));

    setRecordingSupported(typeof window !== "undefined" && typeof MediaRecorder !== "undefined");
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

  const clearRecordingTimeout = () => {
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  };

  const stopActiveRecording = useCallback(() => {
    clearRecordingTimeout();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    mediaRecorderRef.current = null;
    recordingTracksRef.current.forEach((track) => track.stop());
    recordingTracksRef.current = [];
  }, []);

  const stopGuidance = useCallback((announce: boolean) => {
    stopActiveRecording();

    setGuidanceStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });

    stopSpeaking();

    setGuidanceOn(false);
    setCaptureState("idle");

    if (announce) {
      speakOut("Guidance is off.");
    }
  }, [speakOut, stopActiveRecording, stopSpeaking]);

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
      setPermissionError("I couldn’t hear that. Please try again.");
      return;
    }

    setLatestTranscript(question);
    setPermissionError("");
    setCaptureState("thinking");
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
      if (guidanceOnRef.current) {
        setCaptureState("idle");
      }
    }
  }, [currentStep, index, speakOut, steps.length]);

  const handleTranscribeAndRespond = useCallback(async (audioBlob: Blob) => {
    if (!audioBlob.size) {
      setPermissionError("I couldn’t hear that. Please try again.");
      setCaptureState("idle");
      return;
    }

    setCaptureState("transcribing");

    try {
      const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([audioBlob], `rivi-guidance.${extension}`, {
        type: audioBlob.type || "audio/webm"
      });

      const formData = new FormData();
      formData.append("audio", file);

      const response = await fetch("/api/rivi-transcribe", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error("Transcription failed");
      }

      const payload = (await response.json()) as { transcript?: string };
      const transcript = payload.transcript?.trim();

      if (!transcript) {
        setPermissionError("I couldn’t hear that. Please try again.");
        setCaptureState("idle");
        return;
      }

      await requestGuidance(transcript);
    } catch {
      setPermissionError("I couldn’t hear that. Please try again.");
      setCaptureState("idle");
    }
  }, [requestGuidance]);

  const stopRecordingSession = useCallback(() => {
    if (captureState !== "recording") {
      return;
    }

    stopActiveRecording();
  }, [captureState, stopActiveRecording]);

  const startRecordingSession = () => {
    if (!guidanceOn || captureState !== "idle") {
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setRecordingSupported(false);
      setPermissionError("Voice capture is not supported in this browser.");
      return;
    }

    if (!guidanceStream) {
      setPermissionError("Camera and microphone access are required for AI Guidance.");
      return;
    }

    const audioTracks = guidanceStream.getAudioTracks();
    if (audioTracks.length === 0) {
      setPermissionError("Camera and microphone access are required for AI Guidance.");
      return;
    }

    setPermissionError("");
    recordedChunksRef.current = [];
    const tracks = audioTracks.map((track) => track.clone());
    recordingTracksRef.current = tracks;

    const recordingStream = new MediaStream(tracks);
    const mimeType = pickRecorderMimeType();

    const recorder = mimeType
      ? new MediaRecorder(recordingStream, { mimeType })
      : new MediaRecorder(recordingStream);

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      clearRecordingTimeout();
      setCaptureState("idle");
      const blobType = mimeType ?? recorder.mimeType ?? "audio/webm";
      const audioBlob = new Blob(recordedChunksRef.current, { type: blobType });
      recordedChunksRef.current = [];
      recordingTracksRef.current.forEach((track) => track.stop());
      recordingTracksRef.current = [];
      mediaRecorderRef.current = null;
      void handleTranscribeAndRespond(audioBlob);
    };

    recorder.onerror = () => {
      clearRecordingTimeout();
      setCaptureState("idle");
      setPermissionError("I couldn’t hear that. Please try again.");
      recordingTracksRef.current.forEach((track) => track.stop());
      recordingTracksRef.current = [];
      mediaRecorderRef.current = null;
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setCaptureState("recording");

    recordingTimeoutRef.current = window.setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }, MAX_RECORDING_MS);
  };

  const handleAskRiviTap = () => {
    if (captureState === "recording") {
      stopRecordingSession();
      return;
    }

    startRecordingSession();
  };

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
  const showGuidanceCard = Boolean(latestTranscript || guidanceReply || captureState === "thinking" || captureState === "transcribing");

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
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                {captureState === "transcribing" ? "Transcribing..." : captureState === "thinking" ? "Thinking..." : guidanceReply}
              </p>
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
        <>
          <aside className="guidance-panel">
            <div className="guidance-preview-wrap">
              <video ref={videoRef} className="guidance-preview" autoPlay playsInline muted />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`guidance-mic-dot ${captureState === "recording" ? "guidance-mic-dot-live" : ""}`} />
              <p className="text-xs font-medium text-slate-700">
                {captureState === "recording" ? "Recording..." : captureState === "transcribing" ? "Transcribing..." : captureState === "thinking" ? "Thinking..." : "Guidance On"}
              </p>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Guidance is on. Tap Ask Rivi whenever you need help.</p>
            {!recordingSupported ? <p className="mt-1 text-[11px] text-slate-500">Voice capture is not supported in this browser.</p> : null}
          </aside>

          <div className="guidance-fab-wrap">
            <button
              type="button"
              className={`guidance-fab ${captureState === "recording" ? "guidance-fab-listening" : ""}`}
              onClick={handleAskRiviTap}
              disabled={captureState === "transcribing" || captureState === "thinking" || !recordingSupported}
              aria-label="Ask Rivi"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 15a3 3 0 0 0 3-3V8a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z" fill="currentColor" />
                <path d="M18 11.5a6 6 0 0 1-12 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M12 17.5V21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
            <p className="guidance-fab-label">Ask Rivi</p>
          </div>
        </>
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
