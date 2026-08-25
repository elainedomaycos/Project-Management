import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { readCache, writeCache } from "@/lib/local-cache";
import { useAuth } from "@/lib/auth-context";
import type { HealthStatus, HealthSource } from "@/lib/health";
import { computeAutoHealth } from "@/lib/health";
import { toast } from "sonner";

export type TaskStatus = "pending" | "doing" | "qa" | "done";
export type QaStatus = "waiting" | "passed" | "failed";

export type Task = {
  id: string;
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  developer: string;
  field: string;
  endUser: string;
  module: string;
  status: TaskStatus;
  qaStatus: QaStatus;
  commit: string;
  remarks: string;
  dueDate: string;
  startDate: string;
  completedAt: string;
  priority: "low" | "medium" | "high" | "critical";
  branch: string;
  createdBy: string;
  timelineItemId: string;
};

export type NewTaskInput = Omit<
  Task,
  "id" | "taskId" | "createdBy" | "branch" | "endUser" | "module" | "timelineItemId"
> &
  Partial<Pick<Task, "branch" | "endUser" | "module" | "timelineItemId">>;

export type Project = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  clientName: string;
  endUsers: string[];
  modules: string[];
  archivedAt: string | null;
  finalDefenseDate: string;
  adviserId: string | null;
  healthStatus: HealthStatus;
  healthSource: HealthSource;
};

export type AppView = "pm" | "developer" | "qa" | "client";

type CachedProjectData = {
  projects: Project[];
  tasks: Task[];
  developers: string[];
  qaUsers: string[];
};

type ProjectContextType = {
  projects: Project[];
  archivedProjects: Project[];
  tasks: Task[];
  currentProject: Project | null;
  currentView: AppView;
  currentDeveloper: string;
  developers: string[];
  qaUsers: string[];
  loading: boolean;
  setCurrentProject: (id: string | null) => void;
  setCurrentView: (v: AppView) => void;
  setCurrentDeveloper: (name: string) => void;
  addProject: (data: {
    name: string;
    clientName: string;
    endUsers: string[];
    modules: string[];
  }) => void;
  updateProject: (
    id: string,
    updates: {
      clientName?: string;
      endUsers?: string[];
      modules?: string[];
      finalDefenseDate?: string;
      adviserId?: string | null;
      healthStatus?: HealthStatus;
      healthSource?: HealthSource;
    },
    opts?: { silent?: boolean },
  ) => void;
  archiveProject: (id: string) => void;
  restoreProject: (id: string) => void;
  removeProject: (id: string) => void;
  addTask: (t: NewTaskInput) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
  nextTaskId: (projectId: string) => string;
  getProjectTasks: (projectId: string) => Task[];
  getDeveloperTasks: (devName: string) => Task[];
  getQaTasks: () => Task[];
  getAnalytics: (projectId: string) => ProjectAnalytics;
  addDeveloper: (name: string) => void;
  removeDeveloper: (name: string) => void;
  addQaUser: (name: string) => void;
  removeQaUser: (name: string) => void;
};

export type ProjectAnalytics = {
  total: number;
  done: number;
  qa: number;
  doing: number;
  pending: number;
  overallProgress: number;
  devProgress: { name: string; done: number; total: number; pct: number }[];
  fieldProgress: { name: string; done: number; total: number; pct: number }[];
  qaPassed: number;
  qaFailed: number;
  qaWaiting: number;
};

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toDbTask(t: Task) {
  return {
    id: t.id,
    task_id: t.taskId,
    project_id: t.projectId,
    title: t.title,
    description: t.description,
    developer: t.developer,
    field: t.field,
    end_user: t.endUser,
    module: t.module,
    status: t.status,
    qa_status: t.qaStatus,
    commit: t.commit,
    remarks: t.remarks,
    due_date: t.dueDate,
    start_date: t.startDate,
    completed_at: t.completedAt,
    priority: t.priority,
    branch_name: t.branch,
    created_by: t.createdBy,
    timeline_item_id: t.timelineItemId || null,
  };
}

type TaskRow = {
  id: string;
  task_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  developer: string | null;
  field: string | null;
  end_user: string | null;
  module: string | null;
  status: string | null;
  qa_status: string | null;
  commit: string | null;
  remarks: string | null;
  due_date: string | null;
  start_date: string | null;
  completed_at: string | null;
  priority: string | null;
  branch_name: string | null;
  created_by: string | null;
  timeline_item_id: string | null;
};

function fromDbTask(r: TaskRow): Task {
  return {
    id: r.id,
    taskId: r.task_id,
    projectId: r.project_id || "",
    title: r.title,
    description: r.description || "",
    developer: r.developer || "",
    field: r.field || "",
    endUser: r.end_user || "",
    module: r.module || "",
    status: (r.status || "pending") as Task["status"],
    qaStatus: (r.qa_status || "waiting") as Task["qaStatus"],
    commit: r.commit || "",
    remarks: r.remarks || "",
    dueDate: r.due_date || "",
    startDate: r.start_date || "",
    completedAt: r.completed_at || "",
    priority: (r.priority || "medium") as Task["priority"],
    branch: r.branch_name || "",
    createdBy: r.created_by || "",
    timelineItemId: r.timeline_item_id || "",
  };
}

type ProjectRow = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  client_name: string | null;
  end_users: string[] | null;
  modules: string[] | null;
  archived_at: string | null;
  final_defense_date?: string | null;
  adviser_id?: string | null;
  health_status?: string | null;
  health_source?: string | null;
};

function fromDbProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.created_at,
    clientName: r.client_name || "",
    endUsers: r.end_users || [],
    modules: r.modules || [],
    archivedAt: r.archived_at || null,
    finalDefenseDate: r.final_defense_date || "",
    adviserId: r.adviser_id || null,
    healthStatus: (r.health_status as HealthStatus) || "on_track",
    healthSource: (r.health_source as HealthSource) || "auto",
  };
}

function getInitialProject(projects: Project[]): Project | null {
  if (typeof window === "undefined") return projects[0] ?? null;
  const saved = localStorage.getItem("selected-project-id");
  if (saved === "__all__") return null;
  if (saved) {
    const found = projects.find((p) => p.id === saved);
    if (found) return found;
  }
  return projects[0] ?? null;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

let realtimeSeq = 0;

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

async function notifyDeveloper(devName: string, message: string, taskId: string) {
  if (!devName) return;
  try {
    const { data } = await db()
      .from("profiles")
      .select("id")
      .ilike("display_name", devName)
      .maybeSingle();
    if (data?.id) {
      await db()
        .from("notifications")
        .insert({ user_id: data.id, task_id: taskId || null, message });
    }
  } catch {
    /* ignore */
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(() =>
    getInitialProject([]),
  );
  const [currentView, setCurrentView] = useState<AppView>("pm");
  const [currentDeveloper, setCurrentDeveloper] = useState("");
  const [developers, setDeveloperState] = useState<string[]>([]);
  const [qaUsers, setQaState] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const lastToast = useRef<string | number | null>(null);
  const taskEditToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(kind: "success" | "error", message: string) {
    if (lastToast.current != null) toast.dismiss(lastToast.current);
    lastToast.current = kind === "success" ? toast.success(message) : toast.error(message);
  }

  const projects = allProjects.filter((p) => !p.archivedAt);
  const archivedProjects = allProjects.filter((p) => !!p.archivedAt);
  const tasks = allTasks.filter((t) => {
    const proj = allProjects.find((p) => p.id === t.projectId);
    return !proj?.archivedAt;
  });

  // Load from Supabase — re-fetch when the user first becomes available
  // (on mount the user may not be authenticated yet, so RLS returns nothing)
  useEffect(() => {
    async function load() {
      const cached = readCache<CachedProjectData>("project-data");
      if (cached) {
        setAllProjects(cached.projects);
        setAllTasks(cached.tasks);
        setDeveloperState(cached.developers);
        setQaState(cached.qaUsers);
        setLoading(false);
      }
      try {
        const [projRes, taskRes, profilesRes] = await Promise.all([
          db().from("projects").select("*").order("name"),
          db().from("tasks").select("*"),
          db().from("profiles").select("display_name, role"),
        ]);
        if (projRes.data?.length) setAllProjects(projRes.data.map(fromDbProject));
        if (taskRes.data) setAllTasks(taskRes.data.map(fromDbTask));

        // Derive developer / QA lists from profiles table by role
        const profileList: { display_name: string; role: string }[] = profilesRes.data ?? [];
        const devs = profileList
          .filter((p) => p.role === "developer" && p.display_name)
          .map((p) => p.display_name);
        const qas = profileList
          .filter((p) => p.role === "viewer" && p.display_name)
          .map((p) => p.display_name);
        setDeveloperState(devs);
        setQaState(qas);
      } catch (e) {
        console.warn("Failed to load from Supabase, using defaults", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profile?.id]);

  // Live-update tasks from realtime changes so edits by other users show up immediately
  useEffect(() => {
    const channel = supabase
      .channel(`tasks-changes:${++realtimeSeq}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setAllTasks((prev) => prev.filter((t) => t.id !== payload.old?.id));
        } else if (payload.eventType === "INSERT") {
          setAllTasks((prev) =>
            prev.some((t) => t.id === payload.new?.id)
              ? prev
              : [...prev, fromDbTask(payload.new as TaskRow)],
          );
        } else if (payload.eventType === "UPDATE") {
          setAllTasks((prev) =>
            prev.map((t) => (t.id === payload.new?.id ? fromDbTask(payload.new as TaskRow) : t)),
          );
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Live-update projects from realtime changes (adds/edits/archives/deletes by other users)
  useEffect(() => {
    const channel = supabase
      .channel(`projects-changes:${++realtimeSeq}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          setAllProjects((prev) => prev.filter((p) => p.id !== id));
          setAllTasks((prev) => prev.filter((t) => t.projectId !== id));
        } else if (payload.eventType === "INSERT") {
          setAllProjects((prev) =>
            prev.some((p) => p.id === payload.new?.id)
              ? prev
              : [...prev, fromDbProject(payload.new as ProjectRow)],
          );
        } else if (payload.eventType === "UPDATE") {
          setAllProjects((prev) =>
            prev.map((p) =>
              p.id === payload.new?.id ? fromDbProject(payload.new as ProjectRow) : p,
            ),
          );
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Nudge the auto-health calculator whenever deliverables / sub-tasks change
  const [healthTick, setHealthTick] = useState(0);
  useEffect(() => {
    const channel = supabase
      .channel(`defense-changes:${++realtimeSeq}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "defense_deliverables" }, () =>
        setHealthTick((t) => t + 1),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "defense_subtasks" }, () =>
        setHealthTick((t) => t + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Keep group health in sync automatically while project health source is 'auto'
  useEffect(() => {
    const cp = currentProject;
    if (!cp || cp.healthSource !== "auto") return;
    let cancelled = false;
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("defense_deliverables")
          .select("status, due_date")
          .eq("project_id", cp.id);
        if (cancelled || error || !data) return;
        const computed = computeAutoHealth(
          data as { status: string; due_date: string | null }[],
          cp.finalDefenseDate,
          { tasks: allTasks.filter((t) => t.projectId === cp.id) },
        );
        if (!cancelled && computed !== cp.healthStatus) {
          setAllProjects((prev) =>
            prev.map((p) => (p.id === cp.id ? { ...p, healthStatus: computed } : p)),
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          void (supabase as any)
            .from("projects")
            .update({ health_status: computed })
            .eq("id", cp.id)
            .then((res: { error: { message: string } | null }) => {
              if (res?.error) console.error("[health-sync]", res.error.message);
            });
        }
      } catch (err) {
        console.error("[health-sync]", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentProject?.id,
    currentProject?.finalDefenseDate,
    currentProject?.healthSource,
    currentProject?.healthStatus,
    allTasks,
    healthTick,
  ]);

  // Keep the selected project in sync when projects change (edits, archives, deletes)
  useEffect(() => {
    if (!currentProject) return;
    const fresh = allProjects.find((p) => p.id === currentProject.id);
    if (!fresh) {
      const next = allProjects.find((p) => !p.archivedAt) ?? allProjects[0] ?? null;
      setCurrentProjectState(next);
      localStorage.setItem("selected-project-id", next ? next.id : "__all__");
      return;
    }
    if (fresh.archivedAt !== currentProject.archivedAt) {
      if (fresh.archivedAt) {
        const next = allProjects.find((p) => !p.archivedAt && p.id !== fresh.id) ?? null;
        setCurrentProjectState(next);
        localStorage.setItem("selected-project-id", next ? next.id : "__all__");
      } else {
        setCurrentProjectState(fresh);
      }
    } else if (
      fresh.clientName !== currentProject.clientName ||
      fresh.endUsers.length !== currentProject.endUsers.length ||
      fresh.endUsers.some((u, i) => u !== currentProject.endUsers[i]) ||
      fresh.modules.length !== currentProject.modules.length ||
      fresh.modules.some((m, i) => m !== currentProject.modules[i]) ||
      fresh.name !== currentProject.name ||
      fresh.prefix !== currentProject.prefix
    ) {
      setCurrentProjectState(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProjects]);

  // Cache last-known data so the next load can render instantly instead of
  // waiting on Supabase (skip the transient pre-hydration defaults).
  useEffect(() => {
    if (loading) return;
    writeCache<CachedProjectData>("project-data", {
      projects: allProjects,
      tasks: allTasks,
      developers,
      qaUsers,
    });
  }, [allProjects, allTasks, developers, qaUsers, loading]);

  // When fresh projects load from Supabase, re-validate the selection
  const prevProjectsLen = useRef(allProjects.length);
  useEffect(() => {
    if (prevProjectsLen.current === allProjects.length) return;
    prevProjectsLen.current = allProjects.length;
    const saved = localStorage.getItem("selected-project-id");
    if (saved === "__all__") {
      setCurrentProjectState(null);
    } else if (saved && projects.find((p) => p.id === saved)) {
      setCurrentProjectState(projects.find((p) => p.id === saved)!);
    } else if (currentProject && !projects.find((p) => p.id === currentProject.id)) {
      setCurrentProjectState(projects[0] ?? null);
    }
  }, [allProjects]);

  function setCurrentProject(id: string | null) {
    if (id === null || id === "__all__") {
      setCurrentProjectState(null);
      localStorage.setItem("selected-project-id", "__all__");
    } else {
      const found = allProjects.find((p) => p.id === id);
      if (found) {
        setCurrentProjectState(found);
        localStorage.setItem("selected-project-id", found.id);
      }
    }
  }

  async function addProject(data: {
    name: string;
    clientName: string;
    endUsers: string[];
    modules: string[];
  }) {
    const id = data.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const words = data.name.split(" ");
    const prefix =
      words
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 4) || "PRJ";
    const p: Project = {
      id,
      name: data.name,
      prefix,
      createdAt: new Date().toISOString().slice(0, 10),
      clientName: data.clientName,
      endUsers: data.endUsers,
      modules: data.modules,
      archivedAt: null,
      finalDefenseDate: "",
      adviserId: null,
      healthStatus: "on_track",
      healthSource: "auto",
    };
    setAllProjects((prev) => [...prev, p]);
    setCurrentProjectState(p);
    localStorage.setItem("selected-project-id", p.id);
    try {
      const res = await db()
        .from("projects")
        .insert({
          id,
          name: data.name,
          prefix,
          created_at: p.createdAt,
          client_name: data.clientName || "",
          end_users: data.endUsers ?? [],
          modules: data.modules ?? [],
        });
      if (res?.error) {
        console.error("[addProject] Supabase error:", res.error);
        notify(
          "error",
          `Failed to create project: ${res.error.message ?? JSON.stringify(res.error)}`,
        );
      } else {
        notify("success", "Project created");
      }
    } catch (e: unknown) {
      console.error("[addProject] exception:", e);
      notify("error", `Failed to create project: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function updateProject(
    id: string,
    updates: {
      clientName?: string;
      endUsers?: string[];
      modules?: string[];
      finalDefenseDate?: string;
      adviserId?: string | null;
      healthStatus?: HealthStatus;
      healthSource?: HealthSource;
    },
    opts?: { silent?: boolean },
  ) {
    const silent = opts?.silent ?? false;
    setAllProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    const dbUpdates: Record<string, unknown> = {};
    if (updates.clientName !== undefined) dbUpdates.client_name = updates.clientName;
    if (updates.endUsers !== undefined) dbUpdates.end_users = updates.endUsers;
    if (updates.modules !== undefined) dbUpdates.modules = updates.modules;
    if (updates.finalDefenseDate !== undefined)
      dbUpdates.final_defense_date = updates.finalDefenseDate;
    if (updates.adviserId !== undefined) dbUpdates.adviser_id = updates.adviserId || null;
    if (updates.healthStatus !== undefined) dbUpdates.health_status = updates.healthStatus;
    if (updates.healthSource !== undefined) dbUpdates.health_source = updates.healthSource;
    try {
      const res = await db().from("projects").update(dbUpdates).eq("id", id);
      if (res?.error) {
        console.error("[updateProject] error:", res.error);
        if (!silent)
          notify(
            "error",
            `Failed to update project: ${res.error.message ?? JSON.stringify(res.error)}`,
          );
        return;
      }
      if (!silent) notify("success", "Project updated");
    } catch (err: unknown) {
      console.error("[updateProject] exception:", err);
      if (!silent)
        notify(
          "error",
          `Failed to update project: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
  }

  function archiveProject(id: string) {
    const now = new Date().toISOString();
    setAllProjects((prev) => prev.map((p) => (p.id === id ? { ...p, archivedAt: now } : p)));
    if (currentProject?.id === id) {
      const remaining = allProjects.filter((p) => p.id !== id && !p.archivedAt);
      const next = remaining[0] ?? null;
      setCurrentProjectState(next);
      localStorage.setItem("selected-project-id", next ? next.id : "__all__");
    }
    db()
      .from("projects")
      .update({ archived_at: now })
      .eq("id", id)
      .then(() => notify("success", "Project archived"))
      .catch(() => notify("error", "Failed to archive project"));
  }

  function restoreProject(id: string) {
    setAllProjects((prev) => prev.map((p) => (p.id === id ? { ...p, archivedAt: null } : p)));
    db()
      .from("projects")
      .update({ archived_at: null })
      .eq("id", id)
      .then(() => notify("success", "Project restored"))
      .catch(() => notify("error", "Failed to restore project"));
  }

  function removeProject(id: string) {
    setAllProjects((prev) => prev.filter((p) => p.id !== id));
    setAllTasks((prev) => prev.filter((t) => t.projectId !== id));
    if (currentProject?.id === id) {
      const remaining = allProjects.filter((p) => p.id !== id && !p.archivedAt);
      const next = remaining[0] ?? null;
      setCurrentProjectState(next);
      localStorage.setItem("selected-project-id", next ? next.id : "__all__");
    }
    db()
      .from("tasks")
      .delete()
      .eq("project_id", id)
      .then(() => {})
      .catch(() => {});
    db()
      .from("projects")
      .delete()
      .eq("id", id)
      .then(() => notify("success", "Project deleted"))
      .catch(() => notify("error", "Failed to delete project"));
  }

  function addTask(t: NewTaskInput) {
    const tid = nextTaskId(t.projectId);
    const slug = t.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
    const branch = `feature/${tid.toLowerCase()}-${slug}`;
    const task: Task = {
      id: generateId(),
      taskId: tid,
      createdBy: profile?.name || "",
      ...t,
      branch: t.branch || branch,
      endUser: t.endUser || "",
      module: t.module || "",
      timelineItemId: t.timelineItemId || "",
    };
    setAllTasks((prev) => [...prev, task]);
    db()
      .from("tasks")
      .insert(toDbTask(task))
      .then(() => notify("success", "Task created"))
      .catch(() => notify("error", "Failed to create task"));
    if (task.developer) {
      notifyDeveloper(task.developer, `New task ${task.taskId}: ${task.title}`, task.id);
    }
  }

  function updateTask(id: string, updates: Partial<Task>) {
    const prevTask = allTasks.find((t) => t.id === id);
    setAllTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates };
        if (updates.status === "done" && !updated.completedAt) {
          updated.completedAt = new Date().toISOString().slice(0, 10);
        }
        return updated;
      }),
    );
    if (updates.developer && prevTask && updates.developer !== prevTask.developer) {
      const title = updates.title ?? prevTask.title;
      notifyDeveloper(updates.developer, `Assigned to you ${prevTask.taskId}: ${title}`, id);
    }
    const dbUpdates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (k === "taskId") dbUpdates.task_id = v;
      else if (k === "projectId") dbUpdates.project_id = v;
      else if (k === "qaStatus") dbUpdates.qa_status = v;
      else if (k === "dueDate") dbUpdates.due_date = v;
      else if (k === "startDate") dbUpdates.start_date = v;
      else if (k === "completedAt") dbUpdates.completed_at = v;
      else if (k === "branch") dbUpdates.branch_name = v;
      else if (k === "endUser") dbUpdates.end_user = v;
      else if (k === "module") dbUpdates.module = v;
      else if (k === "createdBy") dbUpdates.created_by = v;
      else if (k === "timelineItemId") dbUpdates.timeline_item_id = v;
      else dbUpdates[k] = v;
    }
    db()
      .from("tasks")
      .update(dbUpdates)
      .eq("id", id)
      .then(() => {
        if (taskEditToastTimer.current) clearTimeout(taskEditToastTimer.current);
        taskEditToastTimer.current = setTimeout(() => notify("success", "Task updated"), 600);
      })
      .catch(() => notify("error", "Failed to update task"));
  }

  function removeTask(id: string) {
    setAllTasks((prev) => prev.filter((t) => t.id !== id));
    db()
      .from("tasks")
      .delete()
      .eq("id", id)
      .then(() => notify("success", "Task deleted"))
      .catch(() => notify("error", "Failed to delete task"));
  }

  function nextTaskId(projectId: string): string {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return "TASK-001";
    const projectTasks = tasks.filter((t) => t.projectId === projectId);
    const maxNum = projectTasks.reduce((max, t) => {
      const parts = t.taskId.split("-");
      const num = parseInt(parts[parts.length - 1], 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    const next = (maxNum + 1).toString().padStart(3, "0");
    return `${proj.prefix}-${next}`;
  }

  function getProjectTasks(projectId: string): Task[] {
    return tasks.filter((t) => t.projectId === projectId);
  }

  function getDeveloperTasks(devName: string): Task[] {
    return tasks.filter((t) => t.developer === devName && t.status !== "done");
  }

  function getQaTasks(): Task[] {
    return tasks.filter((t) => t.status === "qa");
  }

  function getAnalytics(projectId: string): ProjectAnalytics {
    const pt = tasks.filter((t) => t.projectId === projectId);
    const total = pt.length;
    const done = pt.filter((t) => t.status === "done").length;
    const qa = pt.filter((t) => t.status === "qa").length;
    const doing = pt.filter((t) => t.status === "doing").length;
    const pending = pt.filter((t) => t.status === "pending").length;
    const overallProgress = total > 0 ? Math.round((done / total) * 100) : 0;
    const devMap = new Map<string, { done: number; total: number }>();
    pt.forEach((t) => {
      if (!t.developer) return;
      const entry = devMap.get(t.developer) ?? { done: 0, total: 0 };
      entry.total++;
      if (t.status === "done") entry.done++;
      devMap.set(t.developer, entry);
    });
    const devProgress = Array.from(devMap.entries())
      .map(([name, d]) => ({
        name,
        done: d.done,
        total: d.total,
        pct: d.total > 0 ? Math.round((d.done / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.pct - a.pct);
    const fieldMap = new Map<string, { done: number; total: number }>();
    pt.forEach((t) => {
      if (!t.field) return;
      const entry = fieldMap.get(t.field) ?? { done: 0, total: 0 };
      entry.total++;
      if (t.status === "done") entry.done++;
      fieldMap.set(t.field, entry);
    });
    const fieldProgress = Array.from(fieldMap.entries())
      .map(([name, d]) => ({
        name,
        done: d.done,
        total: d.total,
        pct: d.total > 0 ? Math.round((d.done / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.pct - a.pct);
    const qaPassed = pt.filter((t) => t.qaStatus === "passed").length;
    const qaFailed = pt.filter((t) => t.qaStatus === "failed").length;
    const qaWaiting = pt.filter((t) => t.status === "qa" || t.qaStatus === "waiting").length;
    return {
      total,
      done,
      qa,
      doing,
      pending,
      overallProgress,
      devProgress,
      fieldProgress,
      qaPassed,
      qaFailed,
      qaWaiting,
    };
  }

  const addDeveloper = useCallback((name: string) => {
    if (!name.trim()) return;
    setDeveloperState((prev) => {
      const key = name.trim().toLowerCase();
      if (prev.some((d) => d.toLowerCase() === key)) return prev;
      return [...prev, name.trim()];
    });
  }, []);

  const removeDeveloper = useCallback((name: string) => {
    setDeveloperState((prev) => prev.filter((d) => d !== name));
  }, []);

  const addQaUser = useCallback((name: string) => {
    if (!name.trim()) return;
    setQaState((prev) => {
      const key = name.trim().toLowerCase();
      if (prev.some((q) => q.toLowerCase() === key)) return prev;
      return [...prev, name.trim()];
    });
  }, []);

  const removeQaUser = useCallback((name: string) => {
    setQaState((prev) => prev.filter((d) => d !== name));
  }, []);

  return (
    <ProjectContext.Provider
      value={{
        projects,
        archivedProjects,
        tasks,
        currentProject,
        currentView,
        currentDeveloper,
        developers,
        qaUsers,
        loading,
        setCurrentProject,
        setCurrentView,
        setCurrentDeveloper,
        addProject,
        updateProject,
        archiveProject,
        restoreProject,
        removeProject,
        addTask,
        updateTask,
        removeTask,
        nextTaskId,
        getProjectTasks,
        getDeveloperTasks,
        getQaTasks,
        getAnalytics,
        addDeveloper,
        removeDeveloper,
        addQaUser,
        removeQaUser,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
