import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useProject } from "@/lib/project-context";
import { HEALTH_META } from "@/lib/health";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Shield,
  Target,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Project Management" },
      { name: "description", content: "Project overview and task analytics." },
    ],
  }),
  component: Dashboard,
});

const STATUS_COLORS = {
  pending: "#6b7280",
  doing: "#eab308",
  qa: "#3b82f6",
  done: "#22c55e",
};
const STATUS_LABELS = { pending: "Pending", doing: "In Progress", qa: "QA Review", done: "Done" };

const HEALTH_COLORS: Record<string, string> = {
  on_track: "#22c55e",
  at_risk: "#eab308",
  behind: "#ef4444",
};

function SemiGauge({ pct, size = 200 }: { pct: number; size?: number }) {
  const strokeWidth = 14;
  const r = (size - strokeWidth) / 2;
  const circumference = Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  const getColor = (p: number) => {
    if (p >= 70) return "var(--color-success)";
    if (p >= 40) return "var(--color-warning)";
    return "var(--color-destructive)";
  };

  return (
    <div className="relative" style={{ width: size, height: size / 2 + 24 }}>
      <svg width={size} height={size / 2 + 24} className="block">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={getColor(pct)} stopOpacity="0.25" />
            <stop offset="100%" stopColor={getColor(pct)} />
          </linearGradient>
        </defs>
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-white/5"
        />
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        <text
          x="50%"
          y={size / 2 - 6}
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-foreground"
          fontSize={size * 0.18}
          fontWeight="800"
        >
          {pct}%
        </text>
        <text
          x="50%"
          y={size / 2 + 14}
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={size * 0.055}
          fontFamily="var(--font-mono)"
        >
          READINESS
        </text>
      </svg>
    </div>
  );
}

function Dashboard() {
  const { projects, tasks, currentProject, getAnalytics } = useProject();

  const [deliverableStats, setDeliverableStats] = useState({
    total: 0,
    completed: 0,
  });

  useEffect(() => {
    const pid = currentProject?.id;
    if (!pid) {
      setDeliverableStats({ total: 0, completed: 0 });
      return;
    }
    let cancelled = false;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("defense_deliverables")
        .select("status")
        .eq("project_id", pid);
      if (cancelled || error || !data) return;
      setDeliverableStats({
        total: data.length,
        completed: data.filter((d: { status: string }) => d.status === "submitted").length,
      });
    })();
    return () => { cancelled = true; };
  }, [currentProject?.id]);

  const viewTasks = currentProject ? tasks.filter((t) => t.projectId === currentProject.id) : tasks;
  const totalTasks = viewTasks.length;
  const totalDone = viewTasks.filter((t) => t.status === "done").length;
  const overdue = viewTasks.filter(
    (t) => t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) && t.status !== "done",
  ).length;

  // Block Readiness: (done tasks + completed deliverables) / (all tasks + all deliverables)
  const totalUnits = totalTasks + deliverableStats.total;
  const doneUnits = totalDone + deliverableStats.completed;
  const blockReadiness = totalUnits > 0 ? Math.round((doneUnits / totalUnits) * 100) : 0;

  // Project Health distribution
  const healthCounts = projects.reduce(
    (acc, p) => {
      acc[p.healthStatus] = (acc[p.healthStatus] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const healthData = [
    { name: "On Track", value: healthCounts["on_track"] || 0, color: HEALTH_COLORS.on_track },
    { name: "At Risk", value: healthCounts["at_risk"] || 0, color: HEALTH_COLORS.at_risk },
    { name: "Behind", value: healthCounts["behind"] || 0, color: HEALTH_COLORS.behind },
  ];
  const totalProjects = projects.length;

  const statusData = ["pending", "doing", "qa", "done"].map((s) => ({
    name: STATUS_LABELS[s as keyof typeof STATUS_LABELS],
    value: viewTasks.filter((t) => t.status === s).length,
    color: STATUS_COLORS[s as keyof typeof STATUS_COLORS],
  }));

  const priorityData = ["critical", "high", "medium", "low"].map((p) => ({
    name: p.charAt(0).toUpperCase() + p.slice(1),
    value: viewTasks.filter((t) => t.priority === p).length,
    color:
      p === "critical"
        ? "#ef4444"
        : p === "high"
          ? "#f97316"
          : p === "medium"
            ? "#eab308"
            : "#6b7280",
  }));

  const devMap = new Map<string, { done: number; total: number }>();
  viewTasks.forEach((t) => {
    if (!t.developer) return;
    const e = devMap.get(t.developer) ?? { done: 0, total: 0 };
    e.total++;
    if (t.status === "done") e.done++;
    devMap.set(t.developer, e);
  });
  const devData = Array.from(devMap.entries())
    .map(([name, d]) => ({
      name,
      done: d.done,
      pending: d.total - d.done,
      pct: d.total > 0 ? Math.round((d.done / d.total) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Project Management" }, { label: currentProject?.name ?? "Dashboard" }]}
        status={{
          label: `${totalTasks} tasks · ${overdue} overdue`,
          tone: overdue > 0 ? "warn" : "info",
        }}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Row 1: Block Readiness + Project Health + KPIs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Block Readiness Gauge */}
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
            <SemiGauge pct={blockReadiness} />
            <p className="text-[10px] font-mono text-muted-foreground mt-2 uppercase tracking-widest">
              {currentProject ? `${currentProject.name}` : "All Projects"}
            </p>
            <div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-muted-foreground">
              <span>Tasks: {totalDone}/{totalTasks}</span>
              <span className="text-border">|</span>
              <span>Deliverables: {deliverableStats.completed}/{deliverableStats.total}</span>
            </div>
          </div>

          {/* Project Health Summary */}
          <div className="bg-card border border-border rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-success/5 via-transparent to-destructive/5 pointer-events-none" />
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-5 relative">
              <Shield className="inline size-3 mr-1.5 -mt-0.5" />
              Project Health
            </h2>
            {totalProjects === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 relative">No projects yet.</p>
            ) : (
              <div className="flex items-center gap-6 relative">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie
                      data={healthData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {healthData.map((entry, i) => (
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
                  {healthData.map((h) => {
                    const meta = HEALTH_META[h.name === "On Track" ? "on_track" : h.name === "At Risk" ? "at_risk" : "behind"];
                    return (
                      <div key={h.name} className="flex items-center gap-2.5 text-xs">
                        <span className={`size-2.5 rounded-full ${meta.dot}`} />
                        <span className="text-muted-foreground w-20">{h.name}</span>
                        <span className="font-mono font-bold">{h.value}</span>
                        <span className="text-[10px] text-muted-foreground/50">
                          ({totalProjects > 0 ? Math.round((h.value / totalProjects) * 100) : 0}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* KPI Column */}
          <div className="lg:col-span-2 grid grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-primary/30 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="flex items-center gap-3 relative">
                <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 grid place-items-center text-primary">
                  <ListChecks className="size-5" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold tracking-tight">{totalTasks}</div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Tasks</div>
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
                  <div className="text-2xl font-extrabold tracking-tight text-success">{totalDone}</div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Completed</div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-warning/30 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-warning/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="flex items-center gap-3 relative">
                <div className="size-10 rounded-xl bg-warning/10 border border-warning/20 grid place-items-center text-warning">
                  <Flame className="size-5" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold tracking-tight text-warning">
                    {viewTasks.filter((t) => t.status === "doing").length}
                  </div>
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
                  <div className="text-2xl font-extrabold tracking-tight text-destructive">
                    {overdue > 0 ? overdue : 0}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Overdue</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Status Donut */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-5">
              Task Status
            </h2>
            {totalTasks === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No data yet.</p>
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

          {/* Priority Breakdown */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-5">
              Priority Breakdown
            </h2>
            {totalTasks === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No data yet.</p>
            ) : (
              <div className="space-y-4">
                {priorityData.map((p) => {
                  const pct = totalTasks > 0 ? Math.round((p.value / totalTasks) * 100) : 0;
                  return (
                    <div key={p.name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="size-2 rounded-sm" style={{ background: p.color }} />
                          <span className="text-xs font-medium">{p.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {p.value} <span className="text-muted-foreground/50">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: p.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Developer Leaderboard */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-5">
              Developer Leaderboard
            </h2>
            {devData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No developer data.</p>
            ) : (
              <div className="space-y-3">
                {devData.slice(0, 5).map((d, i) => (
                  <div
                    key={d.name}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-2 transition-colors"
                  >
                    <div className="size-7 rounded-full bg-primary/10 border border-primary/20 grid place-items-center text-[9px] font-bold text-primary">
                      {d.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{d.name}</span>
                        <span
                          className={`text-[10px] font-mono font-bold ${
                            d.pct >= 80
                              ? "text-success"
                              : d.pct >= 50
                                ? "text-warning"
                                : "text-destructive"
                          }`}
                        >
                          {d.pct}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            d.pct >= 80
                              ? "bg-success"
                              : d.pct >= 50
                                ? "bg-warning"
                                : "bg-destructive"
                          }`}
                          style={{ width: `${d.pct}%` }}
                        />
                      </div>
                    </div>
                    {i === 0 && d.pct > 0 && (
                      <Flame className="size-3.5 text-warning shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
