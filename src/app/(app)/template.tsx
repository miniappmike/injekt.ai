/** Each page fades and rises in when you move between tabs (a template remounts on every navigation). */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-up">{children}</div>;
}
