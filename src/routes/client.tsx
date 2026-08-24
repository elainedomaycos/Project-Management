import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useProject, type Task } from "@/lib/project-context";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileCheck,
  ArrowRight,
  Circle,
  Loader2,
  FlaskConical,
  ScrollText,
  Calendar,
  User,
  Flag,
} from "lucide-react";

export const Route = createFileRoute("/client")({
  head: () => ({
    meta: [
      { title: "Client Portal · Task Tracker" },
      { name: "description", content: "Client project progress view." },
    ],
  }),
  component: ClientPage,
});

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-muted-foreground",
};

function StatusIcon({ status }: { status: Task["status"] }) {
  if (status === "done") return <CheckCircle2 className="size-4 text-success" />;
  if (status === "qa") return <FlaskConical className="size-4 text-info" />;
  if (status === "doing") return <Loader2 className="size-4 text-warning" />;
  return <Circle className="size-4 text-muted-foreground" />;
}

function getProjectHealth(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 70)
    return { label: "On Track", color: "text-success", bg: "bg-success/10 border-success/20" };
  if (pct >= 40)
    return { label: "At Risk", color: "text-warning", bg: "bg-warning/10 border-warning/20" };
  return {
    label: "Behind",
    color: "text-destructive",
    bg: "bg-destructive/10 border-destructive/20",
  };
}

function ProgressRing({
  pct,
  size = 100,
  strokeWidth = 6,
}: {
  pct: number;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-white/5"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-all duration-700"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-primary text-lg font-bold"
        fontSize={size * 0.22}
      >
        {pct}%
      </text>
    </svg>
  );
}

function ClientPage() {
  const { projects, tasks, currentProject, getAnalytics } = useProject();

  const displayProjects = currentProject
    ? projects.filter((p) => p.id === currentProject.id)
    : projects;

  const totalStats = displayProjects.reduce(
    (acc, p) => {
      const a = getAnalytics(p.id);
      return {
        total: acc.total + a.total,
        done: acc.done + a.done,
        doing: acc.doing + a.doing,
        qa: acc.qa + a.qa,
        pending: acc.pending + a.pending,
      };
    },
    { total: 0, done: 0, doing: 0, qa: 0, pending: 0 },
  );

  if (displayProjects.length === 0) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Task Tracker" }, { label: "Client Portal" }]} />
        <div className="flex-1 grid place-items-center p-6">
          <div className="text-center space-y-3">
            <div className="size-16 rounded-full bg-surface-2 border border-border grid place-items-center mx-auto text-muted-foreground">
              <FileCheck className="size-8" />
            </div>
            <p className="text-sm text-muted-foreground">No projects available yet.</p>
            <p className="text-[10px] font-mono text-muted-foreground">
              Projects will appear here once created by the project manager.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Task Tracker" }, { label: currentProject?.name ?? "Client Portal" }]}
        status={{
          label: `${displayProjects.length} project${displayProjects.length > 1 ? "s" : ""} · ${totalStats.done}/${totalStats.total} tasks done`,
          tone: "info",
        }}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Global Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            {
              label: "Total Tasks",
              value: totalStats.total,
              icon: ScrollText,
              color: "text-primary",
            },
            {
              label: "Completed",
              value: totalStats.done,
              icon: CheckCircle2,
              color: "text-success",
            },
            { label: "In Progress", value: totalStats.doing, icon: Loader2, color: "text-warning" },
            { label: "In Testing", value: totalStats.qa, icon: FlaskConical, color: "text-info" },
            {
              label: "Pending",
              value: totalStats.pending,
              icon: Circle,
              color: "text-muted-foreground",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-card border border-border rounded-lg p-4 flex items-center gap-3"
            >
              <div className="size-9 rounded-lg bg-surface-2 grid place-items-center">
                <s.icon className={`size-4 ${s.color}`} />
              </div>
              <div>
                <div className="text-lg font-bold">{s.value}</div>
                <div className="text-[9px] font-mono text-muted-foreground uppercase">
                  {s.label}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Per-Project Cards */}
        {displayProjects.map((p) => {
          const a = getAnalytics(p.id);
          const health = getProjectHealth(a.overallProgress);
          const projectTasks = tasks.filter((t) => t.projectId === p.id);
          const recentInProgress = projectTasks
            .filter((t) => t.status !== "done")
            .sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || ""))
            .slice(0, 4);

          return (
            <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Project Header */}
              <div className="px-6 py-5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-xl bg-primary/10 border border-primary/20 grid place-items-center text-primary font-bold text-lg">
                    {p.prefix}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold">{p.name}</h2>
                      <span
                        className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${health.bg} ${health.color}`}
                      >
                        {health.label}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      Created{" "}
                      {new Date(p.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {" · "}
                      {a.total} task{a.total !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <ProgressRing pct={a.overallProgress} size={72} strokeWidth={5} />
              </div>

              <div className="p-6 space-y-6">
                {/* Task Summary Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    {
                      label: "Done",
                      value: a.done,
                      total: a.total,
                      color: "text-success",
                      bg: "bg-success/5 border-success/20",
                      bar: "bg-success",
                    },
                    {
                      label: "Testing",
                      value: a.qa,
                      total: a.total,
                      color: "text-info",
                      bg: "bg-info/5 border-info/20",
                      bar: "bg-info",
                    },
                    {
                      label: "In Progress",
                      value: a.doing,
                      total: a.total,
                      color: "text-warning",
                      bg: "bg-warning/5 border-warning/20",
                      bar: "bg-warning",
                    },
                    {
                      label: "Pending",
                      value: a.pending,
                      total: a.total,
                      color: "text-muted-foreground",
                      bg: "bg-surface-2 border-border",
                      bar: "bg-muted-foreground",
                    },
                  ].map((s) => (
                    <div key={s.label} className={`rounded-lg border p-4 ${s.bg}`}>
                      <div className="flex items-baseline justify-between mb-2">
                        <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {s.total > 0 ? Math.round((s.value / s.total) * 100) : 0}%
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase">
                        {s.label}
                      </div>
                      {s.total > 0 && (
                        <div className="h-1.5 bg-white/5 rounded-full mt-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${s.bar}`}
                            style={{ width: `${(s.value / s.total) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Field Progress */}
                {a.fieldProgress.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                      <ScrollText className="size-3" />
                      Field Progress
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {a.fieldProgress.map((f) => (
                        <div
                          key={f.name}
                          className="bg-surface-2 border border-border rounded-lg p-4"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">{f.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {f.done}/{f.total} tasks
                            </span>
                          </div>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                f.pct >= 80
                                  ? "bg-success"
                                  : f.pct >= 50
                                    ? "bg-warning"
                                    : "bg-destructive"
                              }`}
                              style={{ width: `${f.pct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <span
                              className={`text-[10px] font-mono font-bold ${
                                f.pct >= 80
                                  ? "text-success"
                                  : f.pct >= 50
                                    ? "text-warning"
                                    : "text-destructive"
                              }`}
                            >
                              {f.pct}%
                            </span>
                            {f.pct >= 80 && <CheckCircle2 className="size-3 text-success" />}
                            {f.pct > 0 && f.pct < 80 && <Clock className="size-3 text-warning" />}
                            {f.pct === 0 && <Circle className="size-3 text-muted-foreground" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Tasks Preview */}
                {recentInProgress.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Clock className="size-3" />
                      Active Tasks
                    </h3>
                    <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                      {recentInProgress.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-surface-2 transition-colors"
                        >
                          <StatusIcon status={t.status} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{t.title}</div>
                            <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-2 mt-0.5">
                              <span>{t.taskId}</span>
                              {t.developer && (
                                <>
                                  <span>·</span>
                                  <User className="size-3" />
                                  <span>{t.developer}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                            <Flag className={`size-3 ${PRIORITY_COLORS[t.priority] || ""}`} />
                            <span
                              className={
                                t.priority === "critical" || t.priority === "high"
                                  ? "text-warning"
                                  : ""
                              }
                            >
                              {t.priority}
                            </span>
                          </div>
                          {t.dueDate && (
                            <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                              <Calendar className="size-3" />
                              <span>
                                {new Date(t.dueDate).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </div>
                          )}
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                              t.status === "doing"
                                ? "bg-warning/10 text-warning"
                                : t.status === "qa"
                                  ? "bg-info/10 text-info"
                                  : "bg-muted/10 text-muted-foreground"
                            }`}
                          >
                            {t.status === "doing"
                              ? "In Progress"
                              : t.status === "qa"
                                ? "Testing"
                                : "Pending"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {a.total === 0 && (
                  <div className="text-center py-6">
                    <div className="size-12 rounded-full bg-surface-2 border border-border grid place-items-center mx-auto text-muted-foreground mb-3">
                      <FileCheck className="size-6" />
                    </div>
                    <p className="text-sm text-muted-foreground">No tasks yet for this project.</p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">
                      Tasks will appear here once assigned by the project manager.
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
