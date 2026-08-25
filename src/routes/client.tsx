import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useProject, type Task } from "@/lib/project-context";
import {
  CheckCircle2,
  Circle,
  Loader2,
  FlaskConical,
  Clock,
  User,
  Calendar,
  Flag,
  FileCheck,
} from "lucide-react";

export const Route = createFileRoute("/client")({
  head: () => ({
    meta: [
      { title: "Client Portal · Project Management" },
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

function ProgressRing({
  pct,
  size = 80,
  strokeWidth = 5,
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
        className="fill-primary font-bold"
        fontSize={size * 0.22}
      >
        {pct}%
      </text>
    </svg>
  );
}

function ProjectView({ project }: { project: any }) {
  const { tasks, getAnalytics } = useProject();
  const a = getAnalytics(project.id);
  const projectTasks = tasks.filter((t) => t.projectId === project.id);

  const activeTasks = [...projectTasks]
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
    .slice(0, 8);

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-xl bg-primary/10 border border-primary/20 grid place-items-center text-primary font-bold text-lg">
            {project.prefix}
          </div>
          <div>
            <h2 className="text-lg font-bold">{project.name}</h2>
            <p className="text-[10px] font-mono text-muted-foreground">
              {a.total} tasks · {a.done} done
            </p>
          </div>
        </div>
        <ProgressRing pct={a.overallProgress} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Done", value: a.done, color: "text-success" },
          { label: "Testing", value: a.qa, color: "text-info" },
          { label: "In Progress", value: a.doing, color: "text-warning" },
          { label: "Pending", value: a.pending, color: "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="text-center p-3 bg-surface-2 rounded-lg">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active Tasks */}
      {activeTasks.length > 0 && (
        <div>
          <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">
            Active Tasks
          </h3>
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {activeTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
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
                  <span>{t.priority}</span>
                </div>
                {t.dueDate && (
                  <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                    <Calendar className="size-3" />
                    <span>{new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </div>
                )}
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    t.status === "doing" ? "bg-warning/10 text-warning" : t.status === "qa" ? "bg-info/10 text-info" : "bg-muted/10 text-muted-foreground"
                  }`}
                >
                  {t.status === "doing" ? "In Progress" : t.status === "qa" ? "Testing" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {a.total === 0 && (
        <div className="text-center py-8">
          <FileCheck className="size-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        </div>
      )}
    </div>
  );
}

function AllProjectsView() {
  const { projects, tasks, getAnalytics } = useProject();

  if (projects.length === 0) {
    return (
      <div className="text-center py-12">
        <FileCheck className="size-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {projects.map((p) => {
        const a = getAnalytics(p.id);
        return (
          <div key={p.id} className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 grid place-items-center text-primary font-bold">
                  {p.prefix}
                </div>
                <div>
                  <h3 className="text-sm font-bold">{p.name}</h3>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {a.total} tasks · {a.done} done
                  </p>
                </div>
              </div>
              <ProgressRing pct={a.overallProgress} size={60} strokeWidth={4} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClientPage() {
  const { projects, currentProject } = useProject();

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
      />
      <div className="flex-1 overflow-y-auto p-6">
        {currentProject ? <ProjectView project={currentProject} /> : <AllProjectsView />}
      </div>
    </>
  );
}
