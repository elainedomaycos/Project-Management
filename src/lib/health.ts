import type { Task } from "@/lib/project-context";

export type HealthStatus = "on_track" | "at_risk" | "behind";
export type HealthSource = "auto" | "manual";

export const HEALTH_META: Record<HealthStatus, { label: string; dot: string; chip: string }> = {
  on_track: {
    label: "On Track",
    dot: "bg-success",
    chip: "text-success bg-success/10 border-success/30",
  },
  at_risk: {
    label: "At Risk",
    dot: "bg-warning",
    chip: "text-warning bg-warning/10 border-warning/30",
  },
  behind: {
    label: "Behind Schedule",
    dot: "bg-destructive",
    chip: "text-destructive bg-destructive/10 border-destructive/30",
  },
};

export type HealthDeliverable = {
  due_date: string | null;
  status: string;
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  return Math.round(
    (new Date(`${dateStr}T00:00:00`).getTime() - new Date(`${todayStr()}T00:00:00`).getTime()) /
      86_400_000,
  );
}

const RANK: Record<HealthStatus, number> = { on_track: 0, at_risk: 1, behind: 2 };

/**
 * Auto health from Final Defense deliverables + task/deliverable progress:
 * - any incomplete deliverable past its due date            -> behind
 * - any incomplete deliverable due within 7 days            -> at_risk
 * - final defense date reached with incomplete deliverables   -> behind
 * - progress pace vs. time left before the final defense:
 *     <=14 days out and <50% of all work done                 -> behind
 *     <=30 days out and <25% of all work done                 -> at_risk
 * Progress = (completed deliverables + done tasks) / (all deliverables + all tasks).
 */
export function computeAutoHealth(
  items: HealthDeliverable[],
  finalDefenseDate: string | null | undefined,
  opts?: { tasks?: Task[] },
): HealthStatus {
  let worst: HealthStatus = "on_track";
  const bump = (h: HealthStatus) => {
    if (RANK[h] > RANK[worst]) worst = h;
  };
  const today = todayStr();
  for (const i of items) {
    if (i.status === "submitted") continue;
    if (i.due_date && i.due_date < today) bump("behind");
    else if (i.due_date && daysUntil(i.due_date) <= 7) bump("at_risk");
  }
  const unfinished = items.filter((i) => i.status !== "submitted").length;
  if (finalDefenseDate && finalDefenseDate <= today && unfinished > 0) {
    bump("behind");
  }

  const taskList = opts?.tasks ?? [];
  if (finalDefenseDate && finalDefenseDate > today && (items.length > 0 || taskList.length > 0)) {
    const totalUnits = items.length + taskList.length;
    const doneUnits =
      items.filter((i) => i.status === "submitted").length +
      taskList.filter((t) => t.status === "done").length;
    const ratio = totalUnits > 0 ? doneUnits / totalUnits : 1;
    const daysLeft = daysUntil(finalDefenseDate);
    if (daysLeft <= 14 && ratio < 0.5) bump("behind");
    else if (daysLeft <= 30 && ratio < 0.25) bump("at_risk");
  }

  return worst;
}

export function taskOverdueCount(tasks: Task[]): number {
  const today = todayStr();
  return tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "done").length;
}

/**
 * Blend rule: manual overrides always win; auto recalculates otherwise.
 * Overdue scrum tasks alone can push an auto project to at_risk.
 */
export function effectiveHealth(
  stored: HealthStatus,
  source: HealthSource,
  opts?: { tasks?: Task[] },
): HealthStatus {
  if (source === "manual") return stored;
  if (opts?.tasks && taskOverdueCount(opts.tasks) >= 3) {
    return RANK[stored] >= RANK.at_risk ? stored : "at_risk";
  }
  return stored;
}
