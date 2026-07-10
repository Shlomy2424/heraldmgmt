import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleSchema = z.enum(["admin", "manager", "technician", "viewer"]);

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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const email = data.email.trim().toLowerCase();
    const inviteLink = `${data.redirectOrigin.replace(/\/$/, "")}/accept-invite?token=${encodeURIComponent(data.token)}`;

    const { data: inviteRows, error: inviteErr } = await context.supabase
      .from("account_invites")
      .select("id,email,accepted_at,revoked_at,expires_at")
      .eq("token", data.token)
      .limit(1);
    if (inviteErr) throw new Error(inviteErr.message);
    const invite = inviteRows?.[0];
    if (!invite) throw new Error("Invite not found");
    if (invite.email.toLowerCase() !== email) throw new Error(`Invite email mismatch: expected ${invite.email}, got ${email}`);
    if (invite.revoked_at) throw new Error(`Invite for ${email} has been revoked`);
    if (invite.accepted_at) throw new Error(`Invite for ${email} has already been accepted`);
    if (new Date(invite.expires_at) < new Date()) throw new Error(`Invite for ${email} has expired`);

    // Forward the caller's bearer token to the internal queued-email route.
    const req = getRequest();
    const authHeader = req?.headers.get("authorization") ?? "";
    const origin = data.redirectOrigin.replace(/\/$/, "");

    let response: Response;
    try {
      response = await fetch(`${origin}/lovable/email/transactional/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          templateName: "invite",
          recipientEmail: email,
          idempotencyKey: `invite-${invite.id}-${Date.now()}`,
          templateData: { name: data.name?.trim() || undefined, inviteLink },
        }),
      });
    } catch (err: any) {
      return { ok: false, email, inviteLink, mode: "send_failed" as const,
        reason: `Email service unreachable: ${err?.message ?? String(err)}` };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, email, inviteLink, mode: "send_failed" as const,
        reason: `Email service returned ${response.status}: ${body || response.statusText}` };
    }

    await context.supabase.from("activity_log").insert({
      user_id: context.userId,
      action: "invite_email_sent",
      table_name: "account_invites",
      record_id: invite.id,
      details: { email, invite_id: invite.id },
    });

    return { ok: true as const, email, inviteLink, mode: "sent" as const };
  });


export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), confirmEmail: z.string().email() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    if (data.userId === context.userId) throw new Error("You cannot delete your own account from here");

    const { data: profile, error: profileErr } = await context.supabase
      .rpc("admin_list_profiles")
      .then((result) => ({
        ...result,
        data: result.data?.find((row) => row.id === data.userId) ?? null,
      }));
    if (profileErr) throw new Error(profileErr.message);
    if (!profile) throw new Error("User not found");
    if (profile.email.toLowerCase() !== data.confirmEmail.trim().toLowerCase()) {
      throw new Error("Confirmation email does not match the selected user");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId, false);
    if (error) throw new Error(error.message);

    await context.supabase.from("activity_log").insert({
      user_id: context.userId,
      action: "user_deleted",
      table_name: "profiles",
      record_id: data.userId,
      details: { email: profile.email, name: profile.name },
    });

    return { ok: true };
  });

export const adminSetUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    if (data.userId === context.userId && !data.active) throw new Error("You cannot deactivate your own account from here");

    const { error: dbError } = await context.supabase.rpc("admin_set_user_active", {
      _target_user: data.userId,
      _active: data.active,
    });
    if (dbError) throw new Error(dbError.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (authError) throw new Error(authError.message);

    return { ok: true };
  });

export const acceptInviteWithPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(1), password: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("account_invites")
      .select("id,email,name,role,token,accepted_at,revoked_at,expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (inviteErr) throw new Error(inviteErr.message);
    if (!invite) throw new Error("Invite not found");
    if (invite.revoked_at) throw new Error("This invite was revoked.");
    if (invite.accepted_at) throw new Error("This invite has already been accepted. Please sign in.");
    if (new Date(invite.expires_at) < new Date()) throw new Error("This invite has expired.");

    const email = invite.email.trim().toLowerCase();
    const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw new Error(listErr.message);
    const authUser = users.users.find((u) => u.email?.toLowerCase() === email);
    if (authUser) {
      throw new Error("User already exists. Use reset password or deactivate/reinvite.");
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { invite_token: data.token, name: invite.name ?? undefined },
    });
    if (createErr) throw new Error(createErr.message);
    if (!created.user) throw new Error("Account could not be created.");

    return { ok: true, email };
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      email: z.string().email(),
      name: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      role: roleSchema,
      redirectOrigin: z.string().url(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const email = data.email.trim().toLowerCase();
    const { data: existingUsers, error: listErr } = await context.supabase.rpc("admin_list_profiles");
    if (listErr) throw new Error(listErr.message);
    const existing = existingUsers?.find((profile) => profile.email?.toLowerCase() === email);
    if (existing) {
      throw new Error(`User already exists for ${email}. Use reset password or deactivate/reinvite.`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUsers, error: authListErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authListErr) throw new Error(authListErr.message);
    if (authUsers.users.some((authUser) => authUser.email?.toLowerCase() === email)) {
      throw new Error(`User already exists for ${email}. Use reset password or deactivate/reinvite.`);
    }

    const { data: invite, error } = await context.supabase
      .from("account_invites")
      .insert({
        email,
        name: data.name?.trim() || null,
        phone: data.phone?.trim() || null,
        role: data.role,
        invited_by: context.userId,
      })
      .select("id,email,name,token")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("activity_log").insert({
      user_id: context.userId,
      action: "user_invited",
      table_name: "account_invites",
      record_id: invite.id,
      details: { email, role: data.role },
    });

    return {
      invite,
      inviteLink: `${data.redirectOrigin.replace(/\/$/, "")}/accept-invite?token=${encodeURIComponent(invite.token)}`,
    };
  });