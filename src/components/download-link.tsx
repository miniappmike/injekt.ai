"use client";

import { saveImage } from "@/lib/download";

/** A Download link that saves the image where the person is, instead of opening it as a page (see `saveImage`). */
export function DownloadLink({ href, children, className, name }: { href: string; children: React.ReactNode; className?: string; name?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        void saveImage(href, name);
      }}
    >
      {children}
    </a>
  );
}
