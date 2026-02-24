import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

export default function EmergencyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl p-6">
      <AppHeader />
      <section className="rounded-2xl border-2 border-alert bg-white p-6 shadow-sm">
        <h1 className="mb-3 text-3xl font-bold text-alert">Emergency Escalation</h1>
        <p className="mb-5 text-lg">If caregiver is unsure or patient safety is at risk, stop and contact guardian immediately.</p>
        <button className="rounded-2xl bg-alert px-8 py-4 text-2xl font-bold text-white">Contact Guardian</button>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-primary" href="/caregiver/hands-free">Return to Hands-Free Mode</Link>
        </div>
      </section>
    </main>
  );
}
