import Link from "next/link";

export function AppHeader() {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
      <Link href="/" className="text-xl font-bold text-primary">
        Care Coach Rivi
      </Link>
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/guardian/upload" className="rounded-md bg-slate-100 px-3 py-2 font-medium">Upload</Link>
        <Link href="/guardian/steps" className="rounded-md bg-slate-100 px-3 py-2 font-medium">Steps</Link>
        <Link href="/caregiver" className="rounded-md bg-slate-100 px-3 py-2 font-medium">Caregiver</Link>
      </nav>
    </header>
  );
}
