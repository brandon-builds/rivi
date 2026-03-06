"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { CaregiverSessionStore } from "@/lib/stores/caregiverSessionStore";
import { GuardianStepStore } from "@/lib/stores/guardianStepStore";

export default function CaregiverSummaryPage() {
  const router = useRouter();
  const session = useMemo(() => CaregiverSessionStore.load(), []);
  const stepMap = useMemo(() => {
    const steps = GuardianStepStore.loadSteps();
    return new Map(steps.map((step) => [step.id, step.title]));
  }, []);

  const completedIds = session?.completedStepIds ?? [];
  const totalCount = session?.totalStepIds.length ?? completedIds.length;
  const completedCount = completedIds.length;
  const completedTitles = completedIds.map((id, index) => stepMap.get(id) ?? `Step ${index + 1}`);
  const reinforcementCopy = completedCount === totalCount
    ? "You showed up and followed through."
    : "You made progress today.";

  const completedAt = session?.completedAt
    ? new Date(session.completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : session?.startedAt
      ? new Date(session.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <main className="app-shell">
      <section className="rivi-card space-y-6 shadow-soft">
        <header className="space-y-4 text-center">
          <div className="summary-celebration" aria-hidden="true">
            <div className="summary-confetti-piece" style={{ ["--piece-index" as string]: 0 }} />
            <div className="summary-confetti-piece" style={{ ["--piece-index" as string]: 1 }} />
            <div className="summary-confetti-piece" style={{ ["--piece-index" as string]: 2 }} />
            <div className="summary-confetti-piece" style={{ ["--piece-index" as string]: 3 }} />
            <div className="summary-confetti-piece" style={{ ["--piece-index" as string]: 4 }} />
            <div className="summary-confetti-piece" style={{ ["--piece-index" as string]: 5 }} />
            <span className="summary-checkmark">✓</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Nice work.</h1>
            <p className="text-xl font-medium text-slate-800">This session is complete.</p>
          </div>
          <p className="text-sm text-slate-600">Completed {completedCount} of {totalCount} steps</p>
          <p className="text-sm text-slate-500">{reinforcementCopy}</p>
          <p className="text-xs font-medium text-slate-500">Completed at {completedAt}</p>
        </header>

        <section className="summary-list-card space-y-2">
          {completedTitles.length ? (
            completedTitles.map((title, idx) => (
              <div key={`${title}-${idx}`} className="summary-row" style={{ ["--row-delay" as string]: `${idx * 40}ms` }}>
                <span className="summary-row-dot" aria-hidden="true">✓</span>
                <p className="text-sm font-medium text-slate-800">{title}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No completed steps found for this session.</p>
          )}
        </section>

        <div className="space-y-2">
          <button
            type="button"
            className="btn-primary w-full active:scale-[0.99] transition-transform duration-150"
            onClick={() => {
              CaregiverSessionStore.clear();
              router.push("/");
            }}
          >
            Back to Home
          </button>
          <button
            type="button"
            className="btn-secondary w-full active:scale-[0.99] transition-transform duration-150"
            onClick={() => {
              CaregiverSessionStore.clear();
              router.push("/caregiver/hands-free");
            }}
          >
            Run Again
          </button>
        </div>
      </section>
    </main>
  );
}
