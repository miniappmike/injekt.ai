import "./globals.css";

export const metadata = { title: "Model Spawn", appleWebApp: { title: "ModelSpawn" } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Inter for text, Exo 2 for headings, Bebas Neue for the big poster names on the marketplace. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Exo+2:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
