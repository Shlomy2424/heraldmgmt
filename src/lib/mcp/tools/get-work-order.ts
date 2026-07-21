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
  name: "get_work_order",
  title: "Get work order",
  description:
    "Fetch a single work order with its job notes. Accepts either the work order UUID or the human-readable job number (e.g. WO-00042).",
  inputSchema: {
    id_or_job_number: z.string().min(1).describe("Work order UUID or job number like WO-00042."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id_or_job_number }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const isUuid = /^[0-9a-f-]{36}$/i.test(id_or_job_number);
    const { data: wo, error } = await supabase
      .from("work_orders")
      .select("*")
      .eq(isUuid ? "id" : "job_number", id_or_job_number)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!wo) return { content: [{ type: "text", text: "Work order not found or access denied." }], isError: true };
    const { data: notes } = await supabase
      .from("job_notes")
      .select("id,body,visibility,created_at,created_by")
      .eq("work_order_id", wo.id)
      .order("created_at", { ascending: false });
    return {
      content: [{ type: "text", text: JSON.stringify({ work_order: wo, notes: notes ?? [] }, null, 2) }],
      structuredContent: { work_order: wo, notes: notes ?? [] },
    };
  },
});
