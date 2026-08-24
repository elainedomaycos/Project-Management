import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "./project-context";
import {
  fromDbTimeline,
  generateTimelineId,
  sortTimeline,
  toDbTimeline,
  type TimelineItem,
  type TimelineRow,
} from "./timeline-types";
import type { AiResult, AiTimelineItem } from "./planner-ai";

const TimelineContext = createContext<TimelineContextType | null>(null);

let realtimeSeq = 0;

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

type TimelineContextType = {
  items: TimelineItem[];
  loading: boolean;
  suggestion: AiResult | null;
  setSuggestion: (s: AiResult | null) => void;
  saveItem: (item: TimelineItem) => void;
  deleteItem: (id: string) => void;
  replaceAll: (items: TimelineItem[]) => void;
  applySuggestion: (onApplied?: (items: TimelineItem[]) => void) => void;
  discardSuggestion: () => void;
};

function resolveAiItems(
  ai: AiTimelineItem[],
  existing: TimelineItem[],
  projectId: string,
): TimelineItem[] {
  const idByTitle = new Map<string, string>();
  for (const it of existing) idByTitle.set(it.title, it.id);
  const created = new Map<string, TimelineItem>();
  for (const it of ai) {
    const id = idByTitle.get(it.title) ?? generateTimelineId();
    idByTitle.set(it.title, id);
    created.set(it.title, {
      id,
      projectId,
      parentId: null,
      title: it.title,
      kind: it.kind,
      startDate: it.startDate,
      endDate: it.endDate,
      sortOrder: ai.indexOf(it),
      dependencies: [],
      assignee: it.assignee || "",
      effort: it.effort || "",
      notes: it.notes || "",
      createdAt: new Date().toISOString(),
    });
  }
  return ai.map((it) => {
    const base = created.get(it.title)!;
    return {
      ...base,
      parentId: it.parent ? (idByTitle.get(it.parent) ?? null) : null,
      dependencies: it.dependencies.map((d) => idByTitle.get(d) ?? "").filter((id) => id !== ""),
    };
  });
}

export function TimelineProvider({ children }: { children: ReactNode }) {
  const { currentProject } = useProject();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<AiResult | null>(null);

  const projectId = currentProject?.id ?? "";

  useEffect(() => {
    if (!projectId) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    db()
      .from("timeline_items")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order")
      .then((res: { data: TimelineRow[] | null }) => {
        if (cancelled) return;
        setItems((res.data ?? []).map(fromDbTimeline));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`timeline-changes:${++realtimeSeq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "timeline_items" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = payload.old?.id;
            setItems((prev) => prev.filter((i) => i.id !== id));
          } else if (payload.eventType === "INSERT") {
            const it = fromDbTimeline(payload.new as TimelineRow);
            setItems((prev) =>
              prev.some((i) => i.id === it.id) ? prev : sortTimeline([...prev, it]),
            );
          } else if (payload.eventType === "UPDATE") {
            const it = fromDbTimeline(payload.new as TimelineRow);
            setItems((prev) => sortTimeline(prev.map((i) => (i.id === it.id ? it : i))));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  function saveItem(item: TimelineItem) {
    setItems((prev) =>
      prev.some((i) => i.id === item.id)
        ? sortTimeline(prev.map((i) => (i.id === item.id ? item : i)))
        : sortTimeline([...prev, item]),
    );
    db()
      .from("timeline_items")
      .upsert(toDbTimeline(item))
      .then(
        () => {},
        () => {},
      );
  }

  function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    db()
      .from("timeline_items")
      .delete()
      .eq("id", id)
      .then(
        () => {},
        () => {},
      );
  }

  function replaceAll(next: TimelineItem[]) {
    setItems(sortTimeline(next));
    db()
      .from("timeline_items")
      .delete()
      .eq("project_id", projectId)
      .then(() => {
        if (next.length) {
          db()
            .from("timeline_items")
            .insert(next.map(toDbTimeline))
            .then(
              () => {},
              () => {},
            );
        }
      })
      .catch(() => {});
  }

  function applySuggestion(onApplied?: (items: TimelineItem[]) => void) {
    if (!suggestion) return;
    const resolved = resolveAiItems(suggestion.items, items, projectId);
    replaceAll(resolved);
    setSuggestion(null);
    onApplied?.(resolved);
  }

  function discardSuggestion() {
    setSuggestion(null);
  }

  return (
    <TimelineContext.Provider
      value={{
        items,
        loading,
        suggestion,
        setSuggestion,
        saveItem,
        deleteItem,
        replaceAll,
        applySuggestion,
        discardSuggestion,
      }}
    >
      {children}
    </TimelineContext.Provider>
  );
}

export function useTimeline() {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error("useTimeline must be used within TimelineProvider");
  return ctx;
}
