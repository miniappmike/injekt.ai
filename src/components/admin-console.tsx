"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/info-tip";
import { saveSettings, setUserPlan, settleCharges } from "@/app/(app)/admin/actions";
import type { AdminStats, FinanceStats, UserStats } from "@/lib/admin-stats";
import { featureLabel } from "@/lib/ledger-types";
import { snapshotCsv, snapshotJson, snapshotMarkdown, type AdminSnapshot } from "@/lib/admin-export";
import type { SweepResult } from "@/lib/ledger-sweep";
import { cn } from "@/lib/utils";

type Config = {
  caps: { free: { runs: number; likeness: number; images: number }; pro: { runs: number; likeness: number; images: number } };
  serverModel: string;
  serverImageModel: string;
  serverPrice: { input: number; output: number } | null;
};

const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : n < 100 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString()}`);
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" }) {
  return (
    <div className="panel flex flex-col gap-1 p-4">
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      <span className="font-display text-2xl font-bold tabular-nums text-neutral-50">{value}</span>
      {note && <span className={cn("text-xs", tone === "warn" ? "text-amber-300" : "text-neutral-500")}>{note}</span>}
    </div>
  );
}

/** Daily spend on the platform key, last 14 days: one series, so one hue and no legend; hover a bar for its numbers. */
function SpendChart({ daily }: { daily: AdminStats["daily"] }) {
  const max = Math.max(...daily.map((d) => d.cost), 0);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover != null ? daily[hover] : null;
  return (
    <section className="panel p-5" aria-labelledby="spend-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="spend-title" className="font-display text-lg font-bold text-neutral-50">Your AI key, per day</h2>
        <p className="text-xs text-neutral-400 tabular-nums" aria-live="polite">
          {h ? `${new Date(h.day + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}: ${usd(h.cost)} · ${h.calls} AI calls` : "Last 14 days (UTC). Hover a bar for details."}
        </p>
      </div>
      <p className="mt-3 text-[10px] tabular-nums text-neutral-500">{usd(max)}</p>
      <div className="relative mt-1 h-40">
        {/* Recessive guide at the top value. */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-neutral-800" aria-hidden="true" />
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-neutral-700" role="list" aria-label="Spend per day">
          {daily.map((d, i) => (
            <div
              key={d.day}
              role="listitem"
              aria-label={`${d.day}: ${usd(d.cost)}, ${d.calls} calls`}
              className="flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className={cn("w-full rounded-t-[4px] transition-colors", hover === i ? "bg-brand-400" : "bg-brand-500/80")}
                style={{ height: max ? `${Math.max(d.cost > 0 ? 2 : 0, (d.cost / max) * 100)}%` : "0%" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-neutral-500">
        <span>{daily[0]?.day.slice(5)}</span>
        <span>today</span>
      </div>
    </section>
  );
}

export function CapsForm({ config }: { config: Config }) {
  const router = useRouter();
  const [c, setC] = useState(config);
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();
  const [pending, start] = useTransition();
  const capInput = (key: "runs" | "likeness" | "images") => (
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={`Free ${key === "runs" ? "prompts" : key === "images" ? "images" : "likeness checks"} per day`}
      value={c.caps.free[key]}
      onChange={(e) => setC((x) => ({ ...x, caps: { ...x.caps, free: { ...x.caps.free, [key]: Number(e.target.value) } } }))}
      className="w-24 tabular-nums"
    />
  );
  return (
    <section className="panel flex flex-col gap-5 p-5" aria-labelledby="caps-title">
      <div>
        <h2 id="caps-title" className="font-display text-lg font-bold text-neutral-50">Limits and AI model</h2>
        <p className="text-sm text-neutral-400">Free accounts only: Pro has no daily limits. Changes apply within about 15 seconds.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full max-w-md text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-400">
              <th className="pb-2 font-medium">Per day</th>
              <th className="pb-2 font-medium">Free plan</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1.5 pr-4 text-neutral-200">
                <span className="flex items-center gap-1.5">Prompts <InfoTip label="What counts as a prompt">Each target photo in Inject, and each press of Write variations, Write variant edits or Plan carousel. Direct swap and copying are free.</InfoTip></span>
              </td>
              <td className="py-1.5 pr-3">{capInput("runs")}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-4 text-neutral-200">
                <span className="flex items-center gap-1.5">Images <InfoTip label="What counts as an image">Each image made with tokens, at any size.</InfoTip></span>
              </td>
              <td className="py-1.5 pr-3">{capInput("images")}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-4 text-neutral-200">Likeness checks</td>
              <td className="py-1.5 pr-3">{capInput("likeness")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 [&>*]:min-w-0">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 text-neutral-200">Model on your key <InfoTip label="About the model">The SpicyAPI model your key uses for everyone without their own key: prompt writing, sheet reading and likeness checks.</InfoTip></span>
          <Input value={c.serverModel} onChange={(e) => setC((x) => ({ ...x, serverModel: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 text-neutral-200">Image model on your key <InfoTip label="About the image model">The SpicyAPI image model used for images paid with tokens.</InfoTip></span>
          <Input value={c.serverImageModel} onChange={(e) => setC((x) => ({ ...x, serverImageModel: e.target.value }))} />
        </label>
      </div>
      <p className="-mt-3 text-xs text-neutral-500">No prices to enter: every call on SpicyAPI is costed at what SpicyAPI actually charged (see Real costs above).</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              // Costs come from SpicyAPI's real charges now, so no typed-in price is kept.
              const r = await saveSettings({ caps: c.caps, serverModel: c.serverModel, serverImageModel: c.serverImageModel, serverPrice: null });
              setMsg(r.ok ? { text: "Saved.", ok: true } : { text: r.error, ok: false });
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? "Saving..." : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => { setC(config); setMsg(undefined); }}>Undo</Button>
        {msg && <span role="status" className={cn("text-sm", msg.ok ? "text-emerald-300" : "text-red-400")}>{msg.text}</span>}
      </div>
    </section>
  );
}

export function PlanSwitch({ user }: { user: UserStats }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (user.is_admin) return <span className="rounded-full bg-iris-500/15 px-2 py-0.5 text-xs font-semibold text-iris-400 ring-1 ring-iris-500/40">Admin</span>;
  return (
    <select
      aria-label={`Plan for ${user.email ?? user.id}`}
      value={user.plan}
      disabled={pending}
      onChange={(e) => {
        const plan = e.target.value as "free" | "pro";
        if (!window.confirm(`Move ${user.email ?? "this user"} to ${plan === "pro" ? "Pro" : "Free"}?`)) return;
        start(async () => {
          const r = await setUserPlan({ userId: user.id, plan });
          if (!r.ok) window.alert(r.error);
          router.refresh();
        });
      }}
      className="h-8 rounded-md border border-neutral-700 bg-neutral-950/60 px-2 text-xs"
    >
      <option value="free">Free</option>
      <option value="pro">Pro</option>
    </select>
  );
}

function ExportMenu({ snapshot }: { snapshot: () => AdminSnapshot }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string>();
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const download = (text: string, ext: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `model-spawn-admin-${stamp()}.${ext}` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const options = [
    { label: "Copy as Markdown", hint: "Paste straight into a chat", run: async () => {
      await navigator.clipboard.writeText(snapshotMarkdown(snapshot()));
      setNote("Copied");
    } },
    { label: "Markdown (.md)", hint: "A readable report", run: () => download(snapshotMarkdown(snapshot()), "md", "text/markdown") },
    { label: "JSON (.json)", hint: "Every number, for tools and AI", run: () => download(snapshotJson(snapshot()), "json", "application/json") },
    { label: "CSV (.csv)", hint: "Every table, for spreadsheets", run: () => download(snapshotCsv(snapshot()), "csv", "text/csv") },
  ];
  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <Button type="button" variant="secondary" size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen((o) => !o); setNote(undefined); }}>
        {note ?? "Export as"}
        <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("h-3.5 w-3.5 fill-none stroke-current transition-transform", open && "rotate-180")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 5 5 5-5" /></svg>
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-64 animate-pop-in rounded-xl border border-neutral-800 bg-neutral-900/95 p-1.5 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.9)] backdrop-blur-xl">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              role="menuitem"
              onClick={async () => {
                await o.run();
                setOpen(false);
              }}
              className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline-none"
            >
              <span className="text-sm font-semibold text-neutral-100">{o.label}</span>
              <span className="text-xs text-neutral-500">{o.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
const money = (n: number) => (n === 0 ? "$0" : n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const th = "py-2 pr-3 font-medium";
const td = "py-2 pr-3 tabular-nums";

/**
 * What your SpicyAPI key really costs: calls it paid for, and (switch on by default) admins' own testing on their saved
 * keys. People who bring their own keys are never counted. For pricing on-site tokens.
 */
function RealCosts({ only, withAdmins, sweep: initial }: { only: FinanceStats; withAdmins: FinanceStats; sweep: SweepResult | null }) {
  const router = useRouter();
  const [mine, setMine] = useState(true);
  // Final charges are looked up when asked (and nightly), not on every page load.
  const [sweep, setSweep] = useState(initial);
  const [sweepError, setSweepError] = useState<string>();
  const [checking, startCheck] = useTransition();
  const check = () =>
    startCheck(async () => {
      setSweepError(undefined);
      const r = await settleCharges();
      if (!r.ok) return setSweepError(r.error);
      setSweep(r.sweep);
      router.refresh();
    });
  const f = mine ? withAdmins : only;
  return (
    <section className="panel flex flex-col gap-5 p-5" aria-labelledby="real-title">
      <div>
        <h2 id="real-title" className="flex items-center gap-1.5 font-display text-lg font-bold text-neutral-50">
          Real costs of your key, last 30 days
          <InfoTip label="Where these numbers come from">
            Only calls paid by your SpicyAPI key (the platform key), never people&apos;s own keys. The server looks up what SpicyAPI actually charged for each
            call a few seconds after it finishes (and again in the daily cleanup), so these are real charges, not estimates. Until a charge settles, an image
            shows the amount held for it (the most it can cost) and a text call shows tokens times the list price.
          </InfoTip>
        </h2>
        <p className="text-sm text-neutral-400">
          {f.people30} {f.people30 === 1 ? "person" : "people"} used it. {Math.round(f.realShare * 100)}% of calls show SpicyAPI&apos;s final charge.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="secondary" disabled={checking} onClick={check}>
            {checking ? "Checking with SpicyAPI..." : "Check final charges"}
          </Button>
          {sweep && sweep.checked === 0 && <span className="text-xs text-neutral-500">Everything is up to date.</span>}
          {sweepError && <span role="alert" className="text-xs text-red-400">{sweepError}</span>}
        </div>
        {sweep && sweep.checked > 0 && (
          <p className={cn("mt-1 text-xs", sweep.unreadable ? "text-amber-300" : "text-neutral-500")}>
            Checked {sweep.checked} waiting {sweep.checked === 1 ? "call" : "calls"} with SpicyAPI. {sweep.settled} got their final charge
            {sweep.held ? `, ${sweep.held} still held by SpicyAPI` : ""}
            {sweep.unreadable ? `, ${sweep.unreadable} couldn't be read` : ""}.
          </p>
        )}
        <label className="mt-2 flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Include admin accounts&apos; own testing (images you make with the SpicyAPI key saved in your settings)
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Spent on your key" value={money(f.total30)} note={mine ? `platform key ${money(f.server30)} · admin testing ${money(f.byok30)}` : "platform key only"} />
        <Tile label="Images generated" value={String(f.images30)} note={`${money(f.imageCost30)} total${f.failedImages30 ? ` · ${f.failedImages30} failed` : ""}`} />
        <Tile label="Average per image" value={f.images30 ? money(f.avgImage) : "-"} note="all sizes and models" />
        <Tile label="Tokens in / out" value={`${tok(f.tokensIn30)} / ${tok(f.tokensOut30)}`} note={`${f.textCalls30} text calls · ${money(f.textCost30)}`} />
      </div>

      {f.measured.length > 0 && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm">
          <p className="font-semibold text-emerald-200">Measured text prices</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-neutral-300">
            {f.measured.map((m) => (
              <li key={m.model} className="tabular-nums">
                <span className="text-neutral-400">{m.model}:</span> ${m.input.toFixed(2)} per 1M in · ${m.output.toFixed(2)} per 1M out
                <span className="text-xs text-neutral-500"> (fitted from {m.calls} settled calls)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-neutral-100">Cost per image</h3>
        {f.images.length ? (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs text-neutral-400">
                  <th className={th}>Model</th>
                  <th className={th}>Size</th>
                  <th className={`${th} text-right`}>Images</th>
                  <th className={`${th} text-right`}>Average</th>
                  <th className={`${th} text-right`}>Lowest</th>
                  <th className={`${th} text-right`}>Highest</th>
                  <th className="py-2 text-right font-medium">Final charge</th>
                </tr>
              </thead>
              <tbody>
                {f.images.map((g) => (
                  <tr key={`${g.model}|${g.size}`} className="border-b border-neutral-800/60">
                    <td className="max-w-[260px] truncate py-2 pr-3 text-neutral-200" title={g.model}>{g.model}</td>
                    <td className={`${td} text-neutral-200`}>{g.size}</td>
                    <td className={`${td} text-right text-neutral-200`}>{g.count}</td>
                    <td className={`${td} text-right font-semibold text-neutral-50`}>{money(g.avg)}</td>
                    <td className={`${td} text-right text-neutral-400`}>{money(g.min)}</td>
                    <td className={`${td} text-right text-neutral-400`}>{money(g.max)}</td>
                    <td className="py-2 text-right text-xs tabular-nums text-neutral-400">{g.settled}/{g.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No images on your key in the last 30 days. Image generation uses each person&apos;s own key until on-site tokens launch.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-neutral-100">Cost per text job</h3>
        {f.text.length ? (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs text-neutral-400">
                  <th className={th}>Job</th>
                  <th className={th}>Model</th>
                  <th className={`${th} text-right`}>Calls</th>
                  <th className={`${th} text-right`}>Avg tokens in</th>
                  <th className={`${th} text-right`}>Avg tokens out</th>
                  <th className={`${th} text-right`}>Avg cost</th>
                  <th className={`${th} text-right`}>Total</th>
                  <th className="py-2 text-right font-medium">Real charge</th>
                </tr>
              </thead>
              <tbody>
                {f.text.map((g) => (
                  <tr key={`${g.feature}|${g.model}`} className="border-b border-neutral-800/60">
                    <td className="py-2 pr-3 text-neutral-200">{featureLabel(g.feature)}</td>
                    <td className="max-w-[220px] truncate py-2 pr-3 text-xs text-neutral-400" title={g.model}>{g.model}</td>
                    <td className={`${td} text-right text-neutral-200`}>{g.calls}</td>
                    <td className={`${td} text-right text-neutral-200`}>{tok(g.avgIn)}</td>
                    <td className={`${td} text-right text-neutral-200`}>{tok(g.avgOut)}</td>
                    <td className={`${td} text-right font-semibold text-neutral-50`}>{money(g.avgCost)}</td>
                    <td className={`${td} text-right text-neutral-200`}>{money(g.total)}</td>
                    <td className="py-2 text-right text-xs tabular-nums text-neutral-400">{g.real}/{g.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No text calls in the last 30 days.</p>
        )}
      </div>
    </section>
  );
}

export function AdminConsole({
  config,
  stats,
  finance,
  financeWithAdmins,
  sweep = null,
  usageMissing,
}: {
  config: Config;
  stats: AdminStats;
  finance: FinanceStats;
  financeWithAdmins: FinanceStats;
  sweep?: SweepResult | null;
  usageMissing: boolean;
}) {
  const snapshot = (): AdminSnapshot => ({
    generatedAt: new Date().toISOString(),
    config: { caps: config.caps, serverModel: config.serverModel },
    stats,
    realCosts: { platformKeyOnly: finance, withAdminTesting: financeWithAdmins },
    sweep,
  });
  const payingUsers = stats.users.filter((u) => u.server30 > 0).length;
  return (
    <div className="mt-6 flex flex-col gap-5">
      {usageMissing && (
        <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Daily limits aren&apos;t switched on yet: run migrations <b>0012_daily_usage.sql</b> and <b>0013_app_settings.sql</b> in the Supabase SQL editor.
        </p>
      )}
      <div className="-mt-2 flex justify-end">
        <ExportMenu snapshot={snapshot} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Spent today" value={usd(stats.serverToday)} note={`${stats.activeToday} active · ${stats.runsToday} prompts`} />
        <Tile label="Average a day" value={usd(stats.avgPerDay7)} note={`last 7 days · 30-day avg ${usd(stats.avgPerDay30)}`} />
        <Tile label="Last 30 days" value={usd(stats.server30)} note={`${payingUsers} people used your key`} />
        <Tile
          label="Month at this pace"
          value={usd(stats.projectedMonth)}
          note={stats.unpricedCalls30 ? `${stats.unpricedCalls30} calls had no price yet` : "based on the last 7 days"}
          tone={stats.unpricedCalls30 ? "warn" : undefined}
        />
      </div>
      <RealCosts only={finance} withAdmins={financeWithAdmins} sweep={sweep} />
      <SpendChart daily={stats.daily} />
    </div>
  );
}
