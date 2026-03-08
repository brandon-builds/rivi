"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FloatingAskRivi } from "@/components/FloatingAskRivi";
import { useRiviRealtimeAssistant } from "@/lib/hooks/useRiviRealtimeAssistant";
import { GuardianStepStore } from "@/lib/stores/guardianStepStore";
import { GuardianStep } from "@/lib/types";

export default function CaregiverPage() {
  const [checked, setChecked] = useState(false);
  const [hasSteps, setHasSteps] = useState(false);
  const [steps, setSteps] = useState<GuardianStep[]>([]);
  const router = useRouter();

  const assistant = useRiviRealtimeAssistant({
    steps,
    currentStepId: steps[0]?.id
  });

  useEffect(() => {
    const loadedSteps = GuardianStepStore.loadSteps();
    setSteps(loadedSteps);
    const ready = loadedSteps.length > 0;
    setHasSteps(ready);
    setChecked(true);

    if (ready) {
      router.replace("/caregiver/hands-free");
    }
  }, [router]);

  if (!checked || hasSteps) {
    return (
      <main className="app-shell flex items-center justify-center">
        <audio ref={assistant.remoteAudioRef} autoPlay playsInline hidden />
        <p className="text-sm font-medium text-slate-500">Loading...</p>
      </main>
    );
  }

  return (
    <>
      <audio ref={assistant.remoteAudioRef} autoPlay playsInline hidden />
      <main className="app-shell flex items-center">
        <section className="rivi-card w-full space-y-4 text-center shadow-soft">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">No Steps Yet</p>
          <h1 className="text-2xl font-bold text-slate-900">Caregiver flow is waiting for Guardian Setup.</h1>
          <p className="text-sm text-slate-600">Ask a guardian to add care steps with notes and media first.</p>
          <Link href="/guardian/setup" className="btn-primary w-full">
            Open Guardian Setup
          </Link>
        </section>
      </main>
      <FloatingAskRivi
        state={assistant.voiceState}
        onTap={() => {
          void assistant.tapWidget();
        }}
        disabled={!assistant.realtimeSupported || assistant.voiceState === "connecting"}
        visible
      />
    </>
  );
}
