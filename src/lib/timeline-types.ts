import type { Json } from "@/integrations/supabase/types";

export type TimelineKind = "phase" | "epic" | "task" | "milestone";

export type TimelineItem = {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  kind: TimelineKind;
  startDate: string;
  endDate: string;
  sortOrder: number;
  dependencies: string[];
  assignee: string;
  effort: string;
  notes: string;
  createdAt: string;
};

export function generateTimelineId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export type TimelineRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  kind: string;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
  dependencies: Json;
  assignee: string | null;
  effort: string | null;
  notes: string | null;
  created_at: string;
};

const KINDS: TimelineKind[] = ["phase", "epic", "task", "milestone"];

export function toDbTimeline(t: TimelineItem): Record<string, unknown> {
  return {
    id: t.id,
    project_id: t.projectId,
    parent_id: t.parentId,
    title: t.title,
    kind: t.kind,
    start_date: t.startDate || null,
    end_date: t.endDate || null,
    sort_order: t.sortOrder,
    dependencies: t.dependencies,
    assignee: t.assignee || null,
    effort: t.effort || null,
    notes: t.notes || null,
    created_at: t.createdAt,
  };
}

export function fromDbTimeline(r: TimelineRow): TimelineItem {
  const deps = Array.isArray(r.dependencies)
    ? (r.dependencies as unknown[]).filter((d): d is string => typeof d === "string")
    : [];
  const kind = KINDS.includes(r.kind as TimelineKind) ? (r.kind as TimelineKind) : "task";
  return {
    id: r.id,
    projectId: r.project_id,
    parentId: r.parent_id,
    title: r.title,
    kind,
    startDate: r.start_date || "",
    endDate: r.end_date || "",
    sortOrder: r.sort_order ?? 0,
    dependencies: deps,
    assignee: r.assignee || "",
    effort: r.effort || "",
    notes: r.notes || "",
    createdAt: r.created_at,
  };
}

export function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.title.localeCompare(b.title);
  });
}
