import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useState } from "react";
import { useProject, type TaskStatus } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { CheckCircle2, Clock, ArrowRight, ArrowUpDown, Bug, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/developer")({
  head: () => ({
    meta: [
      { title: "Developer · Project Management" },
      { name: "description", content: "Developer workspace." },
    ],
  }),
  component: DeveloperPage,
});

function DeveloperPage() {
  const { tasks, defects, currentProject, developers, updateTask, updateDefect } = useProject();
  const { profile, isAdmin, isLeader } = useAuth();
  const [filterDev, setFilterDev] = useState("all");
  const [sortBy, setSortBy] = useState<"id-asc" | "id-desc">("id-desc");

  const projectTasks = currentProject
    ? tasks.filter((t) => t.projectId === currentProject.id)
    : tasks;
  const filtered =
    filterDev === "all" ? projectTasks : projectTasks.filter((t) => t.developer === filterDev);

  const projectDefects = currentProject
    ? defects.filter((d) => d.projectId === currentProject.id)
    : defects;
  const assignedDefects = projectDefects
    .filter((d) => d.status === "Open" || d.status === "In Progress")
    .filter((d) =>
      filterDev === "all"
        ? isAdmin || isLeader || d.assignedDeveloperId === profile?.name
        : d.assignedDeveloperId === filterDev,
    )
    .sort(
      (a, b) =>
        parseInt(a.id.split("-").pop() || "0", 10) - parseInt(b.id.split("-").pop() || "0", 10),
    );

  function parseTaskNum(id: string): number {
    const parts = id.split("-").slice(1);
    return parts.reduce((acc, p) => acc * 1000 + (parseInt(p, 10) || 0), 0);
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "id-asc") return parseTaskNum(a.taskId) - parseTaskNum(b.taskId);
    return parseTaskNum(b.taskId) - parseTaskNum(a.taskId);
  });

  const activeTasks = sorted.filter((t) => t.status !== "done");
  const doneTasks = sorted.filter((t) => t.status === "done");

  function handleStatusChange(taskId: string, status: TaskStatus) {
    updateTask(taskId, { status });
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Project Management" }, { label: "Developer" }]}
        status={{ label: `${activeTasks.length} active tasks`, tone: "info" }}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Filter Bar */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase text-muted-foreground">
            Filter by Developer
          </span>
          <select
            value={filterDev}
            onChange={(e) => setFilterDev(e.target.value)}
            className="px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
          >
            <option value="all">All Developers</option>
            {developers.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1">
            <ArrowUpDown className="size-3" />
            Sort
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
          >
            <option value="id-desc">Task No. ↓ (newest)</option>
            <option value="id-asc">Task No. ↑ (oldest)</option>
          </select>
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">
            Showing {activeTasks.length} of {projectTasks.length} tasks
          </span>
        </div>

        {/* Assigned Defects */}
        {assignedDefects.length > 0 && (
          <div>
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
              Assigned Defects
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assignedDefects.map((d) => (
                <div
                  key={d.id}
                  className="bg-card border border-border rounded-lg p-4 flex flex-col hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Bug className="size-3 text-destructive shrink-0" />
                      <span className="font-mono text-[10px] text-destructive font-bold">
                        {d.id}
                      </span>
                      {d.severity === "High" || d.severity === "Critical" ? (
                        <AlertTriangle
                          className={`size-3 shrink-0 ${d.severity === "Critical" ? "text-destructive" : "text-warning"}`}
                        />
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 text-[9px] font-mono rounded ${
                        d.severity === "Critical"
                          ? "bg-destructive/10 text-destructive"
                          : d.severity === "High"
                            ? "bg-warning/10 text-warning"
                            : d.severity === "Medium"
                              ? "bg-info/10 text-info"
                              : "bg-muted/10 text-muted-foreground"
                      }`}
                    >
                      {d.severity}
                    </span>
                  </div>

                  <h3 className="text-sm font-medium truncate">{d.title}</h3>

                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground truncate">
                    {d.module && <span className="truncate">{d.module}</span>}
                    {d.module && d.environment && <span>·</span>}
                    {d.environment && <span className="truncate">{d.environment}</span>}
                  </div>

                  <div className="mt-auto pt-3 flex items-center gap-2">
                    {d.status === "Open" ? (
                      <button
                        onClick={() => updateDefect(d.id, { status: "In Progress" })}
                        className="px-2.5 py-1 bg-primary text-primary-foreground text-[9px] font-bold rounded hover:brightness-110 flex items-center gap-1"
                      >
                        <Clock className="size-2.5" />
                        Start Fix
                      </button>
                    ) : (
                      <button
                        onClick={() => updateDefect(d.id, { status: "Fixed" })}
                        className="px-2.5 py-1 bg-success/10 text-success text-[9px] font-bold rounded hover:bg-success/20 flex items-center gap-1"
                      >
                        <CheckCircle2 className="size-2.5" />
                        Mark Fixed
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Tasks */}
        <div>
          <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
            Tasks
          </h2>
          {activeTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No tasks found.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeTasks.map((t) => (
                <div
                  key={t.id}
                  className="bg-card border border-border rounded-lg p-4 flex flex-col hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-mono text-[10px] text-primary font-bold">{t.taskId}</span>
                    <div className="shrink-0">
                      {!(isAdmin || isLeader || t.developer === profile?.name) ? (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground bg-surface-2 rounded">
                          {t.status === "pending"
                            ? "Pending"
                            : t.status === "doing"
                              ? "In Progress"
                              : t.status === "qa"
                                ? "In QA"
                                : "Done"}
                        </span>
                      ) : (
                        <>
                          {t.status === "pending" && (
                            <button
                              onClick={() => handleStatusChange(t.id, "doing")}
                              className="px-2 py-1 bg-primary text-primary-foreground text-[9px] font-bold rounded hover:brightness-110 flex items-center gap-1"
                            >
                              <Clock className="size-2.5" />
                              Start
                            </button>
                          )}
                          {t.status === "doing" && (
                            <button
                              onClick={() => handleStatusChange(t.id, "qa")}
                              className="px-2 py-1 bg-info text-white text-[9px] font-bold rounded hover:brightness-110 flex items-center gap-1"
                            >
                              <ArrowRight className="size-2.5" />
                              Move to QA
                            </button>
                          )}
                          {t.status === "qa" && (
                            <span className="px-1.5 py-0.5 text-[9px] font-mono text-info bg-info/10 rounded">
                              In QA
                            </span>
                          )}
                          {t.status === "done" && (
                            <span className="flex items-center gap-1 text-[9px] font-mono text-success">
                              <CheckCircle2 className="size-2.5" /> Done
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-medium truncate">{t.title}</h3>

                  {t.description && (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                      {t.description}
                    </p>
                  )}

                  <div className="mt-auto pt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    {t.field && <span>{t.field}</span>}
                    {t.field && t.dueDate && <span>·</span>}
                    {t.dueDate && <span>Due: {t.dueDate}</span>}
                    <span className="ml-auto truncate text-[9px]">{t.developer}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Done Tasks */}
        {doneTasks.length > 0 && (
          <div>
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
              Recently Completed
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {doneTasks.map((t) => (
                <div
                  key={t.id}
                  className="bg-card border border-border rounded-lg p-3 flex items-center gap-3"
                >
                  <CheckCircle2 className="size-3.5 text-success shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {t.taskId}
                      </span>
                      <span className="text-xs truncate text-muted-foreground">{t.title}</span>
                    </div>
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0">{t.developer}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
