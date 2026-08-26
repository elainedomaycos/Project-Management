import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/console";
import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { computeAutoHealth, HEALTH_META, type HealthStatus } from "@/lib/health";
import { toast } from "sonner";
import {
  Target,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Plus,
  Sparkles,
  ExternalLink,
  Trash2,
  Pencil,
  MessageSquareWarning,
  GitPullRequestArrow,
  ThumbsUp,
  ChevronDown,
  ChevronRight,
  ChevronUp,
} from "lucide-react";

export const Route = createFileRoute("/defense")({
  head: () => ({
    meta: [
      { title: "Final Defense · Project Management" },
      {
        name: "description",
        content: "Final defense roadmap with deliverables and adviser feedback.",
      },
    ],
  }),
  component: DefensePage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

type Deliverable = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  due_date: string;
  status: string;
  sort_order: number;
  link_url?: string;
  created_at: string;
};

type FeedbackRow = {
  id: string;
  project_id: string;
  chapter: string;
  category: string;
  content: string;
  author_id: string;
  status: string;
  task_created: boolean;
  created_at: string;
  resolved_at: string | null;
};

type SubTask = {
  id: string;
  deliverable_id: string;
  project_id: string;
  title: string;
  done: boolean;
  assignee: string;
  created_by: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "text-muted-foreground bg-surface-2",
  in_progress: "text-warning bg-warning/10",
  submitted: "text-info bg-info/10",
  approved: "text-success bg-success/10",
  rejected: "text-destructive bg-destructive/10",
};

const DEFAULT_CHECKLIST: { title: string; description: string }[] = [
  {
    title: "Final Manuscript (Chapters 1-5)",
    description: "Hardbound-ready manuscript, all chapters finalized.",
  },
  {
    title: "Source Code Repository",
    description: "Complete, documented repository access for the panel.",
  },
  { title: "System Demo Video", description: "Recorded walkthrough covering all major modules." },
  {
    title: "Plagiarism Report",
    description: "Turnitin/similarity report within acceptable threshold.",
  },
  { title: "User Manual", description: "End-user documentation for the system." },
  { title: "Deployment / Live Link", description: "Hosted system URL with test credentials." },
];

const CHAPTERS = ["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4", "Chapter 5", "Other"];

const CATEGORY_META: Record<
  string,
  { label: string; icon: typeof MessageSquareWarning; chip: string }
> = {
  comment: { label: "Comment", icon: MessageSquareWarning, chip: "text-info bg-info/10" },
  change_request: {
    label: "Change Request",
    icon: GitPullRequestArrow,
    chip: "text-warning bg-warning/10",
  },
  approval: { label: "Approval", icon: ThumbsUp, chip: "text-success bg-success/10" },
};

const FB_STATUS_STYLES: Record<string, string> = {
  open: "text-warning bg-warning/10",
  addressed: "text-success bg-success/10",
  dismissed: "text-muted-foreground bg-surface-2",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function DefensePage() {
  const { currentProject, updateProject, developers, tasks } = useProject();
  const { isAdmin, isLeader, isViewer, profile } = useAuth();
  const pid = currentProject?.id ?? null;
  const canManage = isAdmin || isLeader;
  const canGiveFeedback = profile?.role === "adviser" || isAdmin;

  const [items, setItems] = useState<Deliverable[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subForms, setSubForms] = useState<Record<string, { title: string; assignee: string }>>({});
  const [linkForms, setLinkForms] = useState<Record<string, string>>({});

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ title: "", description: "", dueDate: "" });

  const [fbForm, setFbForm] = useState({ chapter: "General", category: "comment", content: "" });
  const [editingFb, setEditingFb] = useState<string | null>(null);
  const [editFbForm, setEditFbForm] = useState({ chapter: "", category: "comment", content: "" });
  const [editingDel, setEditingDel] = useState<string | null>(null);
  const [editDelForm, setEditDelForm] = useState({ title: "", description: "", dueDate: "" });

  const fetchAll = useCallback(async () => {
    if (!pid) return;
    setLoading(true);
    try {
      const [{ data: dels }, { data: fbs }, { data: subs }, { data: profs }] = await Promise.all([
        db().from("defense_deliverables").select("*").eq("project_id", pid).order("sort_order"),
        db()
          .from("feedback")
          .select("*")
          .eq("project_id", pid)
          .order("created_at", { ascending: false }),
        db().from("defense_subtasks").select("*").eq("project_id", pid).order("created_at"),
        db().from("profiles").select("id, display_name"),
      ]);
      setItems((dels as Deliverable[]) ?? []);
      setFeedback((fbs as FeedbackRow[]) ?? []);
      setSubtasks((subs as SubTask[]) ?? []);
      setProfiles(
        new Map(
          ((profs ?? []) as { id: string; display_name: string }[]).map((p) => [
            p.id,
            p.display_name || "?",
          ]),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUid(user?.id ?? null);
    })();
  }, []);

  if (!currentProject) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Final Defense" }]} />
        <div className="flex-1 grid place-items-center">
          <p className="text-sm text-muted-foreground">
            Select a project to view its defense roadmap.
          </p>
        </div>
      </>
    );
  }

  const completed = items.filter((i) => i.status === "submitted").length;
  const overdueCount = items.filter(
    (i) => i.due_date && i.due_date < todayStr() && i.status !== "submitted",
  ).length;
  const openFeedback = feedback.filter((f) => f.status === "open").length;
  const pct = items.length ? Math.round((completed / items.length) * 100) : 0;

  async function generateDefaults() {
    if (!pid) return;
    const rows = DEFAULT_CHECKLIST.map((c, idx) => ({
      project_id: pid,
      title: c.title,
      description: c.description,
      sort_order: idx,
    }));
    const { error } = await db().from("defense_deliverables").insert(rows);
    if (error) toast.error(error.message);
    else {
      toast.success("Default defense checklist generated");
      logActivity(pid, "deliverable_updated", `Generated default checklist (${rows.length} items)`);
      fetchAll();
    }
  }

  async function addItem() {
    if (!pid || !itemForm.title.trim()) return;
    const { error } = await db().from("defense_deliverables").insert({
      project_id: pid,
      title: itemForm.title.trim(),
      description: itemForm.description.trim(),
      due_date: itemForm.dueDate,
      sort_order: items.length,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Deliverable added");
      logActivity(pid, "deliverable_updated", `Added deliverable "${itemForm.title.trim()}"`);
      setItemForm({ title: "", description: "", dueDate: "" });
      setShowAddItem(false);
      fetchAll();
    }
  }

  function startEditDeliverable(item: Deliverable) {
    setEditingDel(item.id);
    setEditDelForm({
      title: item.title,
      description: item.description,
      dueDate: item.due_date,
    });
  }

  async function saveDeliverableEdit() {
    if (!pid || !editingDel) return;
    const title = editDelForm.title.trim();
    if (!title) {
      toast.error("Deliverable title is required");
      return;
    }
    const { error } = await db()
      .from("defense_deliverables")
      .update({
        title,
        description: editDelForm.description.trim(),
        due_date: editDelForm.dueDate || null,
      })
      .eq("id", editingDel);
    if (error) toast.error(error.message);
    else {
      toast.success("Deliverable updated");
      logActivity(pid, "deliverable_updated", `"${title}"`, "deliverable", editingDel);
      setEditingDel(null);
      fetchAll();
    }
  }

  async function deleteDeliverable(item: Deliverable) {
    if (!window.confirm(`Delete "${item.title}"? All sub-tasks will be removed too.`)) return;
    const { error, count } = await db()
      .from("defense_deliverables")
      .delete()
      .eq("id", item.id)
      .select("id", { count: "exact", head: true });
    if (error) toast.error(error.message);
    else if (count === 0) {
      toast.error("You don't have permission to delete this deliverable");
    } else {
      toast.success("Deliverable deleted");
      logActivity(pid, "deliverable_updated", `Deleted "${item.title}"`);
      if (editingDel === item.id) setEditingDel(null);
      fetchAll();
    }
  }

  function setDeadline(value: string) {
    if (!pid) return;
    updateProject(pid, { finalDefenseDate: value });
    logActivity(
      pid,
      "defense_date_set",
      value ? `Final defense date set to ${value}` : "Final defense date cleared",
    );
  }

  async function submitFeedback() {
    if (!pid || !fbForm.content.trim()) {
      toast.error("Feedback content is required");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await db().from("feedback").insert({
      project_id: pid,
      chapter: fbForm.chapter,
      category: fbForm.category,
      content: fbForm.content.trim(),
      author_id: user.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Feedback logged");
      logActivity(
        pid,
        "feedback_added",
        `${fbForm.category.replace("_", " ")} on ${fbForm.chapter}`,
        "feedback",
      );
      setFbForm({ ...fbForm, content: "" });
      fetchAll();
    }
  }

  async function markFeedbackStatus(item: FeedbackRow, status: string) {
    const { error } = await db()
      .from("feedback")
      .update({ status, resolved_at: status === "open" ? null : new Date().toISOString() })
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else {
      logActivity(pid!, "feedback_addressed", `Marked feedback as ${status}`);
      fetchAll();
    }
  }

  function startEditFeedback(item: FeedbackRow) {
    setEditingFb(item.id);
    setEditFbForm({ chapter: item.chapter, category: item.category, content: item.content });
  }

  async function saveFeedbackEdit() {
    if (!pid || !editingFb) return;
    if (!editFbForm.content.trim()) {
      toast.error("Feedback content is required");
      return;
    }
    const { error } = await db()
      .from("feedback")
      .update({
        chapter: editFbForm.chapter,
        category: editFbForm.category,
        content: editFbForm.content.trim(),
      })
      .eq("id", editingFb);
    if (error) toast.error(error.message);
    else {
      toast.success("Feedback updated");
      logActivity(pid, "feedback_updated", editFbForm.content.slice(0, 80), "feedback", editingFb);
      setEditingFb(null);
      fetchAll();
    }
  }

  async function deleteFeedback(item: FeedbackRow) {
    const { error, count } = await db()
      .from("feedback")
      .delete()
      .eq("id", item.id)
      .select("id", { count: "exact", head: true });
    if (error) toast.error(error.message);
    else if (count === 0) {
      toast.error("You don't have permission to delete this feedback");
    } else {
      toast.success("Feedback deleted");
      logActivity(pid!, "feedback_deleted", item.content.slice(0, 80), "feedback", item.id);
      if (editingFb === item.id) setEditingFb(null);
      fetchAll();
    }
  }

  async function convertToDeliverable(item: FeedbackRow) {
    if (!pid) return;
    const title = item.content.length > 80 ? `${item.content.slice(0, 77)}...` : item.content;
    const { error } = await db()
      .from("defense_deliverables")
      .insert({
        project_id: pid,
        title,
        description: `[Adviser feedback - ${item.chapter}] ${item.content}`,
        sort_order: items.length,
      });
    if (error) toast.error(error.message);
    else {
      logActivity(pid, "feedback_task", `"${title}" added to deliverables`, "feedback", item.id);
      const { error: fbError } = await db()
        .from("feedback")
        .update({ task_created: true, status: "addressed", resolved_at: new Date().toISOString() })
        .eq("id", item.id);
      if (fbError) toast.error(fbError.message);
      else {
        toast.success("Converted to a defense deliverable");
        fetchAll();
      }
    }
  }

  async function addSubtask(item: Deliverable) {
    const form = subForms[item.id];
    const title = form?.title.trim();
    if (!title || !pid) return;
    const { error } = await db().from("defense_subtasks").insert({
      deliverable_id: item.id,
      project_id: pid,
      title,
      assignee: form.assignee.trim(),
      created_by: uid,
    });
    if (error) toast.error(error.message);
    else {
      logActivity(
        pid,
        "deliverable_updated",
        `Sub-task "${title}" added to ${item.title}`,
        "deliverable",
        item.id,
      );
      setSubForms((prev) => ({ ...prev, [item.id]: { title: "", assignee: "" } }));
      fetchAll();
    }
  }

  async function toggleSubtask(st: SubTask) {
    const { error } = await db()
      .from("defense_subtasks")
      .update({ done: !st.done })
      .eq("id", st.id);
    if (error) toast.error(error.message);
    else fetchAll();
  }

  async function removeSubtask(st: SubTask) {
    const { error } = await db().from("defense_subtasks").delete().eq("id", st.id);
    if (error) toast.error(error.message);
    else fetchAll();
  }

  async function saveLink(item: Deliverable) {
    const url = linkForms[item.id]?.trim() ?? "";
    if (!url) return;
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const { error } = await db()
      .from("defense_deliverables")
      .update({ link_url: normalized })
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deliverable link saved");
      setLinkForms((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      fetchAll();
    }
  }

  async function clearLink(item: Deliverable) {
    const { error } = await db()
      .from("defense_deliverables")
      .update({ link_url: "" })
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deliverable link removed");
      fetchAll();
    }
  }

  const activeHealth: HealthStatus = computeAutoHealth(items, currentProject.finalDefenseDate, {
    tasks: tasks.filter((t) => t.projectId === pid),
  });

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Project Management" },
          { label: "Final Defense" },
          { label: currentProject.name },
        ]}
        status={{
          label: `${completed}/${items.length} completed · ${overdueCount} overdue · ${openFeedback} open notes`,
          tone: overdueCount > 0 || openFeedback > 0 ? "warn" : "info",
        }}
        actions={
          canManage ? (
            <button
              onClick={() => setShowAddItem((v) => !v)}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 flex items-center gap-1.5"
            >
              <Plus className="size-3.5" />
              Add Deliverable
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* ------------------------------ Roadmap summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 bg-card border border-border rounded-md space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
              <CalendarClock className="size-3.5" />
              Hard Deadline
            </div>
            <input
              type="date"
              value={currentProject.finalDefenseDate}
              onChange={(e) => setDeadline(e.target.value)}
              readOnly={!canManage}
              className={`w-full px-2 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary ${!canManage ? "opacity-70" : ""}`}
            />
          </div>

          <div className="p-4 bg-card border border-border rounded-md space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
              <CheckCircle2 className="size-3.5" />
              Completion Progress
            </div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
              <div
                className={`h-full ${pct === 100 ? "bg-success" : "bg-primary"} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {pct}% of deliverables fully completed
            </span>
          </div>

          <div className="p-4 bg-card border border-border rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
                <Target className="size-3.5" />
                Group Health
              </div>
              <span className="text-[9px] font-mono text-muted-foreground">auto</span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold ${HEALTH_META[activeHealth].chip}`}
            >
              <span className={`size-1.5 rounded-full ${HEALTH_META[activeHealth].dot}`} />
              {HEALTH_META[activeHealth].label.toUpperCase()}
            </span>
            <p className="text-[10px] text-muted-foreground">
              Updates automatically from task &amp; deliverable progress.
            </p>
          </div>
        </div>

        {/* ------------------------------ Add deliverable */}
        {showAddItem && canManage && (
          <div className="p-4 bg-card border border-primary/30 rounded-md space-y-3">
            <input
              placeholder="Deliverable title (e.g. Revised Chapter 3)"
              value={itemForm.title}
              onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
              className="w-full px-3 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
            />
            <input
              placeholder="Notes (optional)"
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              className="w-full px-3 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={itemForm.dueDate}
                onChange={(e) => setItemForm({ ...itemForm, dueDate: e.target.value })}
                className="px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
              />
              <button
                onClick={addItem}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------ Checklist */}
        <section>
          <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">
            Deliverables Checklist
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : items.length === 0 ? (
            <div className="text-center py-10 bg-card border border-border rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">
                No defense deliverables tracked yet for this group.
              </p>
              {canManage && (
                <button
                  onClick={generateDefaults}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110 inline-flex items-center gap-1.5"
                >
                  <Sparkles className="size-3.5" />
                  Generate Default Checklist
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3 items-start">
              {items.map((item) => {
                const subs = subtasks.filter((s) => s.deliverable_id === item.id);
                const doneCount = subs.filter((s) => s.done).length;
                const isOpen = expanded.has(item.id);
                const form = subForms[item.id] ?? { title: "", assignee: "" };
                const canWorkSubtasks = canManage || !isViewer;
                return (
                  <div
                    key={item.id}
                    className="bg-card border border-border rounded-md overflow-hidden flex flex-col"
                  >
                    <div className="p-4 pb-3 space-y-2">
                      {editingDel === item.id ? (
                        <div className="space-y-2">
                          <input
                            value={editDelForm.title}
                            onChange={(e) =>
                              setEditDelForm({ ...editDelForm, title: e.target.value })
                            }
                            className="w-full px-2 py-1.5 rounded bg-surface-2 border border-border text-sm font-medium focus:outline-none focus:border-primary"
                          />
                          <textarea
                            rows={2}
                            value={editDelForm.description}
                            onChange={(e) =>
                              setEditDelForm({ ...editDelForm, description: e.target.value })
                            }
                            placeholder="Description (optional)"
                            className="w-full px-2 py-1.5 rounded bg-surface-2 border border-border text-[11px] focus:outline-none focus:border-primary resize-y placeholder:text-muted-foreground/60"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={editDelForm.dueDate}
                              onChange={(e) =>
                                setEditDelForm({ ...editDelForm, dueDate: e.target.value })
                              }
                              className="px-2 py-1 rounded bg-surface-2 border border-border text-[10px] font-mono focus:outline-none focus:border-primary"
                            />
                            <button
                              onClick={() => void saveDeliverableEdit()}
                              className="px-2.5 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded hover:brightness-110"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingDel(null)}
                              className="px-2.5 py-1 text-[10px] font-medium rounded border border-border text-muted-foreground hover:bg-surface-2"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium leading-snug">{item.title}</span>
                            <div
                              className="flex-1 min-w-[64px] max-w-[160px] h-1.5 rounded-full bg-border/60 overflow-hidden"
                              title={
                                subs.length > 0
                                  ? `${doneCount}/${subs.length} sub-tasks done`
                                  : "No sub-tasks yet"
                              }
                            >
                              <div
                                className={`h-full rounded-full transition-all ${
                                  subs.length > 0 && doneCount === subs.length
                                    ? "bg-success"
                                    : "bg-primary"
                                }`}
                                style={{
                                  width:
                                    subs.length > 0
                                      ? `${Math.round((doneCount / subs.length) * 100)}%`
                                      : "0%",
                                }}
                              />
                            </div>
                            <span
                              className={`px-1.5 py-0.5 text-[9px] font-mono uppercase rounded shrink-0 ${STATUS_STYLES[item.status]}`}
                            >
                              {item.status.replace("_", " ")}
                            </span>
                            {item.link_url && (
                              <a
                                href={item.link_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 rounded text-primary hover:bg-primary/10 shrink-0"
                                title="Open deliverable link"
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                            )}
                            {item.status !== "submitted" &&
                              item.due_date &&
                              item.due_date < todayStr() && (
                                <span className="px-1.5 py-0.5 text-[9px] font-mono text-destructive bg-destructive/10 rounded shrink-0">
                                  OVERDUE
                                </span>
                              )}
                            {canManage && (
                              <span className="shrink-0 flex items-center gap-0.5 ml-0.5">
                                <button
                                  onClick={() => startEditDeliverable(item)}
                                  className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10"
                                  title="Edit deliverable"
                                >
                                  <Pencil className="size-3" />
                                </button>
                                <button
                                  onClick={() => void deleteDeliverable(item)}
                                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  title="Delete deliverable"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {item.description}
                            </p>
                          )}
                          {item.link_url && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <a
                                href={item.link_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-[10px] font-mono text-primary hover:bg-primary/20 transition-colors max-w-full"
                                title={item.link_url}
                              >
                                <ExternalLink className="size-3 shrink-0" />
                                <span className="truncate">{item.link_url}</span>
                              </a>
                              {canWorkSubtasks && (
                                <>
                                  <button
                                    onClick={() => {
                                      setLinkForms((prev) => ({ ...prev, [item.id]: item.link_url ?? "" }));
                                      setExpanded((prev) => new Set(prev).add(item.id));
                                    }}
                                    className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0"
                                    title="Edit link"
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                  <button
                                    onClick={() => void clearLink(item)}
                                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                                    title="Remove link"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
                            {item.due_date && (
                              <span
                                className={
                                  item.status !== "submitted" && item.due_date < todayStr()
                                    ? "text-destructive font-medium"
                                    : ""
                                }
                              >
                                Due: {item.due_date}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-auto px-4 py-2 border-t border-border bg-surface-2/40 flex items-center gap-1.5">
                      {subs.length === 0 && canWorkSubtasks && (
                        <button
                          onClick={() => toggleExpand(item.id)}
                          className={`px-2 py-1 text-[10px] font-mono rounded border inline-flex items-center gap-1 ${
                            isOpen
                              ? "border-primary/40 text-primary bg-primary/5"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                          title="Add sub-tasks"
                        >
                          Sub-tasks
                          {isOpen ? (
                            <ChevronDown className="size-3" />
                          ) : (
                            <ChevronRight className="size-3" />
                          )}
                        </button>
                      )}
                    </div>

                    {(subs.length > 0 || isOpen) && (
                      <div className="border-t border-border bg-surface-2/30 px-4 py-3 space-y-1.5">
                        {isOpen && canWorkSubtasks && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void saveLink(item);
                            }}
                            className="flex items-center gap-2 pb-1.5"
                          >
                            <ExternalLink className="size-3.5 text-muted-foreground shrink-0" />
                            <input
                              value={linkForms[item.id] ?? item.link_url ?? ""}
                              onChange={(e) =>
                                setLinkForms((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              placeholder="Deliverable link (Google Docs, Drive, Figma…)"
                              className="flex-1 min-w-0 px-2 py-1 rounded bg-surface-2 border border-border text-[11px] focus:outline-none focus:border-primary placeholder:text-muted-foreground/60"
                            />
                            <button
                              type="submit"
                              disabled={!(linkForms[item.id] ?? item.link_url ?? "").trim()}
                              className="px-2 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded disabled:opacity-40 hover:brightness-110 shrink-0"
                            >
                              Save
                            </button>
                          </form>
                        )}
                        {subs.length === 0 && (
                          <p className="text-[11px] text-muted-foreground italic">
                            No sub-tasks yet — break this deliverable down into member work items.
                          </p>
                        )}
                        {(isOpen ? subs : subs.slice(0, 2)).map((st) => {
                          const stAuthor = st.created_by ? profiles.get(st.created_by) : null;
                          return (
                            <div key={st.id} className="flex items-center gap-2 text-xs group/sub">
                              <button
                                onClick={() => toggleSubtask(st)}
                                className={`size-4 shrink-0 rounded border grid place-items-center transition-colors ${
                                  st.done
                                    ? "bg-success border-success text-primary-foreground"
                                    : "border-border hover:border-success"
                                }`}
                                title={st.done ? "Mark not done" : "Mark done"}
                              >
                                {st.done && <CheckCircle2 className="size-3" />}
                              </button>
                              <span className={st.done ? "line-through text-muted-foreground" : ""}>
                                {st.title}
                              </span>
                              {st.assignee && (
                                <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase rounded bg-primary/10 text-primary">
                                  {st.assignee}
                                </span>
                              )}
                              <span className="ml-auto text-[9px] text-muted-foreground shrink-0 flex items-center gap-2">
                                {stAuthor ? `by ${stAuthor}` : ""}
                                {(canManage || st.created_by === uid) && (
                                  <button
                                    onClick={() => removeSubtask(st)}
                                    className="opacity-0 group-hover/sub:opacity-100 text-destructive hover:bg-destructive/10 rounded p-0.5"
                                    title="Delete sub-task"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                )}
                              </span>
                            </div>
                          );
                        })}
                        {!isOpen && subs.length > 2 && (
                          <button
                            onClick={() => toggleExpand(item.id)}
                            className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1 pt-0.5"
                          >
                            View all {subs.length} sub-tasks
                            <ChevronDown className="size-3" />
                          </button>
                        )}
                        {isOpen && subs.length > 2 && (
                          <button
                            onClick={() => toggleExpand(item.id)}
                            className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1 pt-0.5"
                          >
                            Show less
                            <ChevronUp className="size-3" />
                          </button>
                        )}
                        {!isOpen && subs.length > 0 && subs.length <= 2 && canWorkSubtasks && (
                          <button
                            onClick={() => toggleExpand(item.id)}
                            className="text-[10px] font-mono text-muted-foreground hover:text-primary inline-flex items-center gap-1 pt-0.5"
                          >
                            <Plus className="size-3" />
                            Add sub-task
                          </button>
                        )}
                        {isOpen && canWorkSubtasks && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void addSubtask(item);
                            }}
                            className="flex items-center gap-2 pt-1"
                          >
                            <Plus className="size-3.5 text-muted-foreground shrink-0" />
                            <input
                              value={form.title}
                              onChange={(e) =>
                                setSubForms((prev) => ({
                                  ...prev,
                                  [item.id]: { ...form, title: e.target.value },
                                }))
                              }
                              placeholder="Add a sub-task…"
                              className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/60"
                            />
                            <input
                              value={form.assignee}
                              onChange={(e) =>
                                setSubForms((prev) => ({
                                  ...prev,
                                  [item.id]: { ...form, assignee: e.target.value },
                                }))
                              }
                              list={`subtask-members-${item.id}`}
                              placeholder="assignee (optional)"
                              className="w-40 shrink-0 px-2 py-1 rounded bg-surface-2 border border-border text-[10px] focus:outline-none focus:border-primary placeholder:text-muted-foreground/60"
                            />
                            <datalist id={`subtask-members-${item.id}`}>
                              {developers.map((d) => (
                                <option key={d} value={d} />
                              ))}
                            </datalist>
                            <button
                              type="submit"
                              disabled={!form.title.trim()}
                              className="px-2 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded disabled:opacity-40 hover:brightness-110 shrink-0"
                            >
                              Add
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ------------------------------ Adviser feedback */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <MessageSquareWarning className="size-3.5" />
              Adviser Feedback
              {openFeedback > 0 && <span className="text-warning">({openFeedback} open)</span>}
            </h2>
          </div>

          {canGiveFeedback && (
            <div className="mb-4 p-4 bg-card border border-primary/30 rounded-md space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={fbForm.chapter}
                  onChange={(e) => setFbForm({ ...fbForm, chapter: e.target.value })}
                  className="px-3 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                >
                  {["General", ...CHAPTERS.filter((c) => c !== "Other"), "System"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={fbForm.category}
                  onChange={(e) => setFbForm({ ...fbForm, category: e.target.value })}
                  className="px-3 py-1.5 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary"
                >
                  <option value="comment">Comment</option>
                  <option value="change_request">Change Request</option>
                  <option value="approval">Approval</option>
                </select>
              </div>
              <textarea
                placeholder="Structured feedback, comments, or change requests..."
                rows={2}
                value={fbForm.content}
                onChange={(e) => setFbForm({ ...fbForm, content: e.target.value })}
                className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary resize-y"
              />
              <button
                onClick={submitFeedback}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:brightness-110"
              >
                Submit Feedback
              </button>
            </div>
          )}

          {feedback.length === 0 ? (
            <div className="text-center py-8 bg-card border border-border rounded-lg">
              <p className="text-sm text-muted-foreground">No feedback recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {feedback.map((item) => {
                const cat = CATEGORY_META[item.category] ?? CATEGORY_META.comment;
                const CatIcon = cat.icon;
                const canTouchFb = isAdmin || item.author_id === uid;
                return (
                  <div
                    key={item.id}
                    className="bg-card border border-border rounded-md p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase rounded ${cat.chip}`}
                      >
                        <CatIcon className="size-3" />
                        {cat.label}
                      </span>
                      <span className="px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground bg-surface-2 rounded">
                        {item.chapter}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-[9px] font-mono uppercase rounded ${FB_STATUS_STYLES[item.status]}`}
                      >
                        {item.status}
                      </span>
                      {item.task_created && (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono text-primary bg-primary/10 rounded">
                          CONVERTED
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {timeAgo(item.created_at)}
                      </span>
                    </div>

                    {editingFb === item.id ? (
                      <div className="space-y-2 pt-0.5">
                        <div className="grid gap-2 md:grid-cols-2">
                          <select
                            value={editFbForm.chapter}
                            onChange={(e) =>
                              setEditFbForm({ ...editFbForm, chapter: e.target.value })
                            }
                            className="px-2 py-1 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
                          >
                            {["General", ...CHAPTERS.filter((c) => c !== "Other"), "System"].map(
                              (c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ),
                            )}
                          </select>
                          <select
                            value={editFbForm.category}
                            onChange={(e) =>
                              setEditFbForm({ ...editFbForm, category: e.target.value })
                            }
                            className="px-2 py-1 rounded-md bg-surface-2 border border-border text-xs focus:outline-none focus:border-primary"
                          >
                            <option value="comment">Comment</option>
                            <option value="change_request">Change Request</option>
                            <option value="approval">Approval</option>
                          </select>
                        </div>
                        <textarea
                          rows={2}
                          value={editFbForm.content}
                          onChange={(e) =>
                            setEditFbForm({ ...editFbForm, content: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-md bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary resize-y"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void saveFeedbackEdit()}
                            className="px-2.5 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded hover:brightness-110"
                          >
                            Save Changes
                          </button>
                          <button
                            onClick={() => setEditingFb(null)}
                            className="px-2.5 py-1 text-[10px] font-medium rounded border border-border text-muted-foreground hover:bg-surface-2"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm">{item.content}</p>
                        <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                          {(isAdmin || isLeader || !isViewer) && item.status === "open" && (
                            <button
                              onClick={() => markFeedbackStatus(item, "addressed")}
                              className="px-2 py-1 text-[10px] font-medium rounded border border-success/30 text-success hover:bg-success/10 inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="size-3" />
                              Mark Addressed
                            </button>
                          )}
                          {canManage && item.status === "open" && (
                            <button
                              onClick={() => markFeedbackStatus(item, "dismissed")}
                              className="px-2 py-1 text-[10px] font-medium rounded border border-border text-muted-foreground hover:bg-surface-2 inline-flex items-center gap-1"
                            >
                              <XCircle className="size-3" />
                              Dismiss
                            </button>
                          )}
                          {canTouchFb && (
                            <>
                              <button
                                onClick={() => startEditFeedback(item)}
                                className="px-2 py-1 text-[10px] font-medium rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40 inline-flex items-center gap-1"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => void deleteFeedback(item)}
                                className="px-2 py-1 text-[10px] font-medium rounded border border-destructive/30 text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
                              >
                                Delete
                              </button>
                            </>
                          )}
                          {canManage && !item.task_created && (
                            <button
                              onClick={() => void convertToDeliverable(item)}
                              className="px-2 py-1 text-[10px] font-bold rounded bg-primary text-primary-foreground hover:brightness-110 inline-flex items-center gap-1 ml-auto"
                            >
                              <Target className="size-3" />
                              Convert to Deliverable
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
