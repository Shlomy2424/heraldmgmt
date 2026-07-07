import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendInviteEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      email: z.string().email(),
      token: z.string().min(1),
      redirectOrigin: z.string().url(),
      name: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Verify caller is admin
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo = `${data.redirectOrigin}/accept-invite?token=${encodeURIComponent(data.token)}`;

    // Try invite (creates a new auth user + sends invite email)
    const { error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo,
      data: { invite_token: data.token, name: data.name ?? undefined },
    });

    if (!invErr) return { ok: true, mode: "invited" as const };

    // If user already exists, fall back to a magic-link email pointing at accept-invite
    const msg = invErr.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      const { error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: data.email,
        options: { redirectTo },
      });
      if (linkErr) throw new Error(linkErr.message);
      return { ok: true, mode: "magiclink" as const };
    }
    throw new Error(invErr.message);
  });
