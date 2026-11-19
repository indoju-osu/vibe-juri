import type { Metadata } from "next";
import "./globals.css";
import { AppFooter, AppHeader } from "@/components/layout/AppChrome";
import { ToastHost } from "@/components/ui/ToastHost";

export const metadata: Metadata = {
  title: {
    default: "Vibe-Juri — Platform Penjurian & Security Audit",
    template: "%s · Vibe-Juri",
  },
  description:
    "Console penjurian Vibe Coding dengan split-window controller, 9 komponen skor, Top 5 security testing, dan ekspor laporan Excel.",
  applicationName: "Vibe-Juri",
  keywords: ["vibe coding", "hackathon", "penjurian", "security audit", "OWASP"],
  authors: [{ name: "Vibe-Juri" }],
  viewport: "width=device-width, initial-scale=1",
  themeColor: "#f8fafc",
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('vibe-juri.theme.v1');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-slate-950 font-sans text-slate-50">
        <a
          href="#konten-utama"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[120] focus:rounded-lg focus:bg-rose-600 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Lewati ke konten utama
        </a>
        <AppHeader />
        {children}
        <AppFooter />
        <ToastHost />
      </body>
    </html>
  );
}
