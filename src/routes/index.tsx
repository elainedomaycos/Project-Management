import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useProject } from "@/lib/project-context";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ListChecks,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Users,
  FileCheck,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Task Tracker" },
      { name: "description", content: "Project overview and task analytics." },
    ],
  }),
  component: Dashboard,
});

const STATUS_COLORS = { pending: "#888", doing: "#eab308", qa: "#3b82f6", done: "#22c55e" };
const STATUS_LABELS = { pending: "Pending", doing: "Doing", qa: "QA", done: "Done" };

function Dashboard() {
  const navigate = useNavigate();
  const { projects, tasks, currentProject, getAnalytics } = useProject();

  const viewTasks = currentProject ? tasks.filter((t) => t.projectId === currentProject.id) : tasks;
  const totalTasks = viewTasks.length;
  const totalDone = viewTasks.filter((t) => t.status === "done").length;
  const overdue = viewTasks.filter(
    (t) => t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) && t.status !== "done",
  ).length;

  const statusData = ["pending", "doing", "qa", "done"].map((s) => ({
    name: STATUS_LABELS[s as keyof typeof STATUS_LABELS],
    value: viewTasks.filter((t) => t.status === s).length,
    color: STATUS_COLORS[s as keyof typeof STATUS_COLORS],
  }));

  const devMap = new Map<string, { done: number; total: number }>();
  viewTasks.forEach((t) => {
    if (!t.developer) return;
    const e = devMap.get(t.developer) ?? { done: 0, total: 0 };
    e.total++;
    if (t.status === "done") e.done++;
    devMap.set(t.developer, e);
  });
  const devData = Array.from(devMap.entries()).map(([name, d]) => ({
    name,
    done: d.done,
    pending: d.total - d.done,
  }));

  const recentTasks = [...viewTasks]
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      const dateA = a.startDate || a.dueDate || "";
      const dateB = b.startDate || b.dueDate || "";
      return dateB.localeCompare(dateA);
    })
    .slice(0, 5);

  const displayProjects = currentProject
    ? projects.filter((p) => p.id === currentProject.id)
    : projects;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Task Tracker" }, { label: currentProject?.name ?? "Dashboard" }]}
        status={{
          label: `${totalTasks} tasks · ${overdue} overdue`,
          tone: overdue > 0 ? "warn" : "info",
        }}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-card border border-border rounded-md">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-md bg-surface-2 grid place-items-center text-primary">
                <ListChecks className="size-4" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  All Tasks
                </div>
                <div className="text-xl font-bold">{totalTasks}</div>
              </div>
            </div>
          </div>
          <div className="p-4 bg-card border border-border rounded-md">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-md bg-surface-2 grid place-items-center text-success">
                <CheckCircle2 className="size-4" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase">Done</div>
                <div className="text-xl font-bold text-success">{totalDone}</div>
              </div>
            </div>
          </div>
          <div className="p-4 bg-card border border-border rounded-md">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-md bg-surface-2 grid place-items-center text-warning">
                <Clock className="size-4" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  In Progress
                </div>
                <div className="text-xl font-bold text-warning">
                  {tasks.filter((t) => t.status === "doing").length}
                </div>
              </div>
            </div>
          </div>
          <div className="p-4 bg-card border border-border rounded-md">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-md bg-surface-2 grid place-items-center text-destructive">
                <AlertTriangle className="size-4" />
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase">Overdue</div>
                <div className="text-xl font-bold text-destructive">
                  {overdue > 0 ? overdue : 0}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Donut Chart - Status Breakdown */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
              Task Status
            </h2>
            {totalTasks === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet.</p>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#1a1a2e",
                        border: "1px solid #2a2a4e",
                        borderRadius: "6px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {statusData.map((s) => (
                    <div key={s.name} className="flex items-center gap-2 text-xs">
                      <div className="size-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="text-muted-foreground w-14">{s.name}</span>
                      <span className="font-mono font-bold">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bar Chart - Developer Progress */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
              Developer Progress
            </h2>
            {devData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No developer data yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={devData} barGap={2} barCategoryGap="20%">
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#888" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#1a1a2e",
                      border: "1px solid #2a2a4e",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="done"
                    name="Done"
                    stackId="a"
                    fill="#22c55e"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="pending"
                    name="Pending"
                    stackId="a"
                    fill="#333"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Project Cards */}
        <div>
          <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
            Projects
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayProjects.map((p) => {
              const a = getAnalytics(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => navigate({ to: "/tasks" })}
                  className="bg-card border border-border rounded-lg p-5 hover:border-primary/50 cursor-pointer transition-all hover:shadow-md"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold">{p.name}</h3>
                    <span className="text-[10px] font-mono text-muted-foreground">{p.prefix}</span>
                  </div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-mono font-bold">{a.overallProgress}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${a.overallProgress}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold">{a.total}</div>
                      <div className="text-[9px] font-mono text-muted-foreground">Tasks</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-success">{a.done}</div>
                      <div className="text-[9px] font-mono text-muted-foreground">Done</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-info">{a.qa}</div>
                      <div className="text-[9px] font-mono text-muted-foreground">QA</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-warning">{a.doing}</div>
                      <div className="text-[9px] font-mono text-muted-foreground">Doing</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                Active Tasks
              </h2>
              <button
                onClick={() => navigate({ to: "/tasks" })}
                className="text-[10px] font-mono text-primary hover:underline flex items-center gap-1"
              >
                View all <ArrowRight className="size-3" />
              </button>
            </div>
            <div className="space-y-2">
              {recentTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No active tasks. Create your first task!
                </p>
              ) : (
                recentTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 p-3 bg-surface-2 border border-border rounded text-sm"
                  >
                    <div className="size-6 rounded-full bg-surface-2 border border-border grid place-items-center text-[9px] font-bold shrink-0">
                      {t.developer?.slice(0, 2).toUpperCase() || "—"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{t.title}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{t.taskId}</div>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        t.status === "doing"
                          ? "bg-warning/10 text-warning"
                          : t.status === "qa"
                            ? "bg-info/10 text-info"
                            : "bg-muted/10 text-muted-foreground"
                      }`}
                    >
                      {t.status === "doing" ? "Doing" : t.status === "qa" ? "QA" : "Pending"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
              Developer Workload
            </h2>
            <div className="space-y-4">
              {devData.length > 0 ? (
                (() => {
                  const devWorkload = new Map<string, { done: number; total: number }>();
                  viewTasks.forEach((t) => {
                    if (!t.developer) return;
                    const e = devWorkload.get(t.developer) ?? { done: 0, total: 0 };
                    e.total++;
                    if (t.status === "done") e.done++;
                    devWorkload.set(t.developer, e);
                  });
                  return Array.from(devWorkload.entries())
                    .map(([name, d]) => ({
                      name,
                      done: d.done,
                      total: d.total,
                      pct: d.total > 0 ? Math.round((d.done / d.total) * 100) : 0,
                    }))
                    .sort((a, b) => b.pct - a.pct)
                    .map((d) => (
                      <div key={d.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{d.name}</span>
                          <span
                            className={`text-[10px] font-mono ${d.pct >= 80 ? "text-success" : d.pct >= 50 ? "text-warning" : "text-destructive"}`}
                          >
                            {d.pct}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${d.pct >= 80 ? "bg-success" : d.pct >= 50 ? "bg-warning" : "bg-destructive"}`}
                            style={{ width: `${d.pct}%` }}
                          />
                        </div>
                      </div>
                    ));
                })()
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No developer data yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
