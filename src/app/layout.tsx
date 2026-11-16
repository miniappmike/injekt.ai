import "./globals.css";
import { BootSplash } from "@/components/boot-splash";
import { Bebas_Neue, Exo_2, Inter } from "next/font/google";
import type { Viewport } from "next";

// Each page names itself ("Inject"); the browser tab shows "Inject | ModelSpawn".
// Added to an iPhone's home screen it opens as its own app (no Safari bars), drawn under a see-through status bar.
export const metadata = {
  title: { default: "ModelSpawn", template: "%s | ModelSpawn" },
  appleWebApp: { capable: true, title: "ModelSpawn", statusBarStyle: "black-translucent" as const },
};

// "cover" lets the page reach the screen's edges, so the safe-area insets (notch, home bar) are real numbers the bars
// and the dock can pad by (see --safe-top and --dock-clear in globals.css).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#131316" };

// The fonts are served from this site (downloaded when it's built), so pages don't wait on Google's servers.
// Inter for text, Exo 2 for headings, Bebas Neue for the big poster names on the marketplace.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const exo = Exo_2({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-exo", display: "swap" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${exo.variable} ${bebas.variable}`}>
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        <BootSplash />
        {children}
      </body>
    </html>
  );
}
