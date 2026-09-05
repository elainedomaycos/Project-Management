import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  DefectSmartContext,
  GeneratedDefect,
  GeneratedTask,
  TaskSmartContext,
} from "./ai.server";

// Client-facing RPC wrappers for the AI assistant. The actual Groq logic lives
// in ./ai.server (server-only) and is loaded lazily inside the handlers.

export const generateTaskFromPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: TaskSmartContext) => data)
  .handler(async ({ data }) => {
    const { generateTaskFromPrompt } = await import("./ai.server");
    return generateTaskFromPrompt(data);
  });

export const generateDefectFromPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: DefectSmartContext) => data)
  .handler(async ({ data }) => {
    const { generateDefectFromPrompt } = await import("./ai.server");
    return generateDefectFromPrompt(data);
  });

export type { GeneratedDefect, GeneratedTask, TaskSmartContext, DefectSmartContext };
