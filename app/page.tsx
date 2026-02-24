import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-3xl font-bold text-primary">Care Coach Rivi — Guardian Protocol Edition</h1>
      <p className="text-lg text-slate-700">Iteration 1 MVP: upload protocol, define steps, and run caregiver hands-free guidance.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link className="rounded-xl bg-primary px-4 py-4 text-center text-lg font-semibold text-white" href="/guardian/upload">Guardian: Upload Protocol</Link>
        <Link className="rounded-xl bg-primary px-4 py-4 text-center text-lg font-semibold text-white" href="/guardian/steps">Guardian: Define Steps</Link>
        <Link className="rounded-xl bg-slate-900 px-4 py-4 text-center text-lg font-semibold text-white" href="/caregiver">Caregiver: Start Pod Change</Link>
        <Link className="rounded-xl bg-alert px-4 py-4 text-center text-lg font-semibold text-white" href="/caregiver/emergency">Emergency Escalation</Link>
      </div>
    </main>
  );
}
