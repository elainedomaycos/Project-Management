import { z } from "zod";

export type AiTimelineItem = {
  id?: string;
  kind: "phase" | "epic" | "task" | "milestone";
  title: string;
  parent?: string;
  startDate: string;
  endDate: string;
  dependencies: string[];
  assignee: string;
  effort: string;
  notes: string;
};

export type PlannerInput = {
  title: string;
  description: string;
  endUsers: string[];
  modules: string[];
  startDate: string;
  deadline: string;
  teamSize: number;
};

export type PlannerTask = {
  title: string;
  status: string;
  startDate: string;
  dueDate: string;
  developer: string;
};

export type PlannerContext = {
  items: AiTimelineItem[];
  tasks: PlannerTask[];
};

export type AiResult = {
  summary: string;
  items: AiTimelineItem[];
};

export type PlannerAction =
  | "generate"
  | "regenerate"
  | "optimize"
  | "conflicts"
  | "balance"
  | "critical"
  | "milestones"
  | "deadline";

const aiItemSchema = z.object({
  kind: z.enum(["phase", "epic", "task", "milestone"]),
  title: z.string().min(1),
  parent: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  dependencies: z.array(z.string()).default([]),
  assignee: z.string().default(""),
  effort: z.string().default(""),
  notes: z.string().default(""),
});

const aiResultSchema = z.object({
  summary: z.string(),
  items: z.array(aiItemSchema),
});

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to brace matching
  }
  const start = trimmed.indexOf("{");
  if (start === -1) throw new Error("AI did not return a JSON object");
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    if (trimmed[i] === "{") depth++;
    else if (trimmed[i] === "}") {
      depth--;
      if (depth === 0) return JSON.parse(trimmed.slice(start, i + 1));
    }
  }
  throw new Error("AI returned unparseable JSON");
}

function dateRange(input: PlannerInput): string {
  const start = input.startDate || "today";
  const end = input.deadline || "not specified";
  return `${start} to ${end}`;
}

function buildContext(input: PlannerInput, ctx: PlannerContext, action: PlannerAction): string {
  const lines: string[] = [];
  lines.push(`Project: ${input.title}`);
  if (input.description) lines.push(`Description: ${input.description}`);
  if (input.endUsers.length) lines.push(`End users: ${input.endUsers.join(", ")}`);
  if (input.modules.length) lines.push(`Modules: ${input.modules.join(", ")}`);
  lines.push(`Planned timeframe: ${dateRange(input)}`);
  lines.push(`Team size: ${input.teamSize || "unknown"} developer(s)`);

  if (ctx.tasks.length) {
    const done = ctx.tasks.filter((t) => t.status === "done").length;
    lines.push(`Existing Scrum tasks: ${ctx.tasks.length} total, ${done} done`);
    const inProgress = ctx.tasks.filter((t) => t.status === "in-progress");
    if (inProgress.length) {
      lines.push(`In progress: ${inProgress.map((t) => `"${t.title}"`).join(", ")}`);
    }
  } else {
    lines.push("Existing Scrum tasks: none yet");
  }

  if (ctx.items.length) {
    lines.push("Current plan items (title | kind | parent | start | end | dependencies):");
    for (const it of ctx.items) {
      lines.push(
        `- "${it.title}" | ${it.kind} | parent=${it.parent || "-"} | ${it.startDate}→${it.endDate} | deps=${it.dependencies.join(",") || "-"}`,
      );
    }
  }
  return lines.join("\n");
}

function systemPrompt(action: PlannerAction): string {
  const base =
    "You are a senior software project planner. You produce a structured Gantt-style plan as a JSON object. " +
    "The plan must be realistic, dependency-aware, and fit inside the project's start and deadline dates. " +
    "Every date must be in YYYY-MM-DD format and lie within the given timeframe. " +
    "If the team is 1 developer, plan sequentially with realistic overlap. Tasks should not start before their dependencies finish. " +
    "Assign each item an assignee (a role like 'Developer' or 'Designer', or a specific name if provided). " +
    "Use 'effort' as a short string like '2d', '1w'. Use 'notes' sparingly for key assumptions. " +
    "Return ONLY a JSON object with shape: { summary: string, items: array of items }." +
    "Each item: { kind: 'phase'|'epic'|'task'|'milestone', title: string, parent?: string (exact title of the containing phase or epic), " +
    "startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', dependencies: array of exact item titles this depends on, " +
    "assignee: string, effort: string, notes: string }. " +
    "Rules: phases are top-level (no parent). Epics belong to a phase (parent = phase title). Tasks belong to an epic (parent = epic title). " +
    "Milestones are top-level or children of a phase; a milestone marks the end of a phase or epic, give it a zero-width duration (startDate == endDate) and reference the phase/epic it closes via 'parent'. " +
    "Keep the total count reasonable (5-25 items). Indent logic must produce a clean tree.";

  switch (action) {
    case "optimize":
      return (
        base +
        " ACTION: Optimize the existing plan. Tighten the schedule, remove unnecessary waiting gaps, " +
        "reorder tasks so critical-path work starts earliest, and keep all dates within the timeframe. " +
        "Keep the same item titles and kinds unless you are merging/removing genuinely redundant items. Explain what you changed in 'summary'."
      );
    case "conflicts":
      return (
        base +
        " ACTION: Audit the existing plan. Detect scheduling conflicts: tasks overlapping the same assignee in parallel, " +
        "dependencies whose dates violate the dependency (child starts before parent finishes), items outside the timeframe, " +
        "or orphans (tasks without a parent). In 'summary', list each conflict found and its fix. In 'items', return the plan WITH the conflicts fixed."
      );
    case "balance":
      return (
        base +
        " ACTION: Balance team workload. Redistribute tasks so no single assignee is overloaded while respecting dependencies and dates. " +
        "Spread work across the team size. Explain reassignments in 'summary'."
      );
    case "critical":
      return (
        base +
        " ACTION: Identify the critical path. In 'summary', name the critical-path sequence explicitly and explain its total estimated duration. " +
        "In 'items', keep the plan but mark critical-path items' notes with '[CRITICAL]' and ensure their dates are tight and consistent."
      );
    case "milestones":
      return (
        base +
        " ACTION: Insert milestone items into the plan. Add a milestone at the end of each major phase and at the project deadline. " +
        "Each milestone has startDate == endDate and its parent set to the phase it closes (or left empty for the final delivery milestone). " +
        "Explain the milestones in 'summary'."
      );
    case "deadline":
      return (
        base +
        " ACTION: Re-plan to fit an updated deadline. Compress the schedule so everything completes by the given deadline: " +
        "cut or merge lowest-value tasks, parallelize where possible, shorten buffer. Keep must-have scope. " +
        "If the deadline is impossible, still produce the tightest realistic plan and say so in 'summary'."
      );
    case "regenerate":
      return (
        base +
        " ACTION: Regenerate the plan from scratch using the project input, the existing Scrum task list, and current progress. " +
        "Keep items already done (or their equivalents) but shorten them. Reflect real progress in dates."
      );
    default:
      return base;
  }
}

function normalizeResult(raw: unknown): AiResult {
  const parsed = aiResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `AI returned an invalid plan: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  const items = parsed.data.items.map((it) => ({
    kind: it.kind,
    title: it.title,
    parent: it.parent,
    startDate: it.startDate,
    endDate: it.endDate,
    dependencies: it.dependencies,
    assignee: it.assignee,
    effort: it.effort,
    notes: it.notes,
  }));
  return { summary: parsed.data.summary, items };
}

async function callGroq(system: string, user: string): Promise<AiResult> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error("Groq API key not configured");

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error: ${err}`);
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("AI returned an empty response");
  return normalizeResult(extractJson(content));
}

export async function runAiAction(
  action: PlannerAction,
  input: PlannerInput,
  ctx: PlannerContext,
): Promise<AiResult> {
  const system = systemPrompt(action);
  const user =
    action === "generate" || action === "regenerate"
      ? `Create the project plan.\n\n${buildContext(input, ctx, action)}`
      : `Here is the current plan and context. Apply the requested action.\n\n${buildContext(input, ctx, action)}`;
  return callGroq(system, user);
}

export async function runCustom(
  instruction: string,
  input: PlannerInput,
  ctx: PlannerContext,
): Promise<AiResult> {
  const system =
    "You are a senior software project planner embedded in a planning tool. " +
    "The user gives a natural-language request about their project plan. Apply their intent to the plan. " +
    "Return ONLY a JSON object: { summary: string, items: array } with the same item rules as always " +
    "(kind, title, parent by exact title, dates YYYY-MM-DD inside the timeframe, dependencies by exact title, assignee, effort, notes). " +
    "Keep the existing items unless the request changes them; make only the edits the user asked for. " +
    "If the request only needs an answer with no plan change, keep items identical and explain in summary.";
  const user = `User request:\n${instruction}\n\nProject context:\n${buildContext(input, ctx, "generate")}`;
  return callGroq(system, user);
}
