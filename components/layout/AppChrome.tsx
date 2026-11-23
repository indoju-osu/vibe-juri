"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconGauge,
  IconLayout,
  IconLink,
  IconMoon,
  IconSun,
  IconTrophy,
} from "@/components/ui/icons";

const THEME_STORAGE_KEY = "vibe-juri.theme.v1";

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const nextDark = !dark;
    setDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    document.documentElement.style.colorScheme = nextDark ? "dark" : "light";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextDark ? "dark" : "light");
    } catch {
      /* ignore storage errors */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
      title={dark ? "Tema Gelap aktif (klik untuk Mode Terang)" : "Tema Terang aktif (klik untuk Mode Gelap)"}
      className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/70 px-2 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 sm:px-2.5 sm:text-xs"
    >
      {mounted && dark ? <IconSun className="h-3.5 w-3.5" /> : <IconMoon className="h-3.5 w-3.5" />}
      <span className="hidden lg:inline">{mounted && dark ? "Light" : "Dark"}</span>
    </button>
  );
}

const NAV_ITEMS = [
  { href: "/", label: "Import", icon: IconLink },
  { href: "/judge", label: "Panel Juri", icon: IconGauge },
  { href: "/leaderboard", label: "Klasemen", icon: IconTrophy },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-2 px-3 sm:px-5">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
          aria-label="Vibe-Juri — kembali ke halaman import"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-500/50 bg-rose-600 shadow-glow dark:bg-gradient-to-br dark:from-rose-600 dark:to-rose-800">
            <span className="font-mono text-[12px] font-bold tracking-tighter text-white">VJ</span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight tracking-tight text-slate-50">
              Vibe-Juri
            </span>
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.13em] text-slate-500 sm:block">
              Judging &amp; Security Audit
            </span>
          </span>
        </Link>

        <nav aria-label="Navigasi utama" className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 sm:px-2.5 sm:text-xs ${
                  active
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                    : "border-transparent text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{item.label}</span>
                <span className="sr-only md:hidden">{item.label}</span>
              </Link>
            );
          })}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-slate-800/80 bg-slate-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-1.5 px-3 py-4 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="flex items-center gap-1.5">
          <IconLayout className="h-3.5 w-3.5 text-slate-600" />
          <span>
            Vibe-Juri — split-window judging console. Data tersimpan lokal di browser juri.
          </span>
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
          Produk/UX 60 · Security 25 · Creativity 15
        </p>
      </div>
    </footer>
  );
}
