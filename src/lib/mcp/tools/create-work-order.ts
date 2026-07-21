import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "create_work_order",
  title: "Create work order",
  description:
    "Create a new work order in Herald Property Management. Requires job_type and title. Job number is generated automatically.",
  inputSchema: {
    title: z.string().min(1).describe("Short summary of the maintenance job."),
    job_type: z.string().min(1).describe("Job type / category, e.g. Plumbing, HVAC, Electrical."),
    task_description: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    property_id: z.string().uuid().optional(),
    unit_id: z.string().uuid().optional(),
    tenant_id: z.string().uuid().optional(),
    due_at: z.string().optional().describe("ISO timestamp for the due date."),
    estimated_hours: z.number().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("work_orders")
      .insert({
        title: input.title,
        job_type: input.job_type,
        task_description: input.task_description ?? null,
        priority: input.priority ?? "medium",
        property_id: input.property_id ?? null,
        unit_id: input.unit_id ?? null,
        tenant_id: input.tenant_id ?? null,
        due_at: input.due_at ?? null,
        estimated_hours: input.estimated_hours ?? null,
        created_by: ctx.getUserId(),
        status: "new",
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created ${data.job_number}: ${data.title}` }],
      structuredContent: { work_order: data },
    };
  },
});
