"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ProtocolStore } from "@/lib/stores/protocolStore";

export default function CaregiverStartPage() {
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const protocol = ProtocolStore.loadProtocol();
    if (!protocol) {
      setReady(false);
      return;
    }

    setName(`${protocol.name} v${protocol.version}`);
    setReady(true);
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-6">
      <AppHeader />
      <h1 className="mb-4 text-3xl font-bold">Caregiver Start</h1>
      <section className="space-y-4 rounded-2xl bg-surface p-6 shadow-sm">
        {ready ? (
          <>
            <p className="text-lg">Loaded protocol: <span className="font-semibold">{name}</span></p>
            <Link className="inline-block rounded-2xl bg-primary px-8 py-5 text-2xl font-bold text-white" href="/caregiver/hands-free">Start Pod Change</Link>
          </>
        ) : (
          <p className="text-lg text-alert">No protocol is loaded yet. Ask guardian to upload protocol and steps first.</p>
        )}
      </section>
    </main>
  );
}
