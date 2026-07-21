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
  name: "list_work_orders",
  title: "List work orders",
  description:
    "List work orders visible to the signed-in user, optionally filtered by status, priority, or assigned technician. Returns the most recently updated records.",
  inputSchema: {
    status: z
      .enum(["new", "in_progress", "on_hold", "closed", "cancelled", "reopened"])
      .optional()
      .describe("Filter by work order status."),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    assigned_to_me: z.boolean().optional().describe("Only return work orders assigned to the current user."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("work_orders")
      .select(
        "id,job_number,title,status,priority,job_type,category,due_at,created_at,updated_at,assigned_to,property_id,unit_id,tenant_id",
      )
      .order("updated_at", { ascending: false })
      .limit(input.limit ?? 25);
    if (input.status) q = q.eq("status", input.status);
    if (input.priority) q = q.eq("priority", input.priority);
    if (input.assigned_to_me) q = q.eq("assigned_to", ctx.getUserId());
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
