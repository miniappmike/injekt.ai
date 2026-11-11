"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/info-tip";
import { saveSettings, setUserPlan } from "@/app/(app)/admin/actions";
import type { AdminStats, UserStats } from "@/lib/admin-stats";
import { cn } from "@/lib/utils";

type Config = {
  caps: { free: { runs: number; likeness: number }; pro: { runs: number; likeness: number } };
  serverModel: string;
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

function CapsForm({ config }: { config: Config }) {
  const router = useRouter();
  const [c, setC] = useState(config);
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();
  const [pending, start] = useTransition();
  const capInput = (plan: "free" | "pro", key: "runs" | "likeness") => (
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={`${plan === "free" ? "Free" : "Pro"} ${key === "runs" ? "prompts" : "likeness checks"} per day`}
      value={c.caps[plan][key]}
      onChange={(e) => setC((x) => ({ ...x, caps: { ...x.caps, [plan]: { ...x.caps[plan], [key]: Number(e.target.value) } } }))}
      className="w-24 tabular-nums"
    />
  );
  const price = c.serverPrice ?? { input: 0, output: 0 };
  return (
    <section className="panel flex flex-col gap-5 p-5" aria-labelledby="caps-title">
      <div>
        <h2 id="caps-title" className="font-display text-lg font-bold text-neutral-50">Limits and AI model</h2>
        <p className="text-sm text-neutral-400">Changes apply to everyone within about 15 seconds. People using their own AI key are never limited.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full max-w-md text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-400">
              <th className="pb-2 font-medium">Per day</th>
              <th className="pb-2 font-medium">Free</th>
              <th className="pb-2 font-medium">Pro</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1.5 pr-4 text-neutral-200">
                <span className="flex items-center gap-1.5">Prompts <InfoTip label="What counts as a prompt">Each target photo in Inject, and each press of Write variations, Write variant edits or Plan carousel. Direct swap and copying are free.</InfoTip></span>
              </td>
              <td className="py-1.5 pr-3">{capInput("free", "runs")}</td>
              <td className="py-1.5">{capInput("pro", "runs")}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-4 text-neutral-200">Likeness checks</td>
              <td className="py-1.5 pr-3">{capInput("free", "likeness")}</td>
              <td className="py-1.5">{capInput("pro", "likeness")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] [&>*]:min-w-0">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 text-neutral-200">Model on your key <InfoTip label="About the model">The SpicyAPI model your key uses for everyone without their own key: prompt writing, sheet reading and likeness checks.</InfoTip></span>
          <Input value={c.serverModel} onChange={(e) => setC((x) => ({ ...x, serverModel: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-neutral-200">$ per 1M input</span>
          <Input type="number" min={0} step="0.01" value={price.input} onChange={(e) => setC((x) => ({ ...x, serverPrice: { ...price, input: Number(e.target.value) } }))} className="w-28 tabular-nums" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-neutral-200">$ per 1M output</span>
          <Input type="number" min={0} step="0.01" value={price.output} onChange={(e) => setC((x) => ({ ...x, serverPrice: { ...price, output: Number(e.target.value) } }))} className="w-28 tabular-nums" />
        </label>
      </div>
      <p className="-mt-3 text-xs text-neutral-500">The price is only used to work out costs on this page. Leave both at 0 to use the provider&apos;s reported cost where it gives one.</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const p = c.serverPrice && (c.serverPrice.input > 0 || c.serverPrice.output > 0) ? c.serverPrice : null;
              const r = await saveSettings({ caps: c.caps, serverModel: c.serverModel, serverPrice: p });
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

function PlanSwitch({ user }: { user: UserStats }) {
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

function UsersTable({ users, caps }: { users: UserStats[]; caps: Config["caps"] }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "today" | "limit">("all");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.filter((u) => {
      if (s && !(u.email ?? u.id).toLowerCase().includes(s)) return false;
      if (only === "today") return u.runsToday + u.likenessToday > 0;
      if (only === "limit") return !u.ownKey && !u.is_admin && u.runsToday >= caps[u.plan].runs;
      return true;
    });
  }, [users, q, only, caps]);

  return (
    <section className="panel flex flex-col gap-4 p-5" aria-labelledby="users-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="users-title" className="font-display text-lg font-bold text-neutral-50">People</h2>
          <p className="text-sm text-neutral-400">Sorted by what they cost your key over 30 days.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" className="w-48" />
          <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} aria-label="Show" className="h-10 rounded-lg border border-neutral-700/80 bg-neutral-950/60 px-3 text-sm">
            <option value="all">Everyone</option>
            <option value="today">Active today</option>
            <option value="limit">Hit today&apos;s limit</option>
          </select>
        </div>
      </div>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-xs text-neutral-400">
              <th className="py-2 pr-3 font-medium">Person</th>
              <th className="py-2 pr-3 font-medium">Plan</th>
              <th className="py-2 pr-3 text-right font-medium">Prompts today</th>
              <th className="py-2 pr-3 text-right font-medium">Likeness today</th>
              <th className="py-2 pr-3 text-right font-medium">Prompts 7d</th>
              <th className="py-2 pr-3 text-right font-medium">Your cost 7d</th>
              <th className="py-2 pr-3 text-right font-medium">Your cost 30d</th>
              <th className="py-2 text-right font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const cap = u.ownKey || u.is_admin ? null : caps[u.plan];
              const full = cap && u.runsToday >= cap.runs;
              return (
                <tr key={u.id} className="border-b border-neutral-800/60 transition-colors hover:bg-neutral-800/30">
                  <td className="max-w-[220px] py-2 pr-3">
                    <span className="block truncate text-neutral-100" title={u.email ?? u.id}>{u.email ?? u.id.slice(0, 8)}</span>
                    {u.ownKey && <span className="text-[11px] text-emerald-300">Own AI key</span>}
                  </td>
                  <td className="py-2 pr-3"><PlanSwitch user={u} /></td>
                  <td className={cn("py-2 pr-3 text-right tabular-nums", full ? "font-semibold text-amber-300" : "text-neutral-200")}>
                    {u.runsToday}{cap ? <span className="text-neutral-500"> / {cap.runs}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-200">
                    {u.likenessToday}{cap ? <span className="text-neutral-500"> / {cap.likeness}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-200">{u.runs7}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-200">{usd(u.server7)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold text-neutral-50">{usd(u.server30)}</td>
                  <td className="py-2 text-right text-xs text-neutral-400">{ago(u.lastActive)}</td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-neutral-500">Nobody matches.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminConsole({ config, stats, usageMissing }: { config: Config; stats: AdminStats; usageMissing: boolean }) {
  const payingUsers = stats.users.filter((u) => u.server30 > 0).length;
  return (
    <div className="mt-6 flex flex-col gap-5">
      {usageMissing && (
        <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Daily limits aren&apos;t switched on yet: run migrations <b>0012_daily_usage.sql</b> and <b>0013_app_settings.sql</b> in the Supabase SQL editor.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Spent today" value={usd(stats.serverToday)} note={`${stats.activeToday} active · ${stats.runsToday} prompts`} />
        <Tile label="Average a day" value={usd(stats.avgPerDay7)} note={`last 7 days · 30-day avg ${usd(stats.avgPerDay30)}`} />
        <Tile label="Last 30 days" value={usd(stats.server30)} note={`${payingUsers} people used your key`} />
        <Tile
          label="Month at this pace"
          value={usd(stats.projectedMonth)}
          note={stats.unpricedCalls30 ? `${stats.unpricedCalls30} calls had no price: set one below` : "based on the last 7 days"}
          tone={stats.unpricedCalls30 ? "warn" : undefined}
        />
      </div>
      <SpendChart daily={stats.daily} />
      <CapsForm config={config} />
      <UsersTable users={stats.users} caps={config.caps} />
    </div>
  );
}
