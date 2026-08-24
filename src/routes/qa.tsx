import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useState } from "react";
import { useProject, type QaStatus } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { CheckCircle2, XCircle, AlertTriangle, User, Search, ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/qa")({
  head: () => ({
    meta: [
      { title: "QA Review · Task Tracker" },
      { name: "description", content: "QA review queue." },
    ],
  }),
  component: QaPage,
});

function QaPage() {
  const { tasks, updateTask, currentProject, projects } = useProject();
  const { isSuperAdmin, isQa, isDeveloper } = useAuth();
  const canReview = isSuperAdmin || isQa;
  const pid = currentProject?.id ?? null;
  const projectTasks = pid ? tasks.filter((t) => t.projectId === pid) : tasks;
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const qaTasks = projectTasks.filter((t) => t.status === "qa" || t.qaStatus === "failed");
  const allAnalytics = {
    qaPassed: projectTasks.filter((t) => t.qaStatus === "passed").length,
    qaFailed: projectTasks.filter((t) => t.qaStatus === "failed").length,
    qaWaiting: projectTasks.filter((t) => t.status === "qa").length,
  };

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"id" | "title" | "developer" | "field" | "dueDate">("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterDev, setFilterDev] = useState("all");
  const [filterField, setFilterField] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "waiting" | "rework">("all");

  const uniqueDevs = [...new Set(qaTasks.map((t) => t.developer).filter(Boolean))].sort();
  const uniqueFields = [...new Set(qaTasks.map((t) => t.field).filter(Boolean))].sort();

  const filtered = qaTasks
    .filter((t) => {
      if (filterStatus === "rework" && t.qaStatus !== "failed") return false;
      if (filterStatus === "waiting" && t.status !== "qa") return false;
      if (filterDev !== "all" && t.developer !== filterDev) return false;
      if (filterField !== "all" && t.field !== filterField) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !t.taskId.toLowerCase().includes(q) &&
          !t.title.toLowerCase().includes(q) &&
          !t.developer.toLowerCase().includes(q) &&
          !(t.description || "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "id": {
          const parseId = (id: string) => {
            const parts = id.split("-").slice(1);
            return parts.reduce((acc, p) => acc * 1000 + (parseInt(p, 10) || 0), 0);
          };
          cmp = parseId(a.taskId) - parseId(b.taskId);
          break;
        }
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "developer":
          cmp = (a.developer || "zzz").localeCompare(b.developer || "zzz");
          break;
        case "field":
          cmp = (a.field || "zzz").localeCompare(b.field || "zzz");
          break;
        case "dueDate":
          cmp = (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const hasActiveFilters =
    search.trim() !== "" || filterDev !== "all" || filterField !== "all" || filterStatus !== "all";

  function handlePass(taskId: string) {
    updateTask(taskId, {
      status: "done",
      qaStatus: "passed",
      completedAt: new Date().toISOString().slice(0, 10),
    });
  }

  function handleFail(taskId: string) {
    updateTask(taskId, { status: "doing", qaStatus: "failed" });
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Task Tracker" },
          { label: currentProject?.name ?? "QA Review · All Projects" },
        ]}
        status={{
          label: `${qaTasks.length} pending review`,
          tone: qaTasks.length > 0 ? "info" : "success",
        }}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Filter Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="size-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-44 pl-7 pr-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-1">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
            >
              <option value="id">Sort: ID</option>
              <option value="title">Sort: Title</option>
              <option value="developer">Sort: Developer</option>
              <option value="field">Sort: Field</option>
              <option value="dueDate">Sort: Due Date</option>
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="px-1.5 py-1.5 rounded-md bg-surface-2 border border-border text-xs hover:bg-surface-2/80 transition-colors"
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              <ArrowUpDown className="size-3" />
            </button>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
          >
            <option value="all">All Status</option>
            <option value="waiting">Waiting for QA</option>
            <option value="rework">Rework</option>
          </select>
          {uniqueDevs.length > 0 && (
            <select
              value={filterDev}
              onChange={(e) => setFilterDev(e.target.value)}
              className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
            >
              <option value="all">All Devs</option>
              {uniqueDevs.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          {uniqueFields.length > 0 && (
            <select
              value={filterField}
              onChange={(e) => setFilterField(e.target.value)}
              className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
            >
              <option value="all">All Fields</option>
              {uniqueFields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* QA Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-card border border-border rounded-md text-center">
            <div className="text-2xl font-bold text-success">{allAnalytics.qaPassed}</div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase">Passed</div>
          </div>
          <div className="p-4 bg-card border border-border rounded-md text-center">
            <div className="text-2xl font-bold text-destructive">{allAnalytics.qaFailed}</div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase">Failed</div>
          </div>
          <div className="p-4 bg-card border border-border rounded-md text-center">
            <div className="text-2xl font-bold text-warning">{allAnalytics.qaWaiting}</div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase">Waiting</div>
          </div>
        </div>

        {/* QA Queue */}
        <div>
          <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
            Waiting for QA
          </h2>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="size-10 text-success mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "No tasks match your filters."
                  : "All tasks are reviewed. Nothing waiting for QA."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className="bg-card border border-border rounded-lg p-4 flex flex-col"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[10px] text-primary font-bold">
                        {t.taskId}
                      </span>
                      {t.qaStatus === "failed" && (
                        <span className="flex items-center gap-1 text-[9px] font-mono text-destructive bg-destructive/10 px-1.5 py-0.5 rounded shrink-0">
                          <AlertTriangle className="size-2.5" />
                          Rework
                        </span>
                      )}
                    </div>
                  </div>

                  {!pid && (
                    <div className="text-[9px] font-mono uppercase text-muted-foreground mb-1.5">
                      {projectName(t.projectId)}
                    </div>
                  )}

                  <h3 className="text-sm font-medium truncate">{t.title}</h3>

                  {t.description && (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                      {t.description}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <User className="size-2.5" />
                      {t.developer}
                    </span>
                    {t.field && <span>· {t.field}</span>}
                    {t.dueDate && <span>· Due: {t.dueDate}</span>}
                  </div>

                  {t.remarks && (
                    <div className="mt-2 p-2 bg-surface-2 border border-border rounded text-[10px] text-muted-foreground line-clamp-2">
                      {t.remarks}
                    </div>
                  )}

                  <div className="mt-auto pt-3 flex items-center gap-2">
                    {canReview ? (
                      <>
                        {t.qaStatus !== "failed" && (
                          <button
                            onClick={() => handleFail(t.id)}
                            className="px-3 py-1.5 bg-destructive/10 text-destructive text-[9px] font-bold rounded hover:bg-destructive/20 flex items-center gap-1"
                          >
                            <XCircle className="size-2.5" />
                            Fail
                          </button>
                        )}
                        <button
                          onClick={() => handlePass(t.id)}
                          className="px-3 py-1.5 bg-success/10 text-success text-[9px] font-bold rounded hover:bg-success/20 flex items-center gap-1"
                        >
                          <CheckCircle2 className="size-2.5" />
                          Pass
                        </button>
                      </>
                    ) : (
                      <span className="text-[9px] font-mono text-muted-foreground">
                        {t.qaStatus === "waiting"
                          ? "Waiting for QA"
                          : t.qaStatus === "passed"
                            ? "Passed"
                            : t.qaStatus === "failed"
                              ? "Failed — Rework"
                              : "—"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
