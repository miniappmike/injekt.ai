import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-3 py-1 text-sm placeholder:text-neutral-500 transition-[border-color,box-shadow] duration-150 hover:border-neutral-600 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/25 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
