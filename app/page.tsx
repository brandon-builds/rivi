import Link from "next/link";

export default function HomePage() {
  return (
    <main className="app-shell flex items-center">
      <section className="rivi-card w-full space-y-6 text-center shadow-soft">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-primary">Rivi</h1>
          <p className="text-lg font-medium text-slate-700">Care Coach</p>
        </div>

        <div className="space-y-3">
          <Link href="/guardian/setup" className="btn-primary w-full">
            Guardian Setup
          </Link>
          <Link href="/caregiver" className="btn-secondary w-full">
            Caregiver
          </Link>
        </div>
      </section>
    </main>
  );
}
