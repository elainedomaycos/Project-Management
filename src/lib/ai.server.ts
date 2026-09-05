import { z } from "zod";
import type { Task, TaskStatus } from "./project-context";

// Server-side only module. Never import this from the client bundle directly;
// it is loaded lazily inside the handlers in `./ai-assistant.ts`.

export type GeneratedTask = {
  title: string;
  description: string;
  module: string;
  field: string;
  priority: Task["priority"];
};

export type GeneratedDefect = {
  title: string;
  module: string;
  environment: string;
  precondition: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  priority: "Low" | "Medium" | "High";
  relatedTaskIds: string[];
};

export type TaskSmartContext = {
  prompt: string;
  projectName: string;
  modules: string[];
  fields: string[];
};

export type DefectSmartContext = {
  prompt: string;
  projectName: string;
  modules: string[];
  tasks: {
    taskId: string;
    title: string;
    module: string;
    field: string;
    status: TaskStatus;
    developer: string;
  }[];
};

const generatedTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  module: z.string().default(""),
  field: z.string().default(""),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

const generatedDefectSchema = z.object({
  title: z.string().min(1),
  module: z.string().default(""),
  environment: z.string().default(""),
  precondition: z.string().default(""),
  stepsToReproduce: z.string().default(""),
  expectedResult: z.string().default(""),
  actualResult: z.string().default(""),
  severity: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  priority: z.enum(["Low", "Medium", "High"]).default("Medium"),
  relatedTaskIds: z.array(z.string()).default([]),
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

async function callGroqJson(system: string, user: string): Promise<unknown> {
  // GROQ_API_KEY is read server-side; VITE_GROQ_API_KEY is kept as a dev fallback
  // so the feature works locally without exporting a VITE_ prefixed secret.
  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error("Groq API key not configured");

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
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
  return extractJson(content);
}

function taskSystemPrompt(): string {
  return (
    "You are a senior product manager embedded in a capstone project management tool. " +
    "The user types a natural-language feature request. Convert it into a structured Feature Task as a JSON object. " +
    "The current project name and its configured modules and allowed fields are provided. " +
    "Choose the closest matching 'module' from the configured modules list (or an empty string if none match). " +
    "Choose 'field' from the given fields list (or an empty string). " +
    "Infer a sensible 'priority' (low/medium/high/critical) from urgency keywords only; default to medium. " +
    "'title' must be a concise imperative summary (e.g. 'Add forgot-password page'); 'description' recaps the request including implied acceptance criteria. " +
    "Return ONLY a JSON object: { title, description, module, field, priority }."
  );
}

function defectSystemPrompt(): string {
  return (
    "You are a senior QA engineer embedded in a capstone project management tool. " +
    "The user describes a bug or defect in natural language. Convert it into a structured Defect as a JSON object. " +
    "The current project name, its configured modules, and the existing feature tasks are provided. " +
    "Choose the closest matching 'module' from the configured modules list (or an empty string if none match). " +
    "Write realistic values for 'environment' (browser/OS), 'precondition', 'stepsToReproduce' (numbered list), " +
    "'expectedResult', and 'actualResult'. " +
    "Infer 'severity' (Low/Medium/High/Critical) and 'priority' (Low/Medium/High) from user impact. " +
    "Inspect the provided feature tasks (taskId, title, module, field, status, developer) and set 'relatedTaskIds' " +
    "to the exact taskIds of the tasks this defect most likely corresponds to (match by module, feature area, or title keywords), " +
    "at most 3, or an empty array if none correspond. " +
    "Return ONLY a JSON object with exactly these keys: " +
    "title, module, environment, precondition, stepsToReproduce, expectedResult, actualResult, severity, priority, relatedTaskIds."
  );
}

function taskUserPrompt(p: TaskSmartContext): string {
  const lines = [`Project: ${p.projectName || "Unnamed project"}`];
  if (p.modules.length) lines.push(`Configured modules: ${p.modules.join(", ")}`);
  if (p.fields.length) lines.push(`Available fields: ${p.fields.join(", ")}`);
  lines.push(`User request: ${p.prompt}`);
  return lines.join("\n");
}

function defectUserPrompt(p: DefectSmartContext): string {
  const lines = [`Project: ${p.projectName || "Unnamed project"}`];
  if (p.modules.length) lines.push(`Configured modules: ${p.modules.join(", ")}`);
  lines.push("Existing feature tasks (taskId | title | module | field | status | developer):");
  if (p.tasks.length) {
    for (const t of p.tasks) {
      lines.push(
        `- ${t.taskId} | ${t.title} | ${t.module || "-"} | ${t.field || "-"} | ${t.status} | ${t.developer || "-"}`,
      );
    }
  } else {
    lines.push("- (none yet)");
  }
  lines.push(`Bug report from user: ${p.prompt}`);
  return lines.join("\n");
}

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

function matchAllowed(value: string, allowed: string[]): string {
  const v = value.trim();
  if (!v) return "";
  if (allowed.includes(v)) return v;
  const lower = v.toLowerCase();
  const found = allowed.find((a) => a.toLowerCase() === lower);
  if (found) return found;
  const fuzzy = allowed.find((a) => {
    const al = a.toLowerCase();
    return al.includes(lower) || lower.includes(al);
  });
  return fuzzy ?? (v.length <= 40 ? v : "");
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function pickModule(lower: string, modules: string[]): string {
  for (const m of modules) {
    if (m && lower.includes(m.toLowerCase())) return m;
  }
  return "";
}

function pickField(lower: string): string {
  if (/\btest|testing\b/.test(lower)) return "Testing";
  if (/\bdatabase|\bdb\b|schema|migration|query\b/.test(lower)) return "Database";
  if (/\bapi|\bserver\b|backend|endpoint|\bauth\b|login|integration\b/.test(lower))
    return "Back End";
  if (
    /\bui\b|\bux\b|frontend|front-end|page|screen|button|modal|\bform\b|design|style|css\b/.test(
      lower,
    )
  )
    return "Front End";
  return "";
}

function pickTaskPriority(lower: string): GeneratedTask["priority"] {
  if (/\basap|urgent|critical|emergency|now\b|must|security|crash\b/.test(lower)) return "high";
  if (/\bnice to have|optional|minor|polish|cosmetic|stretch\b/.test(lower)) return "low";
  return "medium";
}

function pickSeverity(lower: string): GeneratedDefect["severity"] {
  if (
    /\bcrash|security|data loss|\bdown\b|blank|broken|can't load|cannot load|account|payment\b/.test(
      lower,
    )
  )
    return "High";
  if (/\berror|failed|fails|wrong|not working|misbehav|\bbug\b/.test(lower)) return "Medium";
  if (/\btypo|spelling|cosmetic|alignment|color|style\b/.test(lower)) return "Low";
  return "Medium";
}

function pickPriority(lower: string): GeneratedDefect["priority"] {
  if (/\bcrash|security|data loss|blocker|down|blank|broken|cannot|account|payment\b/.test(lower))
    return "High";
  if (/\btypo|spelling|cosmetic|alignment|color|style|minor\b/.test(lower)) return "Low";
  return "Medium";
}

function matchRelatedTasks(lower: string, tasks: DefectSmartContext["tasks"]): string[] {
  const lowerWords = new Set(
    lower
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  const hits: string[] = [];
  for (const t of tasks) {
    if (hits.length >= 3) break;
    let score = 0;
    if (t.module && lower.includes(t.module.toLowerCase())) score += 2;
    for (const w of t.title.toLowerCase().split(/\W+/)) {
      if (w.length > 3 && lowerWords.has(w)) {
        score += 1;
        break;
      }
    }
    if (score > 0) hits.push(t.taskId);
  }
  return hits;
}

function mockTask(p: TaskSmartContext): GeneratedTask {
  const q = p.prompt.trim();
  const lower = q.toLowerCase();
  const title = q.split(/\n/)[0].slice(0, 120);
  return {
    title,
    description: q,
    module: pickModule(lower, p.modules),
    field: pickField(lower),
    priority: pickTaskPriority(lower),
  };
}

function mockDefect(p: DefectSmartContext): GeneratedDefect {
  const q = p.prompt.trim();
  const lower = q.toLowerCase();
  return {
    title: q.split(/\n/)[0].slice(0, 120) || "Untitled bug",
    module: pickModule(lower, p.modules),
    environment: "Chrome / Windows 11",
    precondition: "Navigate to the reported screen while logged in.",
    stepsToReproduce:
      "1. Reproduce the reported scenario.\n2. Follow the description carefully.\n3. Observe the result.",
    expectedResult: "The reported flow behaves as expected.",
    actualResult: q,
    severity: pickSeverity(lower),
    priority: pickPriority(lower),
    relatedTaskIds: matchRelatedTasks(lower, p.tasks),
  };
}

export async function generateTaskFromPrompt(payload: TaskSmartContext): Promise<GeneratedTask> {
  try {
    const raw = await callGroqJson(taskSystemPrompt(), taskUserPrompt(payload));
    const rec = asRecord(raw);
    const parsed = generatedTaskSchema.safeParse({
      title: String(rec.title ?? "").trim(),
      description: String(rec.description ?? "").trim(),
      module: String(rec.module ?? "").trim(),
      field: String(rec.field ?? "").trim(),
      priority: String(rec.priority ?? "medium")
        .trim()
        .toLowerCase(),
    });
    if (!parsed.success) return mockTask(payload);
    return {
      title: parsed.data.title,
      description: parsed.data.description,
      module: matchAllowed(parsed.data.module, payload.modules),
      field: matchAllowed(parsed.data.field, payload.fields),
      priority: parsed.data.priority,
    };
  } catch {
    return mockTask(payload);
  }
}

export async function generateDefectFromPrompt(
  payload: DefectSmartContext,
): Promise<GeneratedDefect> {
  try {
    const raw = await callGroqJson(defectSystemPrompt(), defectUserPrompt(payload));
    const rec = asRecord(raw);
    const parsed = generatedDefectSchema.safeParse({
      title: String(rec.title ?? "").trim(),
      module: String(rec.module ?? "").trim(),
      environment: String(rec.environment ?? "").trim(),
      precondition: String(rec.precondition ?? "").trim(),
      stepsToReproduce: String(rec.stepsToReproduce ?? "").trim(),
      expectedResult: String(rec.expectedResult ?? "").trim(),
      actualResult: String(rec.actualResult ?? "").trim(),
      severity: titleCase(String(rec.severity ?? "Medium").trim()),
      priority: titleCase(String(rec.priority ?? "Medium").trim()),
      relatedTaskIds: Array.isArray(rec.relatedTaskIds)
        ? (rec.relatedTaskIds.filter((x): x is string => typeof x === "string") as string[])
        : [],
    });
    if (!parsed.success) return mockDefect(payload);
    const related: string[] = [];
    for (const id of parsed.data.relatedTaskIds) {
      if (related.length >= 3) break;
      const found = payload.tasks.find((t) => t.taskId.toLowerCase() === id.toLowerCase());
      if (found && !related.includes(found.taskId)) related.push(found.taskId);
    }
    return {
      title: parsed.data.title,
      module: matchAllowed(parsed.data.module, payload.modules),
      environment: parsed.data.environment,
      precondition: parsed.data.precondition,
      stepsToReproduce: parsed.data.stepsToReproduce,
      expectedResult: parsed.data.expectedResult,
      actualResult: parsed.data.actualResult,
      severity: parsed.data.severity,
      priority: parsed.data.priority,
      relatedTaskIds: related,
    };
  } catch {
    return mockDefect(payload);
  }
}
