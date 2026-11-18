import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="konten-utama"
      className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center px-4 py-16 text-center"
    >
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-rose-400">404 · Not Found</p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-50">Halaman tidak ditemukan</h1>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        Tautan yang Anda buka tidak tersedia. Kembali ke import URL atau panel juri.
      </p>
      <div className="mt-4 flex gap-2">
        <Link href="/" className="btn-primary">
          Import URL
        </Link>
        <Link href="/judge" className="btn-secondary">
          Panel Juri
        </Link>
      </div>
    </main>
  );
}
