import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useState, useEffect, useRef } from "react";
import { useProject, type Task, type TaskStatus, type QaStatus } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  X,
  Search,
  GitBranch,
  Copy,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileCheck,
  Users,
  Puzzle,
  ArrowUpDown,
} from "lucide-react";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · Task Tracker" },
      { name: "description", content: "Project task tracker table." },
    ],
  }),
  component: TasksPage,
});

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "doing", label: "Doing" },
  { value: "qa", label: "QA" },
  { value: "done", label: "Done" },
];

const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: "bg-muted/10 text-muted-foreground",
  doing: "bg-warning/10 text-warning",
  qa: "bg-info/10 text-info",
  done: "bg-success/10 text-success",
};

const QA_OPTIONS: { value: QaStatus | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "waiting", label: "Waiting" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
];

const QA_COLOR: Record<string, string> = {
  waiting: "bg-warning/10 text-warning",
  passed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

const FIELD_OPTIONS = ["Full Stack", "Front End", "Back End", "Database", "UI/UX", "Testing"];

function TasksPage() {
  const {
    projects,
    currentProject,
    tasks: allTasks,
    getProjectTasks,
    getAnalytics,
    addTask,
    updateTask,
    removeTask,
    nextTaskId,
    developers,
  } = useProject();
  const { profile, isSuperAdmin, isDeveloper, isQa } = useAuth();
  const canEditTask = (task: Task) =>
    isSuperAdmin || (isDeveloper && task.developer === profile?.name);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [remarksDraft, setRemarksDraft] = useState("");
  const [branchDraft, setBranchDraft] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{ id: string; field: "remarks" | "branch"; value: string } | null>(
    null,
  );
  const [rowBranchDrafts, setRowBranchDrafts] = useState<Record<string, string>>({});
  const rowBranchTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterDev, setFilterDev] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterField, setFilterField] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"id" | "priority" | "status" | "dueDate" | "developer">(
    "id",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [superAdmins, setSuperAdmins] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    developer: "",
    field: "",
    endUser: "",
    module: "",
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    priority: "medium" as Task["priority"],
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("role", "super_admin");
        if (data?.length) {
          setSuperAdmins(data.map((p) => p.display_name || "").filter(Boolean));
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    setRemarksDraft(selectedTask?.remarks ?? "");
    setBranchDraft(selectedTask?.branch ?? "");
  }, [selectedTask?.id, selectedTask?.remarks, selectedTask?.branch]);

  useEffect(() => {
    const timers = rowBranchTimers.current;
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  function scheduleRowBranch(id: string, value: string) {
    setRowBranchDrafts((prev) => ({ ...prev, [id]: value }));
    const timer = rowBranchTimers.current.get(id);
    if (timer) clearTimeout(timer);
    rowBranchTimers.current.set(
      id,
      setTimeout(() => {
        rowBranchTimers.current.delete(id);
        updateTask(id, { branch: value });
      }, 400),
    );
  }

  function commitRowBranch(id: string) {
    const draft = rowBranchDrafts[id];
    const timer = rowBranchTimers.current.get(id);
    if (timer) clearTimeout(timer);
    rowBranchTimers.current.delete(id);
    setRowBranchDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (draft !== undefined) updateTask(id, { branch: draft });
  }

  function scheduleSave(id: string, field: "remarks" | "branch", value: string) {
    pendingSave.current = { id, field, value };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!pendingSave.current) return;
      const { id, field, value } = pendingSave.current;
      pendingSave.current = null;
      updateTask(id, field === "remarks" ? { remarks: value } : { branch: value });
    }, 400);
  }

  function commitDraft() {
    if (!selectedTask || !pendingSave.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const { id, field, value } = pendingSave.current;
    pendingSave.current = null;
    updateTask(id, field === "remarks" ? { remarks: value } : { branch: value });
  }

  function creatorOptions(current: string): string[] {
    const names = new Set(superAdmins);
    if (current) names.add(current);
    return [...names];
  }

  const pid = currentProject?.id ?? null;
  const currentProj = pid ? projects.find((p) => p.id === pid) : null;
  const tasks = pid ? getProjectTasks(pid) : allTasks;
  const analytics = pid
    ? getAnalytics(pid)
    : {
        total: tasks.length,
        done: tasks.filter((t) => t.status === "done").length,
        qa: tasks.filter((t) => t.status === "qa").length,
        doing: tasks.filter((t) => t.status === "doing").length,
        pending: tasks.filter((t) => t.status === "pending").length,
        overallProgress:
          tasks.length > 0
            ? Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100)
            : 0,
        devProgress: [],
        fieldProgress: [],
        qaPassed: 0,
        qaFailed: 0,
        qaWaiting: 0,
      };

  const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const STATUS_ORDER: Record<string, number> = { doing: 0, pending: 1, qa: 2, done: 3 };

  const filtered = tasks
    .filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterDev !== "all" && t.developer !== filterDev) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterField !== "all" && t.field !== filterField) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !t.taskId.toLowerCase().includes(q) &&
          !t.title.toLowerCase().includes(q) &&
          !t.developer.toLowerCase().includes(q)
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
        case "priority":
          cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
          break;
        case "status":
          cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
          break;
        case "dueDate":
          cmp = (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
          break;
        case "developer":
          cmp = (a.developer || "zzz").localeCompare(b.developer || "zzz");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const uniqueDevs = [...new Set(tasks.map((t) => t.developer).filter(Boolean))].sort();
  const uniqueFields = [...new Set(tasks.map((t) => t.field).filter(Boolean))].sort();

  function handleCreate() {
    if (!form.title.trim() || !pid) return;
    addTask({
      projectId: pid,
      title: form.title.trim(),
      description: form.description.trim(),
      developer: form.developer,
      field: form.field,
      endUser: form.endUser,
      module: form.module,
      status: "pending",
      qaStatus: "waiting",
      commit: "",
      remarks: "",
      dueDate: form.dueDate,
      startDate: form.startDate,
      completedAt: "",
      priority: form.priority,
    });
    setForm({
      title: "",
      description: "",
      developer: "",
      field: "",
      endUser: "",
      module: "",
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      priority: "medium",
    });
    setShowNewModal(false);
  }

  function copyTaskId(taskId: string) {
    navigator.clipboard.writeText(taskId).then(() => {
      setCopiedId(taskId);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  function copyBranchName(task: Task) {
    const branch =
      task.branch ||
      `feature/${task.taskId.toLowerCase()}-${task.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30)}`;
    navigator.clipboard.writeText(branch).then(() => {
      setCopiedId(`branch-${task.id}`);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Task Tracker" }, { label: currentProject?.name ?? "All Projects" }]}
        status={{ label: `${tasks.length} tasks`, tone: "info" }}
        actions={
          isSuperAdmin && pid ? (
            <button
              onClick={() => setShowNewModal(true)}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 flex items-center gap-1.5"
            >
              <Plus className="size-3.5" />
              New Task
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
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
              <option value="priority">Sort: Priority</option>
              <option value="status">Sort: Status</option>
              <option value="dueDate">Sort: Due Date</option>
              <option value="developer">Sort: Developer</option>
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
            onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "all")}
            className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
          >
            <option value="all">All Status</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
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
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
          >
            <option value="all">All Priority</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
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
          <span className="ml-auto text-[10px] font-mono text-muted-foreground">
            {filtered.length} of {tasks.length} tasks
          </span>
        </div>
        {/* Analytics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3 bg-card border border-border rounded-md text-center">
            <div className="text-lg font-bold">{analytics.total}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Total</div>
          </div>
          <div className="p-3 bg-card border border-border rounded-md text-center">
            <div className="text-lg font-bold text-success">{analytics.done}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Done</div>
          </div>
          <div className="p-3 bg-card border border-border rounded-md text-center">
            <div className="text-lg font-bold text-info">{analytics.qa}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">QA</div>
          </div>
          <div className="p-3 bg-card border border-border rounded-md text-center">
            <div className="text-lg font-bold text-warning">{analytics.doing}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Doing</div>
          </div>
          <div className="p-3 bg-card border border-border rounded-md text-center">
            <div className="text-lg font-bold">{analytics.pending}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Pending</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground font-mono text-[10px] uppercase">
              Overall Progress
            </span>
            <span className="font-bold font-mono">{analytics.overallProgress}%</span>
          </div>
          <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${analytics.overallProgress}%` }}
            />
          </div>
        </div>

        {/* Task Table */}
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-border">
                {!pid && <Th>Project</Th>}
                <Th>ID</Th>
                <Th>End User</Th>
                <Th>Module</Th>
                <Th className="min-w-[250px]">Task</Th>
                <Th className="min-w-[200px]">Description</Th>
                <Th>Developer</Th>
                <Th>Created By</Th>
                <Th>Status</Th>
                <Th>QA</Th>
                <Th>Due</Th>
                <Th>Branch</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTask(t)}
                  className="border-b border-border hover:bg-surface-2/40 transition-colors cursor-pointer"
                >
                  {!pid && (
                    <Td>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {projects.find((p) => p.id === t.projectId)?.prefix ?? t.projectId}
                      </span>
                    </Td>
                  )}
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-primary">{t.taskId}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyTaskId(t.taskId);
                        }}
                        className="p-0.5 rounded hover:bg-surface-2 text-muted-foreground"
                        title="Copy ID"
                      >
                        {copiedId === t.taskId ? (
                          <CheckCircle2 className="size-3 text-success" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {t.endUser || "—"}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {t.module || "—"}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium truncate max-w-[300px]">{t.title}</span>
                      {t.priority === "high" || t.priority === "critical" ? (
                        <AlertTriangle
                          className={`size-3 shrink-0 ${t.priority === "critical" ? "text-destructive" : "text-warning"}`}
                        />
                      ) : null}
                    </div>
                  </Td>
                  <Td>
                    <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px] block">
                      {t.description || "—"}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <div className="size-5 rounded-full bg-surface-2 border border-border grid place-items-center text-[8px] font-bold">
                        {t.developer?.slice(0, 2).toUpperCase() || "—"}
                      </div>
                      <span className="text-xs">{t.developer || "—"}</span>
                    </div>
                  </Td>
                  <Td>
                    {!canEditTask(t) ? (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {t.createdBy || "—"}
                      </span>
                    ) : (
                      <select
                        value={t.createdBy}
                        onChange={(e) => updateTask(t.id, { createdBy: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-mono text-muted-foreground px-1 py-0.5 rounded border border-transparent hover:border-border focus:border-primary bg-transparent cursor-pointer focus:outline-none focus:bg-surface-2"
                        title="Edit created by"
                      >
                        <option value="">—</option>
                        {creatorOptions(t.createdBy).map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Td>
                  <Td>
                    {!canEditTask(t) ? (
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${STATUS_COLOR[t.status]}`}
                      >
                        {STATUS_OPTIONS.find((o) => o.value === t.status)?.label}
                      </span>
                    ) : (
                      <select
                        value={t.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateTask(t.id, { status: e.target.value as TaskStatus })}
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border-none cursor-pointer ${STATUS_COLOR[t.status]}`}
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </Td>
                  <Td>
                    {isDeveloper ? (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${QA_COLOR[t.qaStatus] || "text-muted-foreground"}`}
                      >
                        {t.qaStatus === "waiting"
                          ? "Waiting"
                          : t.qaStatus === "passed"
                            ? "Pass"
                            : t.qaStatus === "failed"
                              ? "Fail"
                              : "—"}
                      </span>
                    ) : (
                      <select
                        value={t.qaStatus}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateTask(t.id, { qaStatus: e.target.value as QaStatus })}
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border-none cursor-pointer ${QA_COLOR[t.qaStatus] || "text-muted-foreground"}`}
                      >
                        {QA_OPTIONS.filter((o) => o.value !== "").map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </Td>
                  <Td>
                    <span
                      className={`text-[10px] font-mono ${t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) && t.status !== "done" ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {t.dueDate || "—"}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <GitBranch className="size-3 text-muted-foreground shrink-0" />
                      <input
                        value={rowBranchDrafts[t.id] ?? t.branch}
                        onChange={(e) => scheduleRowBranch(t.id, e.target.value)}
                        onBlur={() => commitRowBranch(t.id)}
                        className="w-40 px-1 py-0.5 bg-transparent border border-transparent hover:border-border focus:border-primary rounded text-[10px] font-mono text-muted-foreground focus:outline-none focus:bg-surface-2"
                        title="Edit branch name"
                        readOnly={!canEditTask(t)}
                      />
                      <button
                        onClick={() => copyBranchName(t)}
                        className="p-0.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-primary shrink-0"
                        title="Copy branch name"
                      >
                        {copiedId === `branch-${t.id}` ? (
                          <CheckCircle2 className="size-3 text-success" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={!pid ? 12 : 11}
                    className="text-center py-12 text-sm text-muted-foreground"
                  >
                    {search ||
                    filterStatus !== "all" ||
                    filterDev !== "all" ||
                    filterPriority !== "all" ||
                    filterField !== "all"
                      ? "No tasks match your filters."
                      : "No tasks yet. Create your first task!"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Task Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40"
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="text-sm font-semibold">
                New Task · {currentProj?.name ?? "All Projects"} ·{" "}
                <span className="text-primary font-mono">{nextTaskId(pid ?? "")}</span>
              </span>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-1 rounded hover:bg-surface-2 text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Title *
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Fix login redirect"
                  className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optional details"
                  className="w-full mt-1 h-20 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Developer
                  </label>
                  <select
                    value={form.developer}
                    onChange={(e) => setForm((p) => ({ ...p, developer: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">Unassigned</option>
                    {developers.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Priority
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, priority: e.target.value as Task["priority"] }))
                    }
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Field
                </label>
                <select
                  value={form.field}
                  onChange={(e) => setForm((p) => ({ ...p, field: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">—</option>
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    End User
                  </label>
                  <select
                    value={form.endUser}
                    onChange={(e) => setForm((p) => ({ ...p, endUser: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">—</option>
                    {(currentProj?.endUsers ?? []).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Module
                  </label>
                  <select
                    value={form.module}
                    onChange={(e) => setForm((p) => ({ ...p, module: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">—</option>
                    {(currentProj?.modules ?? []).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-xs font-medium rounded border border-border hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.title.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 disabled:opacity-50"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Details Modal */}
      {selectedTask && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="w-full max-w-xl bg-card border border-border rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="text-sm font-semibold flex items-center gap-2">
                <FileCheck className="size-4 text-primary" />
                Task Details
              </span>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1 rounded hover:bg-surface-2 text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold text-primary">
                  {selectedTask.taskId}
                </span>
                <div className="flex items-center gap-2">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <input
                    value={branchDraft}
                    onChange={(e) => {
                      setBranchDraft(e.target.value);
                      scheduleSave(selectedTask.id, "branch", e.target.value);
                    }}
                    onBlur={commitDraft}
                    className="w-56 px-2 py-1 bg-surface-2 border border-border rounded text-[10px] font-mono text-muted-foreground focus:outline-none focus:border-primary"
                    placeholder="feature/..."
                    readOnly={!canEditTask(selectedTask)}
                  />
                  <button
                    onClick={() => copyBranchName(selectedTask)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-2 border border-border rounded text-[10px] font-mono text-muted-foreground hover:text-foreground shrink-0"
                  >
                    {copiedId === `branch-${selectedTask.id}` ? (
                      <CheckCircle2 className="size-3 text-success" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                  Title
                </div>
                <div className="text-sm font-medium">{selectedTask.title}</div>
              </div>

              {selectedTask.description && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Description
                  </div>
                  <div className="text-sm text-muted-foreground">{selectedTask.description}</div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Developer
                  </div>
                  {isSuperAdmin ? (
                    <select
                      value={selectedTask.developer}
                      onChange={(e) => updateTask(selectedTask.id, { developer: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="">Unassigned</option>
                      {developers.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-full bg-surface-2 border border-border grid place-items-center text-[9px] font-bold">
                        {selectedTask.developer?.slice(0, 2).toUpperCase() || "—"}
                      </div>
                      <span className="text-sm">{selectedTask.developer || "Unassigned"}</span>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Field
                  </div>
                  {!canEditTask(selectedTask) ? (
                    <span className="text-sm">{selectedTask.field || "—"}</span>
                  ) : (
                    <select
                      value={selectedTask.field}
                      onChange={(e) => updateTask(selectedTask.id, { field: e.target.value })}
                      className="w-full px-2 py-1 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="">—</option>
                      {FIELD_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    End User
                  </div>
                  {!canEditTask(selectedTask) ? (
                    <span className="text-sm">{selectedTask.endUser || "—"}</span>
                  ) : (
                    <select
                      value={selectedTask.endUser}
                      onChange={(e) => updateTask(selectedTask.id, { endUser: e.target.value })}
                      className="w-full px-2 py-1 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="">—</option>
                      {(currentProj?.endUsers ?? []).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Module
                  </div>
                  {!canEditTask(selectedTask) ? (
                    <span className="text-sm">{selectedTask.module || "—"}</span>
                  ) : (
                    <select
                      value={selectedTask.module}
                      onChange={(e) => updateTask(selectedTask.id, { module: e.target.value })}
                      className="w-full px-2 py-1 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="">—</option>
                      {(currentProj?.modules ?? []).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Priority
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      selectedTask.priority === "critical"
                        ? "bg-destructive/10 text-destructive"
                        : selectedTask.priority === "high"
                          ? "bg-warning/10 text-warning"
                          : selectedTask.priority === "medium"
                            ? "bg-info/10 text-info"
                            : "bg-muted/10 text-muted-foreground"
                    }`}
                  >
                    {selectedTask.priority}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Created By
                  </div>
                  {!canEditTask(selectedTask) ? (
                    <span className="text-sm">{selectedTask.createdBy || "—"}</span>
                  ) : (
                    <select
                      value={selectedTask.createdBy}
                      onChange={(e) => updateTask(selectedTask.id, { createdBy: e.target.value })}
                      className="w-full px-2 py-1 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="">—</option>
                      {creatorOptions(selectedTask.createdBy).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Status
                  </div>
                  {!canEditTask(selectedTask) ? (
                    <span
                      className={`text-xs font-mono font-bold px-2 py-1 rounded ${STATUS_COLOR[selectedTask.status]}`}
                    >
                      {STATUS_OPTIONS.find((o) => o.value === selectedTask.status)?.label}
                    </span>
                  ) : (
                    <select
                      value={selectedTask.status}
                      onChange={(e) =>
                        updateTask(selectedTask.id, { status: e.target.value as TaskStatus })
                      }
                      className={`text-xs font-mono font-bold px-2 py-1 rounded border-none cursor-pointer ${STATUS_COLOR[selectedTask.status]}`}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    QA Status
                  </div>
                  <select
                    value={selectedTask.qaStatus}
                    onChange={(e) =>
                      updateTask(selectedTask.id, { qaStatus: e.target.value as QaStatus })
                    }
                    className={`text-xs font-mono font-bold px-2 py-1 rounded border-none cursor-pointer ${QA_COLOR[selectedTask.qaStatus] || "text-muted-foreground"}`}
                  >
                    {QA_OPTIONS.filter((o) => o.value !== "").map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Start Date
                  </div>
                  <input
                    type="date"
                    value={selectedTask.startDate || ""}
                    onChange={(e) => updateTask(selectedTask.id, { startDate: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    readOnly={!isSuperAdmin}
                  />
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Due Date
                  </div>
                  <input
                    type="date"
                    value={selectedTask.dueDate || ""}
                    onChange={(e) => updateTask(selectedTask.id, { dueDate: e.target.value })}
                    className={`w-full px-3 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary ${selectedTask.dueDate && selectedTask.dueDate < new Date().toISOString().slice(0, 10) && selectedTask.status !== "done" ? "text-destructive font-bold" : ""}`}
                    readOnly={!isSuperAdmin}
                  />
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Completed
                  </div>
                  <input
                    type="date"
                    value={selectedTask.completedAt || ""}
                    onChange={(e) => updateTask(selectedTask.id, { completedAt: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    readOnly={!isSuperAdmin}
                  />
                </div>
              </div>

              {selectedTask.commit && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Commit
                  </div>
                  <code className="block p-2 bg-surface-2 border border-border rounded text-xs font-mono text-muted-foreground">
                    {selectedTask.commit}
                  </code>
                </div>
              )}

              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                  Remarks
                </div>
                <input
                  value={remarksDraft}
                  onChange={(e) => {
                    setRemarksDraft(e.target.value);
                    scheduleSave(selectedTask.id, "remarks", e.target.value);
                  }}
                  onBlur={commitDraft}
                  placeholder="Add a remark..."
                  className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  readOnly={!canEditTask(selectedTask)}
                />
              </div>
            </div>
            <div className="flex justify-between px-5 py-4 border-t border-border">
              {isSuperAdmin && (
                <button
                  onClick={() => {
                    removeTask(selectedTask.id);
                    setSelectedTask(null);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded border border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  Delete Task
                </button>
              )}
              <button
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 text-xs font-medium rounded border border-border hover:bg-surface-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left text-[10px] font-mono uppercase text-muted-foreground px-3 py-3 whitespace-nowrap ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 ${className ?? ""}`}>{children}</td>;
}
