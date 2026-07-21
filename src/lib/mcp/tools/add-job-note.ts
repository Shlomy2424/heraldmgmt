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
  name: "add_job_note",
  title: "Add job note",
  description: "Add a note to an existing work order.",
  inputSchema: {
    work_order_id: z.string().uuid(),
    body: z.string().min(1),
    visibility: z.enum(["internal", "tenant"]).optional().describe("Default is internal."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ work_order_id, body, visibility }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("job_notes")
      .insert({
        work_order_id,
        body,
        visibility: visibility ?? "internal",
        created_by: ctx.getUserId(),
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: "Note added." }],
      structuredContent: { note: data },
    };
  },
});
