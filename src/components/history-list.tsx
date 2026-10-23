"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/toast";
import { deleteAllHistory, deleteHistoryEntry } from "@/app/(app)/history/actions";

export interface HistoryItem {
  id: string;
  characterId: string | null;
  characterName: string;
  kind: string;
  label: string;
  prompt: string;
  thumbnail: string | null;
  createdAt: string;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function HistoryList({ items, characters }: { items: HistoryItem[]; characters: { id: string; name: string }[] }) {
  const [query, setQuery] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const { toast, show } = useToast(2500);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) => (!characterId || i.characterId === characterId) && (!q || `${i.label} ${i.prompt}`.toLowerCase().includes(q)),
    );
  }, [items, query, characterId]);

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="mt-6 flex flex-col gap-4">
      {toast}
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search prompts" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search history" />
        <select
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          aria-label="Filter by character"
          className="h-9 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm"
        >
          <option value="">All characters</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!items.length}
            onClick={() => download("model-spawn-history.json", JSON.stringify(items.map(({ thumbnail: _t, ...rest }) => rest), null, 2), "application/json")}
          >
            Export
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!items.length || pending}
            onClick={() => {
              if (window.confirm("Delete all history? This can't be undone.")) start(() => deleteAllHistory());
            }}
          >
            Delete all
          </Button>
        </div>
      </div>

      {!shown.length && <p className="text-neutral-400">{items.length ? "Nothing matches." : "Nothing saved yet. Prompts you write will show up here."}</p>}

      {shown.map((i) => {
        const expanded = open.has(i.id);
        return (
          <Card key={i.id}>
            <CardContent className="flex gap-3 pt-5">
              {i.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{i.label}</span>
                  <span className="text-xs text-neutral-500">{i.characterName} · {when(i.createdAt)}</span>
                </div>
                <p className={`mt-1 whitespace-pre-wrap text-sm text-neutral-300 ${expanded ? "" : "line-clamp-2"}`}>{i.prompt}</p>
                <div className="mt-2 flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await navigator.clipboard.writeText(i.prompt);
                      show("Copied");
                    }}
                  >
                    Copy
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => toggle(i.id)}>{expanded ? "Collapse" : "Expand"}</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => start(() => deleteHistoryEntry(i.id))}>Delete</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
