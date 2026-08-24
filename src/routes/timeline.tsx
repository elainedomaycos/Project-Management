import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  CalendarRange,
  Check,
  FileDown,
  Flag,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Bar, PageHeader } from "@/components/console";
import { Gantt } from "@/components/gantt";
import { useProject } from "@/lib/project-context";
import { useTimeline } from "@/lib/timeline-context";
import { generateTimelineId, type TimelineItem } from "@/lib/timeline-types";
import {
  runAiAction,
  runCustom,
  type AiTimelineItem,
  type PlannerAction,
  type PlannerInput,
  type PlannerTask,
} from "@/lib/planner-ai";

export const Route = createFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "Project Timeline · Task Tracker" },
      {
        name: "description",
        content: "AI-generated project timeline and Gantt planning.",
      },
    ],
  }),
  component: TimelinePage,
});

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

type DiffCategory = "timeline" | "dependency" | "task" | "resource" | "risk";

type DiffEntry = {
  status: "add" | "remove" | "change";
  title: string;
  detail: string;
  category: DiffCategory;
};

const CATEGORY_META: {
  key: DiffCategory;
  label: string;
  icon: typeof TriangleAlert;
  iconClass: string;
}[] = [
  {
    key: "timeline",
    label: "timeline adjustments",
    icon: TriangleAlert,
    iconClass: "text-warning",
  },
  { key: "dependency", label: "dependency changes", icon: ArrowUpRight, iconClass: "text-primary" },
  { key: "task", label: "task optimizations", icon: Zap, iconClass: "text-success" },
  { key: "resource", label: "resource suggestions", icon: Users, iconClass: "text-info" },
  { key: "risk", label: "risk mitigations", icon: ShieldCheck, iconClass: "text-destructive" },
];

const QUICK_COMMANDS: { label: string; action?: PlannerAction }[] = [
  { label: "Generate plan" },
  { label: "Regenerate plan" },
  { label: "Optimize timeline", action: "optimize" },
  { label: "Find bottlenecks", action: "critical" },
  { label: "Balance workload", action: "balance" },
  { label: "Add milestones", action: "milestones" },
  { label: "Identify risks", action: "conflicts" },
  { label: "Fit deadline", action: "deadline" },
];

function Stat({
  label,
  value,
  hint,
  tone,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "success";
  children?: React.ReactNode;
}) {
  const valueClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "success"
        ? "text-success"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-bold tracking-tight ${valueClass}`}>{value}</div>
      {hint && <div className="text-[10px] font-mono text-muted-foreground">{hint}</div>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function TimelinePage() {
  const { currentProject, tasks, developers, getAnalytics, updateTask } = useProject();
  const {
    items,
    loading,
    suggestion,
    setSuggestion,
    saveItem,
    deleteItem,
    applySuggestion,
    discardSuggestion,
  } = useTimeline();

  const [prompt, setPrompt] = useState("");
  const [brief, setBrief] = useState("");
  const [deadline, setDeadline] = useState(shiftDays(180));
  const [teamSize, setTeamSize] = useState(1);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showAi, setShowAi] = useState(false);

  useEffect(() => {
    if (!currentProject) return;
    const parts = [
      currentProject.clientName
        ? `Client: ${currentProject.clientName}`
        : `Project: ${currentProject.name}`,
    ];
    if (currentProject.endUsers.length) {
      parts.push(`End users: ${currentProject.endUsers.join(", ")}`);
    }
    if (currentProject.modules.length) {
      parts.push(`Modules: ${currentProject.modules.join(", ")}`);
    }
    parts.push(`Build a complete, phased delivery roadmap for ${currentProject.name}.`);
    setBrief(parts.join("\n"));
    setDeadline(shiftDays(180));
    setTeamSize(developers.length || 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  const analytics = useMemo(() => {
    if (!currentProject) return null;
    return getAnalytics(currentProject.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, tasks]);

  const atRisk = useMemo(() => {
    if (!currentProject) return 0;
    const today = todayStr();
    return tasks.filter(
      (t) =>
        t.projectId === currentProject.id && t.status !== "done" && t.dueDate && t.dueDate < today,
    ).length;
  }, [tasks, currentProject]);

  const health = useMemo(() => {
    if (!currentProject || !analytics) return null;
    const dates = items.flatMap((i) => [i.startDate, i.endDate].filter(Boolean));
    let spanDays = 0;
    let spanLabel = "—";
    if (dates.length) {
      const min = new Date(Math.min(...dates.map((d) => new Date(d).getTime())));
      const max = new Date(Math.max(...dates.map((d) => new Date(d).getTime())));
      spanDays = Math.max(0, Math.round((max.getTime() - min.getTime()) / 86400000));
      spanLabel = `${Math.round(spanDays / 30)} mo`;
    }
    const counts = {
      phase: items.filter((i) => i.kind === "phase").length,
      epic: items.filter((i) => i.kind === "epic").length,
      task: items.filter((i) => i.kind === "task").length,
      milestone: items.filter((i) => i.kind === "milestone").length,
    };
    return { spanLabel, counts };
  }, [items, analytics, currentProject]);

  function buildPlannerInput(): PlannerInput {
    return {
      title: currentProject?.name ?? "Project",
      description: brief,
      endUsers: currentProject?.endUsers ?? [],
      modules: currentProject?.modules ?? [],
      startDate: currentProject?.createdAt ? currentProject.createdAt.slice(0, 10) : todayStr(),
      deadline,
      teamSize,
    };
  }

  function toAiItems(list: TimelineItem[]): AiTimelineItem[] {
    const byId = new Map(list.map((i) => [i.id, i]));
    return list.map((i) => ({
      kind: i.kind,
      title: i.title,
      parent: i.parentId ? byId.get(i.parentId)?.title : undefined,
      startDate: i.startDate,
      endDate: i.endDate,
      dependencies: i.dependencies.map((d) => byId.get(d)?.title ?? "").filter((t) => t !== ""),
      assignee: i.assignee,
      effort: i.effort,
      notes: i.notes,
    }));
  }

  function toPlannerTasks(): PlannerTask[] {
    if (!currentProject) return [];
    return tasks
      .filter((t) => t.projectId === currentProject.id)
      .map((t) => ({
        title: t.title,
        status: t.status,
        startDate: t.startDate,
        dueDate: t.dueDate,
        developer: t.developer,
      }));
  }

  async function generatePlan(regenerate: boolean) {
    if (!currentProject) return;
    setBusy(true);
    setBusyAction(regenerate ? "Regenerating plan" : "Generating plan");
    try {
      const result = await runAiAction(
        regenerate ? "regenerate" : "generate",
        buildPlannerInput(),
        { items: toAiItems(items), tasks: toPlannerTasks() },
      );
      setSuggestion(result);
      toast.success("Plan generated — review the changes, then apply or discard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  async function runAction(key: PlannerAction) {
    if (!items.length) {
      toast.error("Generate a plan first");
      return;
    }
    setBusy(true);
    setBusyAction(QUICK_COMMANDS.find((c) => c.action === key)?.label ?? key);
    try {
      const result = await runAiAction(key, buildPlannerInput(), {
        items: toAiItems(items),
        tasks: toPlannerTasks(),
      });
      setSuggestion(result);
      toast.success("AI suggestions ready — review the changes, then apply or discard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  async function handleGenerateChanges() {
    const text = prompt.trim();
    if (!text) {
      await generatePlan(false);
      return;
    }
    setBusy(true);
    setBusyAction("Asking AI…");
    try {
      const result = await runCustom(text, buildPlannerInput(), {
        items: toAiItems(items),
        tasks: toPlannerTasks(),
      });
      setSuggestion(result);
      setPrompt("");
      toast.success("AI suggestions ready — review the changes, then apply or discard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  function handleQuick(cmd: (typeof QUICK_COMMANDS)[number]) {
    if (cmd.action) {
      runAction(cmd.action);
    } else if (cmd.label === "Regenerate plan") {
      generatePlan(true);
    } else {
      generatePlan(false);
    }
  }

  function addItem(kind: "task" | "epic" | "milestone", parentId: string | null) {
    if (!currentProject) return;
    const today = todayStr();
    saveItem({
      id: generateTimelineId(),
      projectId: currentProject.id,
      parentId,
      title: kind === "epic" ? "New Epic" : kind === "milestone" ? "New Milestone" : "New Task",
      kind,
      startDate: today,
      endDate: shiftDays(7),
      sortOrder: items.length,
      dependencies: [],
      assignee: "",
      effort: "",
      notes: "",
      createdAt: new Date().toISOString(),
    });
  }

  function autoLinkTasks(resolved: TimelineItem[]) {
    if (!currentProject) return;
    const epics = resolved.filter((i) => i.kind === "epic" && i.title);
    let linked = 0;
    tasks
      .filter((t) => t.projectId === currentProject.id && !t.timelineItemId)
      .forEach((t) => {
        const hay = `${t.title} ${t.module} ${t.field}`.toLowerCase();
        const hit = epics.find((epic) =>
          epic.title
            .toLowerCase()
            .split(/\W+/)
            .filter((tok) => tok.length >= 3)
            .some((tok) => hay.includes(tok)),
        );
        if (hit) {
          updateTask(t.id, { timelineItemId: hit.id });
          linked++;
        }
      });
    if (linked > 0)
      toast.success(`Linked ${linked} Scrum task${linked === 1 ? "" : "s"} to Gantt epics`);
  }

  const diff = useMemo<DiffEntry[]>(() => {
    if (!suggestion) return [];
    const existingByTitle = new Map(items.map((i) => [i.title, i]));
    const sugTitles = new Set(suggestion.items.map((i) => i.title));
    const out: DiffEntry[] = [];
    const entry = (
      status: DiffEntry["status"],
      title: string,
      detail: string,
      category: DiffCategory,
    ): DiffEntry => ({ status, title, detail, category });

    suggestion.items.forEach((s) => {
      const ex = existingByTitle.get(s.title);
      if (!ex) {
        out.push(entry("add", s.title, `${s.kind} · ${s.startDate} → ${s.endDate}`, "task"));
        return;
      }
      const exParent = ex.parentId ? (items.find((i) => i.id === ex.parentId)?.title ?? "") : "";
      let changed = false;
      let category: DiffCategory = "timeline";
      let detail = "";
      if (s.notes && s.notes.includes("[CRITICAL]") && !ex.notes.includes("[CRITICAL]")) {
        category = "risk";
        detail = "flagged on the critical path";
        changed = true;
      } else if (s.assignee && s.assignee !== ex.assignee) {
        category = "resource";
        detail = `assignee → ${s.assignee}`;
        changed = true;
      } else if ((s.parent ?? "") !== exParent) {
        category = "dependency";
        detail = `moved under ${s.parent || "root"}`;
        changed = true;
      } else if (s.startDate !== ex.startDate || s.endDate !== ex.endDate) {
        category = "timeline";
        detail = `${ex.startDate} → ${s.startDate} · ${ex.endDate} → ${s.endDate}`;
        changed = true;
      }
      if (changed) out.push(entry("change", s.title, detail, category));
    });

    items.forEach((ex) => {
      if (!sugTitles.has(ex.title)) {
        out.push(entry("remove", ex.title, "dropped from plan", "task"));
      }
    });
    return out;
  }, [suggestion, items]);

  const catCounts = useMemo(() => {
    const counts: Record<DiffCategory, number> = {
      timeline: 0,
      dependency: 0,
      task: 0,
      resource: 0,
      risk: 0,
    };
    diff.forEach((d) => {
      counts[d.category]++;
    });
    return counts;
  }, [diff]);

  function exportMarkdown() {
    const lines = [
      `# ${currentProject?.name ?? "Project"} — Timeline`,
      "",
      `Generated ${new Date().toLocaleString()}`,
      "",
    ];
    items.forEach((i) => {
      const indent = i.parentId ? "  " : "";
      lines.push(
        `${indent}- [${i.kind}] ${i.title} (${i.startDate} → ${i.endDate})${
          i.assignee ? ` — ${i.assignee}` : ""
        }${i.effort ? ` (${i.effort})` : ""}`,
      );
    });
    download(
      `${(currentProject?.name ?? "project").replace(/\s+/g, "_")}_timeline.md`,
      lines.join("\n"),
      "text/markdown",
    );
  }

  function exportCsv() {
    const rows = [
      ["kind", "title", "parent", "start", "end", "dependencies", "assignee", "effort", "notes"],
      ...items.map((i) => {
        const parent = items.find((p) => p.id === i.parentId)?.title ?? "";
        const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
        return [
          i.kind,
          esc(i.title),
          esc(parent),
          i.startDate,
          i.endDate,
          esc(i.dependencies.join(" | ")),
          esc(i.assignee),
          esc(i.effort),
          esc(i.notes),
        ].join(",");
      }),
    ];
    download(
      `${(currentProject?.name ?? "project").replace(/\s+/g, "_")}_timeline.csv`,
      rows.join("\n"),
      "text/csv",
    );
  }

  return (
    <div className="flex min-w-0 min-h-0 flex-1 flex-col">
      <PageHeader
        crumbs={[{ label: "Tracker" }, { label: "Project Timeline" }]}
        status={{ label: "AI Planner", tone: "info" }}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAi(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="size-3.5" /> AI Generate
            </button>
            <button
              onClick={exportMarkdown}
              disabled={!items.length}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <FileDown className="size-3.5" /> MD
            </button>
            <button
              onClick={exportCsv}
              disabled={!items.length}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <FileDown className="size-3.5" /> CSV
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Total Tasks"
            value={String(analytics?.total ?? 0)}
            hint="in current project"
          />
          <Stat
            label="Overall Progress"
            value={`${analytics?.overallProgress ?? 0}%`}
            hint={`${analytics?.done ?? 0}/${analytics?.total ?? 0} done`}
            tone={
              analytics && analytics.total > 0 && analytics.overallProgress >= 100
                ? "success"
                : undefined
            }
          >
            <Bar value={analytics?.overallProgress ?? 0} />
          </Stat>
          <Stat label="Timeline" value={health?.spanLabel ?? "—"} hint="planned span" />
          <Stat
            label="At Risk"
            value={String(atRisk)}
            hint="overdue tasks"
            tone={atRisk > 0 ? "danger" : undefined}
          />
        </div>

        <div
          className={`grid grid-cols-1 items-start gap-5 ${suggestion ? "xl:grid-cols-[1fr_380px]" : ""}`}
        >
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                Gantt / Timeline
              </h2>
              <span className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                <CalendarRange className="size-3" />
                Drag bars · resize edges · double-click to rename
              </span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center rounded-lg border border-border bg-surface-2/60 py-16 text-xs text-muted-foreground">
                Loading timeline…
              </div>
            ) : (
              <Gantt items={items} onSave={saveItem} onDelete={deleteItem} onAdd={addItem} />
            )}
          </section>

          {suggestion && (
            <section className="rounded-lg border border-primary/40 bg-primary/5">
              <div className="flex items-center justify-between gap-3 border-b border-primary/20 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="size-4 shrink-0 text-primary" /> AI Plan Review
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => applySuggestion(autoLinkTasks)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Check className="size-3.5" /> Apply
                  </button>
                  <button
                    onClick={discardSuggestion}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" /> Discard
                  </button>
                </div>
              </div>

              <div className="px-4 py-3">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {diff.length}
                </div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  suggested changes
                </div>
              </div>
              <div className="px-4 pb-3 text-xs text-foreground/90">{suggestion.summary}</div>

              <div className="space-y-1.5 border-t border-primary/10 px-4 py-3">
                {CATEGORY_META.map((c) => {
                  const Icon = c.icon;
                  const n = catCounts[c.key];
                  return (
                    <div key={c.key} className="flex items-center gap-2 text-xs">
                      <Icon className={`size-3.5 shrink-0 ${c.iconClass}`} />
                      <span className="flex-1 text-foreground/80">{c.label}</span>
                      <span
                        className={
                          "rounded px-1.5 py-0.5 font-mono text-[10px] " +
                          (n > 0 ? "bg-popover text-foreground" : "text-muted-foreground")
                        }
                      >
                        {n}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-primary/10 px-4 py-3">
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <RefreshCw className="size-3.5" />
                  {showDetails ? "Hide" : "Review"} Changes
                </button>
                {showDetails && (
                  <div className="mt-3 max-h-72 overflow-y-auto">
                    {diff.map((d) => (
                      <div
                        key={d.title}
                        className="flex items-center gap-2 border-b border-border/40 py-1.5 text-xs"
                      >
                        <span
                          className={
                            "w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[9px] font-mono uppercase " +
                            (d.status === "add"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : d.status === "remove"
                                ? "bg-destructive/15 text-destructive"
                                : "bg-amber-500/15 text-amber-300")
                          }
                        >
                          {d.status}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {d.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {showAi && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setShowAi(false)}
        >
          <div
            className="w-full max-w-xl bg-card border border-border rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Sparkles className="size-4 text-primary" /> AI Planning Assistant
              </div>
              <button
                onClick={() => setShowAi(false)}
                className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder='Ask AI about this project… e.g. "Move testing earlier and keep deployment before January"'
                className="w-full rounded-md border border-border bg-popover px-3 py-2 text-xs text-foreground outline-none focus:border-primary/60"
              />

              <div className="flex flex-wrap gap-2">
                {QUICK_COMMANDS.map((cmd) => (
                  <button
                    key={cmd.label}
                    onClick={() => handleQuick(cmd)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-40"
                  >
                    {busy && busyAction === cmd.label ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Zap className="size-3" />
                    )}
                    {cmd.label}
                  </button>
                ))}
              </div>

              <details className="rounded-md border border-border">
                <summary className="cursor-pointer select-none px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Project brief &amp; settings
                </summary>
                <div className="space-y-3 border-t border-border p-3">
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    rows={3}
                    placeholder="Describe the project scope, goals, constraints…"
                    className="w-full rounded-md border border-border bg-popover px-3 py-2 text-xs text-foreground outline-none focus:border-primary/60"
                  />
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <Flag className="size-3" /> Deadline
                      <input
                        type="date"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        className="rounded border border-border bg-popover px-1.5 py-1 text-xs text-foreground"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <Users className="size-3" /> Team size
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={teamSize}
                        onChange={(e) => setTeamSize(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 rounded border border-border bg-popover px-1.5 py-1 text-xs text-foreground"
                      />
                    </label>
                  </div>
                </div>
              </details>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={() => setShowAi(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateChanges}
                disabled={busy || !currentProject}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy && busyAction === "Asking AI…" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {prompt.trim() ? "Generate Changes" : "Generate Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
