"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FloatingAskRivi } from "@/components/FloatingAskRivi";
import { Toast } from "@/components/Toast";
import { useRiviRealtimeAssistant } from "@/lib/hooks/useRiviRealtimeAssistant";
import { GuardianStepStore } from "@/lib/stores/guardianStepStore";
import { GuardianStep } from "@/lib/types";
import { makeId } from "@/lib/utils/id";

type StepForm = {
  title: string;
  notes: string;
  file: File | null;
  mediaLabel: string;
  existingMediaType: GuardianStep["mediaType"];
  existingMediaUrl: string;
  existingMediaName: string;
};

const makeInitialForm = (): StepForm => ({
  title: "",
  notes: "",
  file: null,
  mediaLabel: "",
  existingMediaType: "none",
  existingMediaUrl: "",
  existingMediaName: ""
});

const SAVE_FINISH_DELAY_MS = 1000;

export default function GuardianSetupPage() {
  const [steps, setSteps] = useState<GuardianStep[]>([]);
  const [form, setForm] = useState<StepForm>(makeInitialForm());
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const router = useRouter();

  const assistant = useRiviRealtimeAssistant({
    steps,
    currentStepId: editingStepId ?? steps[0]?.id
  });

  useEffect(() => {
    setSteps(GuardianStepStore.loadSteps());
  }, []);

  const editingStepIndex = useMemo(() => steps.findIndex((step) => step.id === editingStepId), [steps, editingStepId]);
  const canSubmit = useMemo(() => form.title.trim().length > 0 && form.notes.trim().length > 0, [form.title, form.notes]);
  const nextStepNumber = useMemo(() => steps.length + 1, [steps.length]);

  const resetCreateMode = () => {
    setEditingStepId(null);
    setForm(makeInitialForm());
  };

  const handleMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setForm((current) => ({
      ...current,
      file: selected,
      mediaLabel: selected ? selected.name : ""
    }));
  };

  const saveNewStep = async (): Promise<boolean> => {
    if (!canSubmit) {
      setStatus("Please add a step name and guardian notes.");
      return false;
    }

    setSaving(true);
    const media = await GuardianStepStore.buildMediaPayload(form.file);

    const next = GuardianStepStore.addStep({
      id: makeId(),
      title: form.title.trim(),
      notes: form.notes.trim(),
      mediaType: media.mediaType,
      mediaUrl: media.mediaUrl,
      mediaName: media.mediaName
    });

    setSteps(next);
    setSaving(false);

    if (form.file && !media.mediaUrl) {
      setStatus("Step saved. Media file was too large to persist locally, so caregiver may need a re-upload in MVP.");
    } else {
      setStatus("Step saved.");
    }

    return true;
  };

  const saveStepChanges = async (): Promise<boolean> => {
    if (!editingStepId) {
      return false;
    }

    if (!canSubmit) {
      setStatus("Please add a step name and guardian notes.");
      return false;
    }

    setSaving(true);

    let updates: Partial<GuardianStep> = {
      title: form.title.trim(),
      notes: form.notes.trim(),
      mediaType: form.existingMediaType,
      mediaUrl: form.existingMediaUrl,
      mediaName: form.existingMediaName || undefined
    };

    if (form.file) {
      const media = await GuardianStepStore.buildMediaPayload(form.file);
      updates = {
        ...updates,
        mediaType: media.mediaType,
        mediaUrl: media.mediaUrl,
        mediaName: media.mediaName
      };
    }

    const next = GuardianStepStore.updateStep(editingStepId, updates);
    setSteps(next);
    setSaving(false);
    setStatus("Step updated.");
    resetCreateMode();
    return true;
  };

  const handleAddNext = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await saveNewStep();
    if (!saved) {
      return;
    }

    setForm(makeInitialForm());
  };

  const handleSaveAndFinish = async () => {
    const saved = await saveNewStep();
    if (!saved) {
      return;
    }

    setShowSavedToast(true);
    window.setTimeout(() => {
      router.push("/");
    }, SAVE_FINISH_DELAY_MS);
  };

  const handleEditStep = (step: GuardianStep) => {
    setEditingStepId(step.id);
    setForm({
      title: step.title,
      notes: step.notes,
      file: null,
      mediaLabel: "",
      existingMediaType: step.mediaType,
      existingMediaUrl: step.mediaUrl,
      existingMediaName: step.mediaName ?? ""
    });
    setStatus("");
  };

  const handleDeleteStep = (id: string) => {
    const next = GuardianStepStore.deleteStep(id);
    setSteps(next);

    if (editingStepId === id) {
      resetCreateMode();
    }

    setStatus("Step deleted.");
  };

  const editingLabel = editingStepIndex >= 0 ? `Editing Step ${editingStepIndex + 1}` : "";

  return (
    <>
      <audio ref={assistant.remoteAudioRef} autoPlay playsInline hidden />
      <main className="app-shell">
        <section className="mb-4 flex items-center justify-between">
          <button type="button" className="btn-secondary px-4" onClick={() => router.push("/")}>
            Back
          </button>
          <p className="text-sm font-semibold text-primary">Rivi</p>
        </section>

        <section className="rivi-card space-y-5 shadow-soft">
          <header>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Guardian Setup</p>
            <h1 className="text-2xl font-bold text-slate-900">{editingStepId ? editingLabel : `Step ${nextStepNumber}`}</h1>
            {editingStepId ? <p className="mt-1 text-sm font-medium text-primary">You are editing an existing step.</p> : null}
          </header>

          <form className="space-y-4" onSubmit={editingStepId ? (event) => {
            event.preventDefault();
            void saveStepChanges();
          } : handleAddNext}>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Step name</span>
              <input
                className="rivi-input"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Equipment Check"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Add Video or Image</span>
              <input className="rivi-input p-2 file:mr-3 file:rounded-xl file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary" type="file" accept="video/*,image/*" onChange={handleMediaChange} />
              {form.mediaLabel ? <p className="text-xs text-slate-500">Selected: {form.mediaLabel}</p> : null}
              {!form.mediaLabel && form.existingMediaName ? <p className="text-xs text-slate-500">Current: {form.existingMediaName}</p> : null}
            </label>

            {form.existingMediaType === "video" && form.existingMediaUrl && !form.file ? (
              <video className="w-full rounded-2xl bg-black" src={form.existingMediaUrl} controls playsInline />
            ) : null}

            {form.existingMediaType === "image" && form.existingMediaUrl && !form.file ? (
              <img className="w-full rounded-2xl" src={form.existingMediaUrl} alt={form.title || "Step media"} />
            ) : null}

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Guardian notes</span>
              <textarea
                className="rivi-input min-h-28 resize-y"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            <div className="space-y-3 pt-2">
              {editingStepId ? (
                <>
                  <button className="btn-primary w-full" type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button className="btn-secondary w-full" type="button" onClick={resetCreateMode} disabled={saving}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-primary w-full" type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Add Next Step"}
                  </button>
                  <button className="btn-secondary w-full" type="button" onClick={handleSaveAndFinish} disabled={saving}>
                    Save &amp; Finish
                  </button>
                </>
              )}
            </div>
          </form>

          {status ? <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{status}</p> : null}
        </section>

        <details className="rivi-card mt-4" open>
          <summary className="cursor-pointer text-base font-semibold text-slate-900">Your Steps ({steps.length})</summary>
          <div className="mt-3 space-y-2">
            {steps.length === 0 ? <p className="text-sm text-slate-500">No steps yet. Add your first step above.</p> : null}
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Step {index + 1}: {step.title}</p>
                  <p className="text-xs text-slate-500">{step.mediaType === "none" ? "No media" : step.mediaType === "video" ? "Video" : "Image"}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="rounded-xl border border-primary/25 px-3 py-2 text-xs font-semibold text-primary" onClick={() => handleEditStep(step)}>
                    Edit
                  </button>
                  <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600" onClick={() => handleDeleteStep(step.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      </main>

      <Toast message="Saved!" visible={showSavedToast} />
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
