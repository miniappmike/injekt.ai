/** Line icons for the phone navigation and quick actions, drawn on a 24px grid in the current text colour. */
type P = { className?: string };
const base = (className = "h-5 w-5") => ({ viewBox: "0 0 24 24", "aria-hidden": true, className: `${className} fill-none stroke-current`, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const InjectIcon = ({ className }: P) => (
  <svg {...base(className)}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="10" r="3" /><path d="M6.5 19c1-3 3-4.5 5.5-4.5s4.5 1.5 5.5 4.5" /></svg>
);
export const VariantsIcon = ({ className }: P) => (
  <svg {...base(className)}><rect x="7" y="7" width="13" height="13" rx="3.5" /><path d="M4 15.5V7a3 3 0 0 1 3-3h8.5" /></svg>
);
export const LikenessIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="11" r="3.2" /><path d="M7.8 17c.9-1.6 2.4-2.4 4.2-2.4s3.3.8 4.2 2.4" /></svg>
);
export const SheetIcon = ({ className }: P) => (
  <svg {...base(className)}><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></svg>
);
export const CharactersIcon = ({ className }: P) => (
  <svg {...base(className)}><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.4.7 2.4 2.1 3 4.2" /></svg>
);
export const PasteIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M9 4h6v3H9z" /><path d="M15 5.5h2a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h2" /><path d="M9 14l2 2 4-4.5" /></svg>
);
export const UploadIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>
);
export const SlidersIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
);
export const BackIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);
export const HistoryIcon = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const SparkIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 3.5c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6Z" /><path d="M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5Z" /></svg>
);
export const StoreIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M5 8.5h14l-1 11.2a1.5 1.5 0 0 1-1.5 1.3h-9A1.5 1.5 0 0 1 6 19.7Z" /><path d="M9 11V7.5a3 3 0 0 1 6 0V11" /></svg>
);
export const ChevronIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="m9 5 7 7-7 7" /></svg>
);
export const ShareIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
);
export const BookmarkIcon = ({ className, filled = false }: P & { filled?: boolean }) => (
  <svg {...base(className)} className={`${className ?? "h-5 w-5"} stroke-current ${filled ? "fill-current" : "fill-none"}`}><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" /></svg>
);
export const SearchIcon = ({ className }: P) => (
  <svg {...base(className)}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
);
export const LockIcon = ({ className }: P) => (
  <svg {...base(className)}><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
);
