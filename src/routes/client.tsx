import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useProject, type Task } from "@/lib/project-context";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileCheck,
  Circle,
  Loader2,
  FlaskConical,
  ScrollText,
  Calendar,
  User,
  Flag,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/client")({
  head: () => ({
    meta: [
      { title: "Client Portal · Project Management" },
      { name: "description", content: "Client project progress view." },
    ],
  }),
  component: ClientPage,
});

const STATUS_COLORS = {
  pending: "#6b7280",
  doing: "#eab308",
  qa: "#3b82f6",
  done: "#22c55e",
};

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
  size = 180,
  strokeWidth = 10,
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
      <defs>
        <linearGradient id="clientProgressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--color-primary)" />
        </linearGradient>
      </defs>
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
        stroke="url(#clientProgressGrad)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="46%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-foreground"
        fontSize={size * 0.2}
        fontWeight="800"
      >
        {pct}%
      </text>
      <text
        x="50%"
        y="64%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize={size * 0.06}
        fontFamily="var(--font-mono)"
      >
        COMPLETE
      </text>
    </svg>
  );
}

function ClientPage() {
  const { projects, tasks, currentProject, getAnalytics } = useProject();

  const viewTasks = currentProject ? tasks.filter((t) => t.projectId === currentProject.id) : tasks;

  const totalStats = viewTasks.reduce(
    (acc, t) => ({
      total: acc.total + 1,
      done: acc.done + (t.status === "done" ? 1 : 0),
      doing: acc.doing + (t.status === "doing" ? 1 : 0),
      qa: acc.qa + (t.status === "qa" ? 1 : 0),
      pending: acc.pending + (t.status === "pending" ? 1 : 0),
    }),
    { total: 0, done: 0, doing: 0, qa: 0, pending: 0 },
  );

  const overallProgress = totalStats.total > 0 ? Math.round((totalStats.done / totalStats.total) * 100) : 0;
  const overdue = viewTasks.filter(
    (t) => t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) && t.status !== "done",
  ).length;

  const activeTasks = [...viewTasks]
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
    .slice(0, 10);

  const devMap = new Map<string, { done: number; total: number }>();
  viewTasks.forEach((t) => {
    if (!t.developer) return;
    const e = devMap.get(t.developer) ?? { done: 0, total: 0 };
    e.total++;
    if (t.status === "done") e.done++;
    devMap.set(t.developer, e);
  });
  const devWorkload = Array.from(devMap.entries())
    .map(([name, d]) => ({
      name,
      done: d.done,
      pending: d.total - d.done,
      pct: d.total > 0 ? Math.round((d.done / d.total) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  const statusData = ["pending", "doing", "qa", "done"].map((s) => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: viewTasks.filter((t) => t.status === s).length,
    color: STATUS_COLORS[s as keyof typeof STATUS_COLORS],
  }));

  if (projects.length === 0) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Project Management" }, { label: "Client Portal" }]} />
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
        crumbs={[
          { label: "Project Management" },
          { label: currentProject?.name ?? "Client Portal" },
        ]}
        status={{
          label: `${totalStats.total} tasks · ${overdue} overdue`,
          tone: overdue > 0 ? "warn" : "info",
        }}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Hero: Progress Ring + KPIs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
            <ProgressRing pct={overallProgress} />
            <p className="text-[10px] font-mono text-muted-foreground mt-4 uppercase tracking-widest">
              {currentProject ? currentProject.name : "Overall Progress"}
            </p>
          </div>

          <div className="lg:col-span-2 grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-primary/30 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="flex items-center gap-3 relative">
                <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 grid place-items-center text-primary">
                  <ScrollText className="size-5" />
                </div>
                <div>
                  <div className="text-3xl font-extrabold tracking-tight">{totalStats.total}</div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Total Tasks</div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-success/30 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="flex items-center gap-3 relative">
                <div className="size-10 rounded-xl bg-success/10 border border-success/20 grid place-items-center text-success">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <div className="text-3xl font-extrabold tracking-tight text-success">{totalStats.done}</div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Completed</div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-warning/30 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-warning/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="flex items-center gap-3 relative">
                <div className="size-10 rounded-xl bg-warning/10 border border-warning/20 grid place-items-center text-warning">
                  <Loader2 className="size-5" />
                </div>
                <div>
                  <div className="text-3xl font-extrabold tracking-tight text-warning">{totalStats.doing}</div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">In Progress</div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-destructive/30 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="flex items-center gap-3 relative">
                <div className="size-10 rounded-xl bg-destructive/10 border border-destructive/20 grid place-items-center text-destructive">
                  <AlertTriangle className="size-5" />
                </div>
                <div>
                  <div className="text-3xl font-extrabold tracking-tight text-destructive">{overdue}</div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Overdue</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Donut */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-5">
              Task Status
            </h2>
            {totalStats.total === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No tasks yet.</p>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "10px",
                        fontSize: "12px",
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {statusData.map((s) => (
                    <div key={s.name} className="flex items-center gap-2.5 text-xs">
                      <div className="size-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="text-muted-foreground w-16">{s.name}</span>
                      <span className="font-mono font-bold">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Developer Workload */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-5">
              Developer Workload
            </h2>
            {devWorkload.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No developer data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={devWorkload} barGap={2} barCategoryGap="25%">
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "10px",
                      fontSize: "12px",
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                  <Bar
                    dataKey="done"
                    name="Done"
                    stackId="a"
                    fill="var(--color-success)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="pending"
                    name="Remaining"
                    stackId="a"
                    fill="rgba(255,255,255,0.08)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Active Tasks */}
        {activeTasks.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-5 flex items-center gap-2">
              <Clock className="size-3" />
              Active Tasks
            </h2>
            <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
              {activeTasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
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

        {/* Per-Project Cards */}
        {projects.map((p) => {
          const a = getAnalytics(p.id);
          const health = getProjectHealth(a.overallProgress);
          return (
            <div key={p.id} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-xl bg-primary/10 border border-primary/20 grid place-items-center text-primary font-bold text-lg">
                    {p.prefix}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold">{p.name}</h3>
                      <span
                        className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${health.bg} ${health.color}`}
                      >
                        {health.label}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {a.total} task{a.total !== 1 ? "s" : ""} ·{" "}
                      {a.done} done · {a.doing} in progress
                    </p>
                  </div>
                </div>
                <ProgressRing pct={a.overallProgress} size={64} strokeWidth={5} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
