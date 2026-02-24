"use client";

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ProtocolStore } from "@/lib/stores/protocolStore";
import { VideoStore } from "@/lib/stores/videoStore";
import { GuardianProtocol } from "@/lib/types";

export default function GuardianUploadPage() {
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0");
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState<string>("");

  const handleSave = async () => {
    if (!name.trim() || !version.trim() || !file) {
      setSaved("Please provide protocol name, version, and video file.");
      return;
    }

    const videoUrl = await VideoStore.storeVideo(file);
    const protocol: GuardianProtocol = {
      id: crypto.randomUUID(),
      name: name.trim(),
      version: version.trim(),
      createdAt: new Date().toISOString(),
      videoUrl,
      steps: []
    };

    ProtocolStore.saveProtocol(protocol);
    setSaved("Protocol saved. Continue to Guardian Steps.");
  };

  return (
    <main className="mx-auto min-h-screen max-w-4xl p-6">
      <AppHeader />
      <h1 className="mb-4 text-3xl font-bold">Guardian Upload</h1>
      <section className="space-y-4 rounded-2xl bg-surface p-5 shadow-sm">
        <label className="block">
          <span className="mb-1 block font-semibold">Protocol name</span>
          <input className="w-full rounded-lg border p-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pod Change - Infant A" />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold">Version</span>
          <input className="w-full rounded-lg border p-3" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold">Protocol video</span>
          <input className="w-full rounded-lg border p-3" type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button className="rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-white" onClick={handleSave}>Save Protocol</button>
        {saved ? <p className="text-sm font-medium text-slate-700">{saved}</p> : null}
        <p className="text-xs text-slate-500">MVP note: video uses object URL. Persisting the binary across refresh should move to IndexedDB in iteration 2.</p>
      </section>
    </main>
  );
}
