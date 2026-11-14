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
/**
 * Create Model: one solid person with a circled plus at the lower right, so it reads differently from the outlined
 * pair of Characters. The person is cut away around the badge.
 */
export const CreateModelIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <defs>
      <mask id="create-model-cut">
        <rect width="24" height="24" fill="white" stroke="none" />
        <circle cx="17.2" cy="17.2" r="6.4" fill="black" stroke="none" />
      </mask>
    </defs>
    <g mask="url(#create-model-cut)" className="fill-current" stroke="none">
      <circle cx="10" cy="7.2" r="4.2" />
      <path d="M2.5 21.5v-2.6c0-3.6 3.4-6.3 7.5-6.3s7.5 2.7 7.5 6.3v2.6z" />
    </g>
    <circle cx="17.2" cy="17.2" r="4.6" />
    <path d="M17.2 14.9v4.6M14.9 17.2h4.6" />
  </svg>
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
export const TrashIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 11v6M14 11v6" /></svg>
);
export const LockIcon = ({ className }: P) => (
  <svg {...base(className)}><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
);
export const FlameIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 3c.5 3.2 4.5 5.2 4.5 9.7A4.5 4.5 0 0 1 12 17.2a4.5 4.5 0 0 1-4.5-4.5c0-1.8.8-3 1.8-4 .2 1.2.8 1.9 1.5 2.3C11 8.4 11.4 5.4 12 3Z" /><path d="M10.2 20.5h3.6" /></svg>
);
export const GridIcon = ({ className }: P) => (
  <svg {...base(className)}><rect x="4" y="4" width="6.5" height="6.5" rx="1.3" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.3" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.3" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.3" /></svg>
);
export const CardsIcon = ({ className }: P) => (
  <svg {...base(className)}><rect x="8" y="4" width="8" height="16" rx="2" /><path d="M5 7v10M19 7v10" /></svg>
);
/** A rolled scroll with a quill: the History button. */
export const ScrollQuillIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 4.5h8.5a1.5 1.5 0 0 1 1.5 1.5v4" />
    <path d="M6 4.5a1.75 1.75 0 0 0-1.75 1.75c0 .97.78 1.75 1.75 1.75" />
    <path d="M6 4.5v13.25a2 2 0 0 0 2 2h9" />
    <path d="M14.5 19.75h3.25a1.5 1.5 0 0 0 0-3H11" />
    <path d="M8.75 8.5h4.25M8.75 11h4.25M8.75 13.5h2.75" />
    <path d="M20.5 7.5c-3 .2-5.4 2.3-6.4 5.6l-.6 2.4 2-1.3c2.7-1.2 4.4-3.6 5-6.7Z" />
    <path d="M13.5 15.5 17 11" />
  </svg>
);
/** Three people side by side: the Group photo button. */
export const GroupIcon = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="8.5" r="2.8" /><path d="M7.2 19c.7-2.8 2.5-4.3 4.8-4.3s4.1 1.5 4.8 4.3" /><circle cx="5.5" cy="10" r="2.1" /><path d="M2.5 18c.4-1.9 1.5-3 3-3.2" /><circle cx="18.5" cy="10" r="2.1" /><path d="M21.5 18c-.4-1.9-1.5-3-3-3.2" /></svg>
);
export const CheckIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const CloseIcon = ({ className }: P) => (
  <svg {...base(className)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
