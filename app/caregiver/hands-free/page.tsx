"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useSpeechCommands } from "@/lib/hooks/useSpeechCommands";
import { ProtocolStore } from "@/lib/stores/protocolStore";
import { GuardianProtocol } from "@/lib/types";

const CURRENT_STEP_KEY = "caregiver_current_step";

export default function HandsFreePage() {
  const [protocol, setProtocol] = useState<GuardianProtocol | null>(null);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    const data = ProtocolStore.loadProtocol();
    if (!data) {
      setStatus("No protocol found.");
      return;
    }

    setProtocol(data);
    if (data.steps.length === 0) {
      setStatus("Protocol has no steps yet.");
      return;
    }

    setStatus("Ready.");
  }, []);

  const step = useMemo(() => protocol?.steps[index], [protocol, index]);

  useEffect(() => {
    if (!step) {
      return;
    }

    localStorage.setItem(CURRENT_STEP_KEY, String(step.stepNumber));
  }, [step]);

  const seekStepStart = useCallback(() => {
    if (!videoRef.current || !step) {
      return;
    }

    videoRef.current.currentTime = step.timestampStart ?? 0;
    void videoRef.current.play();
  }, [step]);

  const goNext = useCallback(() => {
    if (!protocol || protocol.steps.length === 0) {
      return;
    }

    setIndex((curr) => {
      const next = Math.min(curr + 1, protocol.steps.length - 1);
      return next;
    });
  }, [protocol]);

  const goClarify = useCallback(() => {
    router.push("/caregiver/clarify");
  }, [router]);

  const speech = useSpeechCommands({
    next: goNext,
    repeat: seekStepStart,
    clarify: goClarify
  });

  useEffect(() => {
    if (!speech.supported) {
      return;
    }

    speech.start();
    return () => speech.stop();
  }, [speech.supported]);

  useEffect(() => {
    if (!step || !videoRef.current) {
      return;
    }

    videoRef.current.currentTime = step.timestampStart ?? 0;
  }, [step]);

  if (!protocol || !step) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl p-6">
        <AppHeader />
        <h1 className="mb-3 text-3xl font-bold">Hands-Free Mode</h1>
        <p className="text-lg text-alert">{status || "No step available."}</p>
        <Link className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white" href="/caregiver">Back</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-4 sm:p-6">
      <AppHeader />
      <h1 className="mb-3 text-3xl font-bold">Hands-Free Mode</h1>
      <section className="space-y-5 rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Step {step.stepNumber} of {protocol.steps.length}</p>
        <h2 className="text-4xl font-black leading-tight text-primary sm:text-5xl">{step.title}</h2>
        <p className="rounded-xl bg-slate-100 p-4 text-lg">{step.guardianNotes}</p>

        <video
          ref={videoRef}
          className="w-full rounded-xl border bg-black"
          controls
          src={protocol.videoUrl}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button className="rounded-2xl bg-primary px-6 py-6 text-3xl font-extrabold text-white" onClick={goNext}>Next</button>
          <button className="rounded-2xl bg-slate-900 px-6 py-6 text-3xl font-extrabold text-white" onClick={seekStepStart}>Repeat</button>
          <button className="rounded-2xl bg-alert px-6 py-6 text-3xl font-extrabold text-white" onClick={goClarify}>I&apos;m Unsure</button>
        </div>

        <div className="rounded-xl border p-3">
          <p className="font-semibold">Voice Indicator: {speech.supported ? (speech.listening ? "Listening" : "Idle") : "Unsupported"}</p>
          {speech.supported ? (
            <p className="text-sm text-slate-600">Try: “Next”, “Repeat”, “What is that?”, “I&apos;m unsure”. Heard: {speech.transcript || "-"}</p>
          ) : (
            <p className="text-sm text-slate-600">Voice commands are not supported in this browser. Use the large action buttons.</p>
          )}
        </div>
      </section>
    </main>
  );
}
