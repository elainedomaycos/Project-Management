import { useMemo, useRef, useState } from "react";
import { Check, Info, Pencil, Plus, Trash2, X } from "lucide-react";
import type { TimelineItem, TimelineKind } from "@/lib/timeline-types";

const DAY = 86400000;
const DAY_W = 2;
const ROW_H = 36;
const HEADER_H = 30;
const LEFT_W = "var(--left-w)";
const LEFT_W_STYLE = { "--left-w": "clamp(180px, 32vw, 260px)" } as React.CSSProperties;

const BAR_STYLES: Record<TimelineKind, string> = {
  phase: "bg-indigo-500/90",
  epic: "bg-blue-500/80",
  task: "bg-emerald-500/70",
  milestone: "bg-amber-400",
};

const KIND_LABEL: Record<TimelineKind, string> = {
  phase: "P",
  epic: "E",
  task: "T",
  milestone: "M",
};

function parseDate(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function toStr(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function shift(s: string, days: number): string {
  const d = parseDate(s) ?? new Date();
  return toStr(new Date(d.getTime() + days * DAY));
}

type DragState = {
  id: string;
  mode: "move" | "left" | "right";
  startX: number;
  startStart: string;
  startEnd: string;
};

type Preview = { id: string; start: string; end: string };

type Props = {
  items: TimelineItem[];
  onSave: (item: TimelineItem) => void;
  onDelete: (id: string) => void;
  onAdd: (kind: "task" | "epic" | "milestone", parentId: string | null) => void;
};

export function Gantt({ items, onSave, onDelete, onAdd }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TimelineItem | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { domainStart, domainEnd, gridW } = useMemo(() => {
    const dates: Date[] = [];
    items.forEach((it) => {
      const a = parseDate(it.startDate);
      const b = parseDate(it.endDate);
      if (a) dates.push(a);
      if (b) dates.push(b);
    });
    let start: Date;
    let end: Date;
    if (!dates.length) {
      const t = new Date();
      start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      end = new Date(t.getFullYear(), t.getMonth() + 3, 1);
    } else {
      const min = new Date(Math.min(...dates.map((d) => d.getTime())));
      const max = new Date(Math.max(...dates.map((d) => d.getTime())));
      start = new Date(min.getFullYear(), min.getMonth(), 1);
      end = new Date(max.getFullYear(), max.getMonth() + 1, 1);
    }
    const w = Math.max(400, ((end.getTime() - start.getTime()) / DAY) * DAY_W);
    return { domainStart: start, domainEnd: end, gridW: w };
  }, [items]);

  const depths = useMemo(() => {
    const map = new Map<string, TimelineItem>();
    items.forEach((it) => map.set(it.id, it));
    const depthOf = (id: string | null): number => {
      if (!id) return 0;
      let depth = 0;
      let cur = map.get(id);
      const seen = new Set<string>();
      while (cur?.parentId && !seen.has(cur.id)) {
        seen.add(cur.id);
        depth++;
        cur = map.get(cur.parentId);
      }
      return depth;
    };
    const out = new Map<string, number>();
    items.forEach((it) => out.set(it.id, depthOf(it.id)));
    return out;
  }, [items]);

  const months = useMemo(() => {
    const out: { label: string; x: number; w: number }[] = [];
    let cur = new Date(domainStart.getFullYear(), domainStart.getMonth(), 1);
    while (cur.getTime() <= domainEnd.getTime()) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const x = ((cur.getTime() - domainStart.getTime()) / DAY) * DAY_W;
      const w = Math.max(0, ((next.getTime() - cur.getTime()) / DAY) * DAY_W);
      out.push({
        label: cur.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        x,
        w,
      });
      cur = next;
    }
    return out;
  }, [domainStart, domainEnd]);

  const todayX = Math.max(0, Math.min(gridW, ((Date.now() - domainStart.getTime()) / DAY) * DAY_W));

  const selected = selectedId ? items.find((i) => i.id === selectedId) : undefined;

  function xOf(s: string): number {
    const d = parseDate(s);
    if (!d) return 0;
    return Math.max(0, ((d.getTime() - domainStart.getTime()) / DAY) * DAY_W);
  }

  function beginDrag(e: React.PointerEvent, item: TimelineItem, mode: DragState["mode"]) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startStart = item.startDate || toStr(new Date());
    const startEnd = item.endDate || shift(startStart, 7);
    setDrag({ id: item.id, mode, startX: e.clientX, startStart, startEnd });
    setPreview({ id: item.id, start: startStart, end: startEnd });
  }

  function onMove(e: React.PointerEvent) {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.startX) / DAY_W);
    let start = drag.startStart;
    let end = drag.startEnd;
    if (drag.mode === "move") {
      start = shift(drag.startStart, delta);
      end = shift(drag.startEnd, delta);
    } else if (drag.mode === "left") {
      start = shift(drag.startStart, delta);
      if (
        parseDate(start) &&
        parseDate(end) &&
        parseDate(start)!.getTime() >= parseDate(end)!.getTime()
      ) {
        start = drag.startEnd;
      }
    } else {
      end = shift(drag.startEnd, delta);
      if (
        parseDate(start) &&
        parseDate(end) &&
        parseDate(end)!.getTime() <= parseDate(start)!.getTime()
      ) {
        end = drag.startStart;
      }
    }
    setPreview({ id: drag.id, start, end });
  }

  function onUp() {
    if (drag && preview) {
      const item = items.find((i) => i.id === drag.id);
      if (item && preview.start && preview.end) {
        onSave({ ...item, startDate: preview.start, endDate: preview.end });
      }
    }
    setDrag(null);
    setPreview(null);
  }

  function startEdit(item: TimelineItem) {
    setEditingId(item.id);
    setEditingTitle(item.title);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function commitEdit(item: TimelineItem) {
    if (editingId === item.id) {
      const title = editingTitle.trim() || item.title;
      if (title !== item.title) onSave({ ...item, title });
    }
    setEditingId(null);
  }

  function openDetails(item: TimelineItem) {
    setSelectedId(item.id);
    setDraft({ ...item });
  }

  function closeDetails() {
    setSelectedId(null);
    setDraft(null);
  }

  const childKind = (parent: TimelineItem | null): "task" | "epic" => {
    if (!parent) return "task";
    if (parent.kind === "phase") return "epic";
    return "task";
  };

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface-2/50 p-10 text-center">
        <p className="text-sm text-muted-foreground">No plan yet for this project.</p>
        <div className="flex gap-2">
          <button
            onClick={() => onAdd("task", null)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Add first task
          </button>
        </div>
      </div>
    );
  }

  const depTitles = (item: TimelineItem) =>
    item.dependencies
      .map((id) => items.find((i) => i.id === id)?.title)
      .filter((t): t is string => !!t);
  const childCount = (item: TimelineItem) => items.filter((i) => i.parentId === item.id).length;
  const parentTitle = (item: TimelineItem) =>
    item.parentId ? (items.find((i) => i.id === item.parentId)?.title ?? "") : "";

  return (
    <div>
      {draft && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={closeDetails}
        >
          <div
            className="w-full max-w-xl bg-card border border-border rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                Editing item
                <span className="rounded bg-popover px-1 py-0.5 text-[10px] font-mono normal-case">
                  {draft.id}
                </span>
              </div>
              <button
                onClick={closeDetails}
                className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full rounded-md border border-border bg-popover px-3 py-2 text-sm font-medium text-foreground outline-none focus:border-primary/60"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Kind
                  <select
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value as TimelineKind })}
                    className="rounded border border-border bg-popover px-1.5 py-1 text-xs text-foreground normal-case"
                  >
                    {(["phase", "epic", "task", "milestone"] as const).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Start
                  <input
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                    className="rounded border border-border bg-popover px-1.5 py-1 text-xs text-foreground"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  End
                  <input
                    type="date"
                    value={draft.endDate}
                    onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                    className="rounded border border-border bg-popover px-1.5 py-1 text-xs text-foreground"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Assignee
                  <input
                    value={draft.assignee}
                    onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
                    className="rounded border border-border bg-popover px-1.5 py-1 text-xs text-foreground"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Effort
                  <input
                    value={draft.effort}
                    onChange={(e) => setDraft({ ...draft, effort: e.target.value })}
                    placeholder="e.g. 2d, 1w"
                    className="rounded border border-border bg-popover px-1.5 py-1 text-xs text-foreground"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Notes
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded border border-border bg-popover px-2 py-1 text-xs text-foreground outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-3 text-[10px] font-mono text-muted-foreground">
                {parentTitle(draft) && (
                  <span>
                    Parent: <span className="text-foreground">{parentTitle(draft)}</span>
                  </span>
                )}
                {childCount(draft) > 0 && (
                  <span>
                    Children: <span className="text-foreground">{childCount(draft)}</span>
                  </span>
                )}
                {depTitles(draft).length > 0 && (
                  <span>
                    Depends on:{" "}
                    <span className="text-foreground">{depTitles(draft).join(", ")}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <button
                onClick={closeDetails}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-3.5" /> Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onDelete(draft.id);
                    closeDetails();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
                <button
                  onClick={() => {
                    onSave(draft);
                    closeDetails();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Check className="size-3.5" /> Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="relative overflow-x-auto rounded-lg border border-border bg-surface-2"
        style={LEFT_W_STYLE}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="sticky top-0 z-20 flex bg-surface-2 border-b border-border">
          <div
            className="shrink-0 border-r border-border px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
            style={{ width: LEFT_W }}
          >
            Plan / Timeline
          </div>
          <div className="relative flex" style={{ width: gridW, height: HEADER_H }}>
            {months.map((m, i) => (
              <div
                key={i}
                className="border-r border-border/60 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
                style={{ left: m.x, width: m.w, position: "absolute" }}
              >
                {m.label}
              </div>
            ))}
            {todayX > 0 && todayX < gridW && (
              <div
                className="absolute inset-y-0 z-10 border-l-2 border-red-400/80"
                style={{ left: todayX }}
              />
            )}
          </div>
        </div>

        <div className="relative">
          {items.map((item) => {
            const depth = depths.get(item.id) ?? 0;
            const isEditing = editingId === item.id;
            const p = preview && preview.id === item.id ? preview : null;
            const start = p ? p.start : item.startDate || toStr(new Date());
            const end = p ? p.end : item.endDate || shift(start, 7);
            const x = xOf(start);
            const w = Math.max(
              8,
              Math.round(
                ((parseDate(end)!.getTime() - parseDate(start)!.getTime()) / DAY) * DAY_W,
              ) + DAY_W,
            );
            const isMilestone = item.kind === "milestone";
            const isSelected = selectedId === item.id;
            return (
              <div
                key={item.id}
                className={"flex border-b border-border/60 " + (isSelected ? "bg-primary/5" : "")}
                style={{ height: ROW_H }}
              >
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 bg-surface-2 px-3 border-r border-border"
                  style={{ width: LEFT_W, paddingLeft: 10 + depth * 14 }}
                >
                  <span
                    className={
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white " +
                      (item.kind === "phase"
                        ? "bg-indigo-500"
                        : item.kind === "epic"
                          ? "bg-blue-500"
                          : item.kind === "milestone"
                            ? "bg-amber-500"
                            : "bg-emerald-500")
                    }
                    title={item.kind}
                  >
                    {KIND_LABEL[item.kind]}
                  </span>
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => commitEdit(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(item);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-border bg-popover px-1 py-0.5 text-xs text-foreground outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => openDetails(item)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startEdit(item);
                      }}
                      className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground hover:text-primary"
                      title={item.title}
                    >
                      {item.title}
                    </button>
                  )}
                  {item.effort && (
                    <span className="hidden shrink-0 text-[10px] font-mono text-muted-foreground sm:inline">
                      {item.effort}
                    </span>
                  )}
                  {item.assignee && (
                    <span className="hidden shrink-0 rounded bg-popover px-1 py-0.5 text-[10px] text-muted-foreground lg:inline">
                      {item.assignee}
                    </span>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-70 hover:opacity-100">
                    <button
                      onClick={() => openDetails(item)}
                      className="rounded p-1 text-muted-foreground hover:bg-popover hover:text-foreground"
                      title="Details"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      className="rounded p-1 text-muted-foreground hover:bg-popover hover:text-foreground"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {item.kind !== "phase" && (
                      <button
                        onClick={() => onAdd(childKind(item), item.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-popover hover:text-foreground"
                        title="Add child"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(item.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="group relative flex-1" style={{ width: gridW }}>
                  {isMilestone ? (
                    <div
                      className="absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab touch-none"
                      style={{ left: x, backgroundColor: "#fbbf24" }}
                      onPointerDown={(e) => beginDrag(e, item, "move")}
                      onDoubleClick={() => openDetails(item)}
                      title={`${item.title}\n${item.startDate}`}
                    />
                  ) : (
                    <div
                      className={
                        "absolute top-1/2 z-10 h-5 -translate-y-1/2 cursor-grab touch-none rounded-sm border border-black/20 " +
                        BAR_STYLES[item.kind] +
                        (p ? " ring-2 ring-primary" : "")
                      }
                      style={{ left: x, width: w }}
                      onPointerDown={(e) => beginDrag(e, item, "move")}
                      onDoubleClick={() => openDetails(item)}
                      title={`${item.title}\n${item.startDate} → ${item.endDate}`}
                    >
                      <div
                        className="absolute -left-1 top-0 h-full w-2 cursor-ew-resize rounded-l-sm bg-black/25"
                        onPointerDown={(e) => beginDrag(e, item, "left")}
                      />
                      <div
                        className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize rounded-r-sm bg-black/25"
                        onPointerDown={(e) => beginDrag(e, item, "right")}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div
            className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-red-400/80"
            style={{
              left: `calc(${LEFT_W} + ${todayX}px)`,
              display: todayX > 0 && todayX < gridW ? "block" : "none",
            }}
          />
          {months.map((m, i) => (
            <div
              key={i}
              className="pointer-events-none absolute inset-y-0 border-l border-border/40"
              style={{ left: `calc(${LEFT_W} + ${m.x}px)`, display: m.x === 0 ? "none" : "block" }}
            />
          ))}

          <svg
            className="pointer-events-none absolute z-30"
            style={{ left: LEFT_W, top: 0, width: gridW, height: items.length * ROW_H }}
          >
            {items.map((item) =>
              item.dependencies.map((depId) => {
                const dep = items.find((d) => d.id === depId);
                if (!dep || !dep.endDate || !item.startDate) return null;
                const depEnd = parseDate(dep.endDate);
                const depStart = parseDate(dep.startDate) ?? depEnd;
                if (!depEnd || !depStart) return null;
                const fromX =
                  xOf(dep.endDate) +
                  Math.round(((depEnd.getTime() - depStart.getTime()) / DAY) * DAY_W) +
                  DAY_W;
                const fromY = items.indexOf(dep) * ROW_H + ROW_H / 2;
                const toX = xOf(item.startDate);
                const toY = items.indexOf(item) * ROW_H + ROW_H / 2;
                const midX = (fromX + toX) / 2;
                return (
                  <path
                    key={`${depId}-${item.id}`}
                    d={`M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`}
                    fill="none"
                    stroke="rgba(251,191,36,0.55)"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                  />
                );
              }),
            )}
          </svg>
        </div>

        <div className="sticky bottom-0 z-20 flex border-t border-border bg-surface-2">
          <button
            onClick={() => onAdd("task", null)}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add task
          </button>
          <button
            onClick={() => onAdd("milestone", null)}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span className="inline-block h-2 w-2 rotate-45 bg-amber-400" /> Add milestone
          </button>
        </div>
      </div>
    </div>
  );
}
