import type { AdminStats, FinanceStats } from "@/lib/admin-stats";
import { featureLabel } from "@/lib/ledger-types";

/** Everything on the Admin page, for "Export as". */
export interface AdminSnapshot {
  generatedAt: string;
  config: { caps: { free: { runs: number; likeness: number; images?: number }; pro: { runs: number; likeness: number } }; serverModel: string };
  stats: AdminStats;
  /** Real costs of the platform key alone, and with admin accounts' own testing. */
  realCosts: { platformKeyOnly: FinanceStats; withAdminTesting: FinanceStats };
  /** The final-charge lookup that ran as the page opened. */
  sweep: { checked: number; settled: number; held: number; unreadable: number } | null;
}

const usd = (n: number) => (n === 0 ? "$0" : `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`);
const round = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

/** The whole snapshot, every number, for tools or an AI to read. */
export function snapshotJson(s: AdminSnapshot): string {
  return JSON.stringify(s, (_k, v) => (typeof v === "number" && Number.isFinite(v) && !Number.isInteger(v) ? round(v) : v === Infinity ? null : v), 2);
}

function mdTable(head: string[], rows: (string | number)[][]): string {
  if (!rows.length) return "_None._\n";
  const line = (r: (string | number)[]) => `| ${r.map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(head), `| ${head.map(() => "---").join(" | ")} |`, ...rows.map(line)].join("\n") + "\n";
}

function financeMd(title: string, f: FinanceStats): string {
  return [
    `### ${title}`,
    "",
    `- Spent: ${usd(f.total30)} (platform key ${usd(f.server30)}, admin testing ${usd(f.byok30)})`,
    `- People: ${f.people30}`,
    `- Images generated: ${f.images30} (${usd(f.imageCost30)} total, ${f.failedImages30} failed), average ${f.images30 ? usd(f.avgImage) : "-"} per image`,
    `- Text calls: ${f.textCalls30}, tokens in ${f.tokensIn30.toLocaleString("en-US")} / out ${f.tokensOut30.toLocaleString("en-US")}, ${usd(f.textCost30)}`,
    `- Calls with SpicyAPI's final charge: ${Math.round(f.realShare * 100)}%`,
    "",
    "**Cost per image**",
    "",
    mdTable(
      ["Model", "Size", "Images", "Average", "Lowest", "Highest", "Final charge"],
      f.images.map((g) => [g.model, g.size, g.count, usd(g.avg), usd(g.min), usd(g.max), `${g.settled}/${g.count}`]),
    ),
    "**Cost per text job**",
    "",
    mdTable(
      ["Job", "Model", "Calls", "Avg tokens in", "Avg tokens out", "Avg cost", "Total", "Real charge"],
      f.text.map((g) => [featureLabel(g.feature), g.model, g.calls, Math.round(g.avgIn), Math.round(g.avgOut), usd(g.avgCost), usd(g.total), `${g.real}/${g.calls}`]),
    ),
    f.measured.length
      ? "**Measured text prices (per 1M tokens)**\n\n" + mdTable(["Model", "Input", "Output", "From calls"], f.measured.map((m) => [m.model, `$${m.input.toFixed(2)}`, `$${m.output.toFixed(2)}`, m.calls]))
      : "",
  ].join("\n");
}

/** A readable report: paste it into a chat or a doc. */
export function snapshotMarkdown(s: AdminSnapshot): string {
  const st = s.stats;
  return [
    `# Model Spawn admin report`,
    "",
    `Generated ${s.generatedAt}. Figures cover the last 30 days unless noted.`,
    "",
    "## Your AI key (platform key)",
    "",
    `- Spent today: ${usd(st.serverToday)}, last 7 days: ${usd(st.server7)}, last 30 days: ${usd(st.server30)}`,
    `- Average a day: ${usd(st.avgPerDay7)} (7 days), ${usd(st.avgPerDay30)} (30 days); month at this pace: ${usd(st.projectedMonth)}`,
    `- Active today: ${st.activeToday}, prompts today: ${st.runsToday}, unpriced calls: ${st.unpricedCalls30}`,
    "",
    "## Real costs",
    "",
    s.sweep
      ? `Final-charge lookup as the page opened: ${s.sweep.checked} checked, ${s.sweep.settled} settled, ${s.sweep.held} still held, ${s.sweep.unreadable} unreadable.\n`
      : "",
    financeMd("Platform key and admin testing", s.realCosts.withAdminTesting),
    financeMd("Platform key only", s.realCosts.platformKeyOnly),
    "## Daily spend on the platform key (last 14 days, UTC)",
    "",
    mdTable(["Day", "Cost", "Calls"], st.daily.map((d) => [d.day, usd(d.cost), d.calls])),
    "## People",
    "",
    mdTable(
      ["Person", "Plan", "Own key", "Prompts today", "Likeness today", "Prompts 7d", "Your cost 7d", "Your cost 30d", "Their own-key spend 30d", "Last active"],
      st.users.map((u) => [u.email ?? u.id.slice(0, 8), u.is_admin ? "admin" : u.plan, u.ownKey ? "yes" : "no", u.runsToday, u.likenessToday, u.runs7, usd(u.server7), usd(u.server30), usd(u.ownKey30), u.lastActive ?? "never"]),
    ),
    "## Settings",
    "",
    `- Daily caps (free plan): ${s.config.caps.free.runs} prompts / ${s.config.caps.free.likeness} likeness / ${s.config.caps.free.images ?? "-"} images; Pro has no daily limits`,
    `- Model on the platform key: ${s.config.serverModel}`,
    "",
  ].join("\n");
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csvBlock = (title: string, head: string[], rows: (string | number | null | undefined)[][]) =>
  [[title], head, ...rows, []].map((r) => r.map(csvCell).join(",")).join("\n");

/** Every table, one after another with a title row each, for a spreadsheet. */
export function snapshotCsv(s: AdminSnapshot): string {
  const st = s.stats;
  const fin = (label: string, f: FinanceStats) => [
    csvBlock(`Real costs: ${label}`, ["Metric", "Value"], [
      ["Spent (USD)", round(f.total30)],
      ["Platform key (USD)", round(f.server30)],
      ["Admin testing (USD)", round(f.byok30)],
      ["People", f.people30],
      ["Images generated", f.images30],
      ["Failed images", f.failedImages30],
      ["Image cost (USD)", round(f.imageCost30)],
      ["Average per image (USD)", round(f.avgImage)],
      ["Text calls", f.textCalls30],
      ["Tokens in", f.tokensIn30],
      ["Tokens out", f.tokensOut30],
      ["Text cost (USD)", round(f.textCost30)],
      ["Share with final charge", round(f.realShare, 4)],
    ]),
    csvBlock(`Cost per image: ${label}`, ["Model", "Size", "Images", "Average (USD)", "Lowest (USD)", "Highest (USD)", "Final charges"], f.images.map((g) => [g.model, g.size, g.count, round(g.avg), round(g.min), round(g.max), g.settled])),
    csvBlock(
      `Cost per text job: ${label}`,
      ["Job", "Model", "Calls", "Avg tokens in", "Avg tokens out", "Avg cost (USD)", "Total (USD)", "Real charges"],
      f.text.map((g) => [featureLabel(g.feature), g.model, g.calls, Math.round(g.avgIn), Math.round(g.avgOut), round(g.avgCost), round(g.total), g.real]),
    ),
    csvBlock(`Measured text prices: ${label}`, ["Model", "Input per 1M (USD)", "Output per 1M (USD)", "From calls"], f.measured.map((m) => [m.model, round(m.input, 4), round(m.output, 4), m.calls])),
  ];
  return [
    csvBlock("Model Spawn admin report", ["Generated", s.generatedAt], []),
    csvBlock("Platform key", ["Metric", "Value"], [
      ["Spent today (USD)", round(st.serverToday)],
      ["Last 7 days (USD)", round(st.server7)],
      ["Last 30 days (USD)", round(st.server30)],
      ["Average a day, 7 days (USD)", round(st.avgPerDay7)],
      ["Average a day, 30 days (USD)", round(st.avgPerDay30)],
      ["Month at this pace (USD)", round(st.projectedMonth)],
      ["Active today", st.activeToday],
      ["Prompts today", st.runsToday],
      ["Unpriced calls, 30 days", st.unpricedCalls30],
    ]),
    ...fin("platform key and admin testing", s.realCosts.withAdminTesting),
    ...fin("platform key only", s.realCosts.platformKeyOnly),
    csvBlock("Daily spend on the platform key (UTC)", ["Day", "Cost (USD)", "Calls"], st.daily.map((d) => [d.day, round(d.cost), d.calls])),
    csvBlock(
      "People",
      ["Person", "Plan", "Own key", "Prompts today", "Likeness today", "Prompts 7d", "Your cost 7d (USD)", "Your cost 30d (USD)", "Their own-key spend 30d (USD)", "Last active"],
      st.users.map((u) => [u.email ?? u.id, u.is_admin ? "admin" : u.plan, u.ownKey ? "yes" : "no", u.runsToday, u.likenessToday, u.runs7, round(u.server7), round(u.server30), round(u.ownKey30), u.lastActive]),
    ),
  ].join("\n");
}
