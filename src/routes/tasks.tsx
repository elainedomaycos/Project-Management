import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useState, useEffect, useRef } from "react";
import {
  useProject,
  type Task,
  type TaskStatus,
  type Defect,
  type DefectStatus,
  type DefectSeverity,
  type DefectPriority,
} from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { generateTaskFromPrompt, generateDefectFromPrompt } from "@/lib/ai-assistant";
import {
  Plus,
  X,
  Search,
  GitBranch,
  Copy,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  ArrowUpDown,
  Bug,
  ClipboardList,
  ExternalLink,
  Sparkles,
  Mic,
  MicOff,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · Project Management" },
      { name: "description", content: "Project task table." },
    ],
  }),
  component: TasksPage,
});

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
];

const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: "bg-muted/10 text-muted-foreground",
  doing: "bg-warning/10 text-warning",
  qa: "bg-info/10 text-info",
  done: "bg-success/10 text-success",
};

const FIELD_OPTIONS = ["Full Stack", "Front End", "Back End", "Database", "UI/UX", "Testing"];

const DEFECT_STATUS_OPTIONS: { value: DefectStatus; label: string }[] = [
  { value: "Open", label: "Open" },
  { value: "In Progress", label: "In Progress" },
  { value: "Fixed", label: "Fixed" },
  { value: "Closed", label: "Closed" },
];

const DEFECT_STATUS_COLOR: Record<DefectStatus, string> = {
  Open: "bg-warning/10 text-warning",
  "In Progress": "bg-info/10 text-info",
  Fixed: "bg-primary/10 text-primary",
  Closed: "bg-success/10 text-success",
};

const DEFECT_SEVERITY_OPTIONS: { value: DefectSeverity; label: string }[] = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Critical", label: "Critical" },
];

const DEFECT_SEVERITY_COLOR: Record<DefectSeverity, string> = {
  Low: "bg-muted/10 text-muted-foreground",
  Medium: "bg-info/10 text-info",
  High: "bg-warning/10 text-warning",
  Critical: "bg-destructive/10 text-destructive",
};

const DEFECT_PRIORITY_OPTIONS: { value: DefectPriority; label: string }[] = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
];

type SpeechService = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechService(): SpeechService | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechService;
    webkitSpeechRecognition?: SpeechService;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function useDictation(onText: (text: string) => void) {
  const recognitionRef = useRef<InstanceType<SpeechService> | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = getSpeechService() !== undefined;

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const start = () => {
    const SR = getSpeechService();
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    const transcripts: string[] = [];
    rec.onresult = (e) => {
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcripts.push(e.results[i][0].transcript);
      }
    };
    rec.onend = () => {
      setListening(false);
      if (transcripts.length) onText(transcripts.join(" ").trim());
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error && e.error !== "aborted") setError(e.error);
    };
    recognitionRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  return { supported, listening, error, start, stop };
}

function AiPromptModal({
  title,
  subtitle,
  placeholder,
  open,
  prompt,
  onPromptChange,
  onClose,
  onSubmit,
  thinking,
  error,
}: {
  title: string;
  subtitle: string;
  placeholder?: string;
  open: boolean;
  prompt: string;
  onPromptChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  thinking: boolean;
  error: string;
}) {
  const dictation = useDictation((text) => onPromptChange(text));
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card border border-border rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {title}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-2 text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={placeholder}
              autoFocus
              rows={5}
              className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary resize-none"
            />
            {dictation.supported && (
              <button
                onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
                title={dictation.listening ? "Stop listening" : "Speak instead of typing"}
                className={`absolute right-2 bottom-2 p-1.5 rounded-full border transition-colors ${
                  dictation.listening
                    ? "bg-destructive/20 text-destructive border-destructive/40 animate-pulse"
                    : "bg-surface-2 border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {dictation.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </button>
            )}
          </div>
          {dictation.listening && (
            <p className="text-[10px] font-mono text-warning">
              Listening… speak now (the transcript will replace the prompt).
            </p>
          )}
          {dictation.error && (
            <p className="text-[10px] font-mono text-destructive">Mic: {dictation.error}</p>
          )}
          {error && <p className="text-[10px] font-mono text-destructive">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          {dictation.listening && (
            <button
              onClick={dictation.stop}
              className="px-4 py-2 text-xs font-medium rounded border border-warning/40 text-warning hover:bg-warning/10"
            >
              Stop
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded border border-border hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!prompt.trim() || thinking}
            className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5"
          >
            {thinking && <Loader2 className="size-3.5 animate-spin" />}
            {thinking ? "Generating…" : "Generate Draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureTasksPage() {
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
  const { profile, isAdmin, isLeader } = useAuth();
  const role = profile?.role;
  const canEditTask = (task: Task) =>
    isAdmin || isLeader || (role === "developer" && task.developer === profile?.name);
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
  const [admins, setadmins] = useState<string[]>([]);
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
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("profiles").select("display_name").eq("role", "admin");
        if (data?.length) {
          setadmins(data.map((p) => p.display_name || "").filter(Boolean));
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
    const names = new Set(admins);
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

  async function handleAiGenerate() {
    if (!aiPrompt.trim() || !pid || !currentProj) return;
    setAiThinking(true);
    setAiError("");
    try {
      const result = await generateTaskFromPrompt({
        data: {
          prompt: aiPrompt.trim(),
          projectName: currentProj.name,
          modules: currentProj.modules ?? [],
          fields: FIELD_OPTIONS,
        },
      });
      setForm((p) => ({
        ...p,
        title: result.title,
        description: result.description,
        module: result.module,
        field: result.field,
        priority: result.priority,
      }));
      setAiOpen(false);
      setShowNewModal(true);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiThinking(false);
    }
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
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[10px] font-mono text-muted-foreground">
              {filtered.length} of {tasks.length} tasks
            </span>
            {(isAdmin || isLeader) && pid && (
              <>
                <button
                  onClick={() => setAiOpen(true)}
                  className="px-3 py-1.5 text-primary border border-primary/30 text-xs font-bold rounded hover:bg-primary/10 flex items-center gap-1.5"
                  title="AI Quick Add — describe a feature task in plain English"
                >
                  <Sparkles className="size-3.5" />
                  AI Quick Add
                </button>
                <button
                  onClick={() => setShowNewModal(true)}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 flex items-center gap-1.5"
                >
                  <Plus className="size-3.5" />
                  New Task
                </button>
              </>
            )}
          </div>
        </div>
        {/* Analytics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-card border border-border rounded-md text-center">
            <div className="text-lg font-bold">{analytics.total}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Total</div>
          </div>
          <div className="p-3 bg-card border border-border rounded-md text-center">
            <div className="text-lg font-bold text-success">{analytics.done}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Done</div>
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
                    colSpan={!pid ? 11 : 10}
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
            {(() => {
              const slug = form.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 30);
              return slug ? (
                <div className="px-5 py-2.5 border-b border-border flex items-center gap-2">
                  <GitBranch className="size-3 text-muted-foreground shrink-0" />
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Auto branch: feature/{nextTaskId(pid ?? "").toLowerCase()}-{slug}
                  </span>
                </div>
              ) : null;
            })()}
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
                  {isAdmin || isLeader ? (
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
                    readOnly={!(isAdmin || isLeader)}
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
                    readOnly={!(isAdmin || isLeader)}
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
                    readOnly={!(isAdmin || isLeader)}
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
              {(isAdmin || isLeader) && (
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

      <AiPromptModal
        title="AI Quick Add"
        subtitle="Describe the feature task in plain English (type or speak). The AI pre-fills the New Task modal — including the auto-generated branch name — for you to review before saving. Nothing is written until you click Create Task."
        placeholder="e.g. Add a forgot-password page that emails users an OTP reset link"
        open={aiOpen}
        prompt={aiPrompt}
        onPromptChange={setAiPrompt}
        onClose={() => setAiOpen(false)}
        onSubmit={handleAiGenerate}
        thinking={aiThinking}
        error={aiError}
      />
    </>
  );
}

function TasksPage() {
  const [tab, setTab] = useState<"features" | "defects">("features");
  const { tasks, defects, currentProject } = useProject();
  const pid = currentProject?.id ?? null;
  const taskCount = pid ? tasks.filter((t) => t.projectId === pid).length : tasks.length;
  const defectCount = pid ? defects.filter((d) => d.projectId === pid).length : defects.length;
  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Project Management" },
          { label: currentProject?.name ?? "All Projects" },
        ]}
        status={{
          label: tab === "features" ? `${taskCount} tasks` : `${defectCount} defects`,
          tone: "info",
        }}
      />
      <div className="flex items-center gap-2 px-6 pt-3 pb-3 border-b border-border">
        <TabButton active={tab === "features"} onClick={() => setTab("features")}>
          <ClipboardList className="size-3.5" />
          Feature Tasks
        </TabButton>
        <TabButton active={tab === "defects"} onClick={() => setTab("defects")}>
          <Bug className="size-3.5" />
          Defects Log
        </TabButton>
      </div>
      {tab === "features" ? <FeatureTasksPage /> : <DefectsPage />}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
        active
          ? "bg-primary/10 text-primary border-primary/30"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function DefectsPage() {
  const {
    projects,
    currentProject,
    defects,
    developers,
    addDefect,
    updateDefect,
    deleteDefect,
    nextDefectId,
    getProjectTasks,
    tasks: allFeatureTasks,
  } = useProject();
  const { profile, isAdmin, isLeader } = useAuth();
  const role = profile?.role;
  const canManageDefect = isAdmin || isLeader;
  const canEditDefect = (d: Defect) =>
    isAdmin || isLeader || (role === "developer" && d.assignedDeveloperId === profile?.name);

  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<DefectStatus | "all">("all");
  const [filterSeverity, setFilterSeverity] = useState<DefectSeverity | "all">("all");
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterDev, setFilterDev] = useState<string>("all");
  const [form, setForm] = useState({
    title: "",
    module: "",
    environment: "",
    precondition: "",
    stepsToReproduce: "",
    expectedResult: "",
    actualResult: "",
    severity: "Medium" as DefectSeverity,
    priority: "Medium" as DefectPriority,
    assignedDeveloperId: "",
    relatedTaskId: "",
    evidenceUrl: "",
  });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiRelatedTaskIds, setAiRelatedTaskIds] = useState<string[]>([]);

  const pid = currentProject?.id ?? null;
  const currentProj = pid ? projects.find((p) => p.id === pid) : null;
  const projectDefects = pid ? defects.filter((d) => d.projectId === pid) : defects;
  const projectTasks = pid ? getProjectTasks(pid) : allFeatureTasks;

  const moduleOptions = pid
    ? [
        ...new Set(
          [...(currentProj?.modules ?? []), ...projectDefects.map((d) => d.module)].filter(Boolean),
        ),
      ].sort()
    : [...new Set(defects.map((d) => d.module).filter(Boolean))].sort();
  const uniqueDevs = [
    ...new Set(projectDefects.map((d) => d.assignedDeveloperId).filter(Boolean)),
  ].sort();

  const filtered = projectDefects
    .filter((d) => {
      if (filterStatus !== "all" && d.status !== filterStatus) return false;
      if (filterSeverity !== "all" && d.severity !== filterSeverity) return false;
      if (filterModule !== "all" && d.module !== filterModule) return false;
      if (filterDev !== "all" && d.assignedDeveloperId !== filterDev) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!d.id.toLowerCase().includes(q) && !d.title.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const num = (id: string) => parseInt(id.split("-").pop() || "0", 10);
      return num(a.id) - num(b.id);
    });

  const openCount = projectDefects.filter((d) => d.status === "Open").length;
  const inProgressCount = projectDefects.filter((d) => d.status === "In Progress").length;
  const fixedCount = projectDefects.filter((d) => d.status === "Fixed").length;
  const closedCount = projectDefects.filter((d) => d.status === "Closed").length;

  function handleCreate() {
    if (!form.title.trim() || !pid) return;
    addDefect({
      projectId: pid,
      title: form.title.trim(),
      module: form.module,
      environment: form.environment.trim(),
      precondition: form.precondition.trim(),
      stepsToReproduce: form.stepsToReproduce.trim(),
      expectedResult: form.expectedResult.trim(),
      actualResult: form.actualResult.trim(),
      severity: form.severity,
      priority: form.priority,
      status: "Open",
      assignedDeveloperId: form.assignedDeveloperId,
      relatedTaskId: form.relatedTaskId,
      evidenceUrl: form.evidenceUrl.trim(),
    });
    setForm({
      title: "",
      module: "",
      environment: "",
      precondition: "",
      stepsToReproduce: "",
      expectedResult: "",
      actualResult: "",
      severity: "Medium",
      priority: "Medium",
      assignedDeveloperId: "",
      relatedTaskId: "",
      evidenceUrl: "",
    });
    setShowNewModal(false);
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim() || !pid || !currentProj) return;
    setAiThinking(true);
    setAiError("");
    try {
      const result = await generateDefectFromPrompt({
        data: {
          prompt: aiPrompt.trim(),
          projectName: currentProj.name,
          modules: currentProj.modules ?? [],
          tasks: projectTasks.map((t) => ({
            taskId: t.taskId,
            title: t.title,
            module: t.module,
            field: t.field,
            status: t.status,
            developer: t.developer,
          })),
        },
      });
      setAiRelatedTaskIds(result.relatedTaskIds);
      setForm((p) => ({
        ...p,
        title: result.title,
        module: result.module,
        environment: result.environment,
        precondition: result.precondition,
        stepsToReproduce: result.stepsToReproduce,
        expectedResult: result.expectedResult,
        actualResult: result.actualResult,
        severity: result.severity,
        priority: result.priority,
        relatedTaskId: result.relatedTaskIds[0] ?? "",
      }));
      setAiOpen(false);
      setShowNewModal(true);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiThinking(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="size-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search defects..."
            className="w-44 pl-7 pr-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as DefectStatus | "all")}
          className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
        >
          <option value="all">All Status</option>
          {DEFECT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as DefectSeverity | "all")}
          className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
        >
          <option value="all">All Severity</option>
          {DEFECT_SEVERITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {moduleOptions.length > 0 && (
          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className="px-2 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
          >
            <option value="all">All Modules</option>
            {moduleOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
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
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] font-mono text-muted-foreground">
            {filtered.length} of {projectDefects.length} defects
          </span>
          {canManageDefect && pid && (
            <>
              <button
                onClick={() => setAiOpen(true)}
                className="px-3 py-1.5 text-primary border border-primary/30 text-xs font-bold rounded hover:bg-primary/10 flex items-center gap-1.5"
                title="AI Log Defect — describe a bug in plain English"
              >
                <Sparkles className="size-3.5" />
                AI Log Defect
              </button>
              <button
                onClick={() => {
                  setShowNewModal(true);
                  setAiRelatedTaskIds([]);
                  setForm((p) => ({ ...p, relatedTaskId: "" }));
                }}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 flex items-center gap-1.5"
              >
                <Plus className="size-3.5" />
                Log Defect
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-card border border-border rounded-md text-center">
          <div className="text-lg font-bold text-warning">{openCount}</div>
          <div className="text-[9px] font-mono text-muted-foreground uppercase">Open</div>
        </div>
        <div className="p-3 bg-card border border-border rounded-md text-center">
          <div className="text-lg font-bold text-info">{inProgressCount}</div>
          <div className="text-[9px] font-mono text-muted-foreground uppercase">In Progress</div>
        </div>
        <div className="p-3 bg-card border border-border rounded-md text-center">
          <div className="text-lg font-bold text-primary">{fixedCount}</div>
          <div className="text-[9px] font-mono text-muted-foreground uppercase">Fixed</div>
        </div>
        <div className="p-3 bg-card border border-border rounded-md text-center">
          <div className="text-lg font-bold text-success">{closedCount}</div>
          <div className="text-[9px] font-mono text-muted-foreground uppercase">Closed</div>
        </div>
      </div>

      {/* Defects Table */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              {!pid && <Th>Project</Th>}
              <Th>ID</Th>
              <Th className="min-w-[250px]">Title</Th>
              <Th>Module</Th>
              <Th>Severity</Th>
              <Th>Priority</Th>
              <Th>Status</Th>
              <Th>Assigned Dev</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr
                key={d.id}
                onClick={() => setSelectedDefect(d)}
                className="border-b border-border hover:bg-surface-2/40 transition-colors cursor-pointer"
              >
                {!pid && (
                  <Td>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {projects.find((p) => p.id === d.projectId)?.prefix ?? d.projectId}
                    </span>
                  </Td>
                )}
                <Td>
                  <span className="font-mono text-xs font-bold text-destructive">
                    {d.id}
                    {d.priority === "High" && (
                      <AlertTriangle className="size-2.5 inline ml-1 text-warning" />
                    )}
                  </span>
                </Td>
                <Td>
                  <span className="text-xs font-medium truncate max-w-[300px] block">
                    {d.title}
                  </span>
                </Td>
                <Td>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {d.module || "—"}
                  </span>
                </Td>
                <Td>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${DEFECT_SEVERITY_COLOR[d.severity]}`}
                  >
                    {d.severity}
                  </span>
                </Td>
                <Td>
                  <span className="text-[10px] font-mono text-muted-foreground">{d.priority}</span>
                </Td>
                <Td>
                  {!canEditDefect(d) ? (
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${DEFECT_STATUS_COLOR[d.status]}`}
                    >
                      {d.status}
                    </span>
                  ) : (
                    <select
                      value={d.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateDefect(d.id, { status: e.target.value as DefectStatus })
                      }
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border-none cursor-pointer ${DEFECT_STATUS_COLOR[d.status]}`}
                    >
                      {DEFECT_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Td>
                <Td>
                  {!canManageDefect ? (
                    <div className="flex items-center gap-1.5">
                      <div className="size-5 rounded-full bg-surface-2 border border-border grid place-items-center text-[8px] font-bold">
                        {d.assignedDeveloperId?.slice(0, 2).toUpperCase() || "—"}
                      </div>
                      <span className="text-xs">{d.assignedDeveloperId || "—"}</span>
                    </div>
                  ) : (
                    <select
                      value={d.assignedDeveloperId}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateDefect(d.id, { assignedDeveloperId: e.target.value })}
                      className="text-[10px] font-mono text-muted-foreground px-1 py-0.5 rounded border border-transparent hover:border-border focus:border-primary bg-transparent cursor-pointer focus:outline-none focus:bg-surface-2"
                      title="Edit assigned developer"
                    >
                      <option value="">Unassigned</option>
                      {developers.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  )}
                </Td>
                <Td>
                  <span className="text-[10px] font-mono text-muted-foreground">{d.createdAt}</span>
                </Td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={!pid ? 9 : 8}
                  className="text-center py-12 text-sm text-muted-foreground"
                >
                  {search ||
                  filterStatus !== "all" ||
                  filterSeverity !== "all" ||
                  filterModule !== "all" ||
                  filterDev !== "all"
                    ? "No defects match your filters."
                    : "No defects logged yet. Log your first defect!"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Log New Defect Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40"
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="w-full max-w-xl bg-card border border-border rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Bug className="size-4 text-destructive" />
                Log New Defect · {currentProj?.name ?? "All Projects"} ·{" "}
                <span className="text-primary font-mono">{nextDefectId(pid ?? "")}</span>
              </span>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-1 rounded hover:bg-surface-2 text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {aiRelatedTaskIds.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Related Feature Tasks (AI suggestion)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {aiRelatedTaskIds.map((id, idx) => {
                      const match = projectTasks.find((t) => t.taskId === id);
                      const isPrimary = idx === 0 && id === form.relatedTaskId;
                      return (
                        <span
                          key={id}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono ${
                            isPrimary
                              ? "bg-primary/10 text-primary border border-primary/30"
                              : "bg-info/10 text-info"
                          }`}
                        >
                          <GitBranch className="size-2.5 shrink-0" />
                          {id}
                          {match ? ` · ${match.title}` : ""}
                          {isPrimary ? " · linked" : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Title *
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Login redirects to blank page"
                  className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Module
                  </label>
                  <input
                    value={form.module}
                    onChange={(e) => setForm((p) => ({ ...p, module: e.target.value }))}
                    placeholder="Login"
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Environment
                  </label>
                  <input
                    value={form.environment}
                    onChange={(e) => setForm((p) => ({ ...p, environment: e.target.value }))}
                    placeholder="Chrome / Windows 11"
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Severity
                  </label>
                  <select
                    value={form.severity}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, severity: e.target.value as DefectSeverity }))
                    }
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  >
                    {DEFECT_SEVERITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
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
                      setForm((p) => ({ ...p, priority: e.target.value as DefectPriority }))
                    }
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  >
                    {DEFECT_PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Assigned Developer
                  </label>
                  <select
                    value={form.assignedDeveloperId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, assignedDeveloperId: e.target.value }))
                    }
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
                    Evidence Link (optional)
                  </label>
                  <input
                    value={form.evidenceUrl}
                    onChange={(e) => setForm((p) => ({ ...p, evidenceUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full mt-1 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Precondition
                </label>
                <textarea
                  value={form.precondition}
                  onChange={(e) => setForm((p) => ({ ...p, precondition: e.target.value }))}
                  placeholder="User is logged in with an active session"
                  className="w-full mt-1 h-14 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Steps to Reproduce
                </label>
                <textarea
                  value={form.stepsToReproduce}
                  onChange={(e) => setForm((p) => ({ ...p, stepsToReproduce: e.target.value }))}
                  placeholder={"1. Navigate to /login\n2. Submit valid credentials\n3. Observe"}
                  className="w-full mt-1 h-20 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Expected Result
                  </label>
                  <textarea
                    value={form.expectedResult}
                    onChange={(e) => setForm((p) => ({ ...p, expectedResult: e.target.value }))}
                    placeholder="Redirects to the dashboard"
                    className="w-full mt-1 h-16 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary resize-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Actual Result
                  </label>
                  <textarea
                    value={form.actualResult}
                    onChange={(e) => setForm((p) => ({ ...p, actualResult: e.target.value }))}
                    placeholder="Blank page with no redirect"
                    className="w-full mt-1 h-16 px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary resize-none"
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
                Log Defect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Defect Details Modal */}
      {selectedDefect && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40"
          onClick={() => setSelectedDefect(null)}
        >
          <div
            className="w-full max-w-xl bg-card border border-border rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Bug className="size-4 text-destructive" />
                Defect Details
              </span>
              <button
                onClick={() => setSelectedDefect(null)}
                className="p-1 rounded hover:bg-surface-2 text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold text-destructive">
                  {selectedDefect.id}
                </span>
                {!canEditDefect(selectedDefect) ? (
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${DEFECT_STATUS_COLOR[selectedDefect.status]}`}
                  >
                    {selectedDefect.status}
                  </span>
                ) : (
                  <select
                    value={selectedDefect.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updateDefect(selectedDefect.id, { status: e.target.value as DefectStatus })
                    }
                    className={`text-xs font-mono font-bold px-2 py-1 rounded border-none cursor-pointer ${DEFECT_STATUS_COLOR[selectedDefect.status]}`}
                  >
                    {DEFECT_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {!canManageDefect ? (
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Title
                  </div>
                  <div className="text-sm font-medium">{selectedDefect.title}</div>
                </div>
              ) : (
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Title
                  </div>
                  <input
                    value={selectedDefect.title}
                    onChange={(e) => updateDefect(selectedDefect.id, { title: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Module
                  </div>
                  {!canManageDefect ? (
                    <span className="text-sm">{selectedDefect.module || "—"}</span>
                  ) : (
                    <input
                      value={selectedDefect.module}
                      onChange={(e) => updateDefect(selectedDefect.id, { module: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    />
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Environment
                  </div>
                  {!canManageDefect ? (
                    <span className="text-sm">{selectedDefect.environment || "—"}</span>
                  ) : (
                    <input
                      value={selectedDefect.environment}
                      onChange={(e) =>
                        updateDefect(selectedDefect.id, { environment: e.target.value })
                      }
                      className="w-full px-2 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Severity
                  </div>
                  {!canManageDefect ? (
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${DEFECT_SEVERITY_COLOR[selectedDefect.severity]}`}
                    >
                      {selectedDefect.severity}
                    </span>
                  ) : (
                    <select
                      value={selectedDefect.severity}
                      onChange={(e) =>
                        updateDefect(selectedDefect.id, {
                          severity: e.target.value as DefectSeverity,
                        })
                      }
                      className="w-full px-2 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    >
                      {DEFECT_SEVERITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Priority
                  </div>
                  {!canManageDefect ? (
                    <span className="text-sm">{selectedDefect.priority}</span>
                  ) : (
                    <select
                      value={selectedDefect.priority}
                      onChange={(e) =>
                        updateDefect(selectedDefect.id, {
                          priority: e.target.value as DefectPriority,
                        })
                      }
                      className="w-full px-2 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    >
                      {DEFECT_PRIORITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Assigned Dev
                  </div>
                  {!canManageDefect ? (
                    <span className="text-sm">{selectedDefect.assignedDeveloperId || "—"}</span>
                  ) : (
                    <select
                      value={selectedDefect.assignedDeveloperId}
                      onChange={(e) =>
                        updateDefect(selectedDefect.id, {
                          assignedDeveloperId: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="">Unassigned</option>
                      {developers.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {selectedDefect.precondition && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Precondition
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedDefect.precondition}
                  </p>
                </div>
              )}
              {selectedDefect.stepsToReproduce && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                    Steps to Reproduce
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedDefect.stepsToReproduce}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedDefect.expectedResult && (
                  <div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                      Expected Result
                    </div>
                    <p className="text-sm text-success whitespace-pre-wrap">
                      {selectedDefect.expectedResult}
                    </p>
                  </div>
                )}
                {selectedDefect.actualResult && (
                  <div>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                      Actual Result
                    </div>
                    <p className="text-sm text-destructive whitespace-pre-wrap">
                      {selectedDefect.actualResult}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                  Evidence
                </div>
                {selectedDefect.evidenceUrl ? (
                  <a
                    href={selectedDefect.evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline truncate max-w-full"
                  >
                    <ExternalLink className="size-3 shrink-0" />
                    {selectedDefect.evidenceUrl}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                  Logged
                </div>
                <span className="text-sm text-muted-foreground">{selectedDefect.createdAt}</span>
              </div>

              {selectedDefect.relatedTaskId &&
                (() => {
                  const related = projectTasks.find(
                    (t) => t.taskId === selectedDefect.relatedTaskId,
                  );
                  return (
                    <div>
                      <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                        Related Task
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono border border-primary/30">
                        <GitBranch className="size-2.5 shrink-0" />
                        {selectedDefect.relatedTaskId}
                        {related ? ` · ${related.title}` : ""}
                      </span>
                    </div>
                  );
                })()}
            </div>
            <div className="flex justify-between px-5 py-4 border-t border-border">
              {canManageDefect && (
                <button
                  onClick={() => {
                    deleteDefect(selectedDefect.id);
                    setSelectedDefect(null);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded border border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  Delete Defect
                </button>
              )}
              <button
                onClick={() => setSelectedDefect(null)}
                className="px-4 py-2 text-xs font-medium rounded border border-border hover:bg-surface-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <AiPromptModal
        title="AI Log Defect"
        subtitle="Describe the bug in plain English (type or speak). The AI pre-fills the Log Defect modal — including links to matching feature tasks — for you to review before saving. Nothing is written until you click Log Defect."
        placeholder="e.g. After resetting the password, login redirects to a blank page instead of the dashboard"
        open={aiOpen}
        prompt={aiPrompt}
        onPromptChange={setAiPrompt}
        onClose={() => setAiOpen(false)}
        onSubmit={handleAiGenerate}
        thinking={aiThinking}
        error={aiError}
      />
    </div>
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
