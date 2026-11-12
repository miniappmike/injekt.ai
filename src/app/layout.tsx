import "./globals.css";
import { Bebas_Neue, Exo_2, Inter } from "next/font/google";

export const metadata = { title: "Model Spawn", appleWebApp: { title: "ModelSpawn" } };

// The fonts are served from this site (downloaded when it's built), so pages don't wait on Google's servers.
// Inter for text, Exo 2 for headings, Bebas Neue for the big poster names on the marketplace.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const exo = Exo_2({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-exo", display: "swap" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${exo.variable} ${bebas.variable}`}>
      <body className="bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
