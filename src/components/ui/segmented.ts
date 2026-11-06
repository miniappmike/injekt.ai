/** Pill switches (page sub-tabs and two-way choices): a dark track with the chosen option in crimson. */
export const segTrack = "inline-flex w-fit flex-wrap gap-1 rounded-full border border-neutral-800 bg-neutral-900/80 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)]";
export const segItem = (on: boolean) =>
  `rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
    on
      ? "bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_4px_14px_-4px_rgb(232_38_94/0.7)]"
      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-50"
  }`;
/** Toggle chips (several can be on): crimson outline and tint when on. */
export const chipItem = (on: boolean) =>
  `cursor-pointer select-none rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-150 active:scale-[0.97] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/60 ${
    on
      ? "border-brand-500/70 bg-brand-500/15 text-neutral-50 shadow-[0_0_0_1px_rgb(232_38_94/0.25),0_4px_14px_-6px_rgb(232_38_94/0.6)]"
      : "border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
  }`;
