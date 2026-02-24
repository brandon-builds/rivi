"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ProtocolStore } from "@/lib/stores/protocolStore";
import { Step } from "@/lib/types";

const emptyStep: Step = {
  stepNumber: 1,
  title: "",
  guardianNotes: ""
};

export default function GuardianStepsPage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [draft, setDraft] = useState<Step>(emptyStep);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const protocol = ProtocolStore.loadProtocol();
    if (!protocol) {
      setMessage("No protocol found. Upload one first.");
      return;
    }

    setSteps(protocol.steps);
  }, []);

  const handleAddStep = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.guardianNotes.trim()) {
      setMessage("Step title and guardian notes are required.");
      return;
    }

    const next = [...steps.filter((step) => step.stepNumber !== draft.stepNumber), draft];
    setSteps(next.sort((a, b) => a.stepNumber - b.stepNumber));
    setDraft({ ...emptyStep, stepNumber: draft.stepNumber + 1 });
    setMessage("Step staged. Click Save All Steps.");
  };

  const handleSaveAll = () => {
    const updated = ProtocolStore.saveSteps(steps);
    if (!updated) {
      setMessage("Cannot save steps without a protocol.");
      return;
    }

    setMessage(`Saved ${updated.steps.length} steps to guardian_protocol_v1.`);
  };

  return (
    <main className="mx-auto min-h-screen max-w-4xl p-6">
      <AppHeader />
      <h1 className="mb-4 text-3xl font-bold">Guardian Steps</h1>
      <div className="grid gap-5 md:grid-cols-2">
        <form className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm" onSubmit={handleAddStep}>
          <h2 className="text-xl font-semibold">Add / Edit Step</h2>
          <label className="block">
            <span className="mb-1 block font-medium">Step number</span>
            <input type="number" min={1} className="w-full rounded-lg border p-3" value={draft.stepNumber} onChange={(e) => setDraft((curr) => ({ ...curr, stepNumber: Number(e.target.value) }))} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Title</span>
            <input className="w-full rounded-lg border p-3" value={draft.title} onChange={(e) => setDraft((curr) => ({ ...curr, title: e.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Guardian notes</span>
            <textarea className="w-full rounded-lg border p-3" rows={4} value={draft.guardianNotes} onChange={(e) => setDraft((curr) => ({ ...curr, guardianNotes: e.target.value }))} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block font-medium">Timestamp start (optional)</span>
              <input type="number" min={0} className="w-full rounded-lg border p-3" value={draft.timestampStart ?? ""} onChange={(e) => setDraft((curr) => ({ ...curr, timestampStart: e.target.value ? Number(e.target.value) : undefined }))} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Timestamp end (optional)</span>
              <input type="number" min={0} className="w-full rounded-lg border p-3" value={draft.timestampEnd ?? ""} onChange={(e) => setDraft((curr) => ({ ...curr, timestampEnd: e.target.value ? Number(e.target.value) : undefined }))} />
            </label>
          </div>
          <button className="rounded-xl bg-primary px-5 py-3 font-semibold text-white" type="submit">Add / Update Step</button>
        </form>

        <section className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Current Steps</h2>
          <ul className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {steps.map((step) => (
              <li key={step.stepNumber} className="rounded-lg border p-3">
                <p className="font-semibold">{step.stepNumber}. {step.title}</p>
                <p className="text-sm text-slate-700">{step.guardianNotes}</p>
                <p className="text-xs text-slate-500">{step.timestampStart ?? "-"}s to {step.timestampEnd ?? "-"}s</p>
              </li>
            ))}
          </ul>
          <button className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white" onClick={handleSaveAll}>Save All Steps</button>
          {message ? <p className="text-sm text-slate-700">{message}</p> : null}
        </section>
      </div>
    </main>
  );
}
