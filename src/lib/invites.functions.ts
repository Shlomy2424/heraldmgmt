import { createServerFn } from "@tanstack/react-start";
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

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error(`Email not sent to ${email}: email service is not configured. Copy the invite link manually.`);
    }

    const fromDomain = process.env.SENDER_DOMAIN || process.env.FROM_DOMAIN;
    const from = fromDomain ? `Maintenance Manager <noreply@${fromDomain}>` : "Maintenance Manager <noreply@lovable.dev>";
    const greeting = data.name?.trim() ? `Hi ${data.name.trim()},` : "Hi,";
    const html = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #172033; background: #f6f7f9; padding: 24px;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #d8dde6; padding: 24px; border-radius: 8px;">
      <h1 style="font-size: 22px; margin: 0 0 16px;">You're invited to Maintenance Manager</h1>
      <p>${greeting}</p>
      <p>An administrator invited you to create an account. Choose your password using the secure invite link below.</p>
      <p style="margin: 24px 0;">
        <a href="${inviteLink}" style="background: #1f6feb; color: #ffffff; padding: 12px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">Accept invite</a>
      </p>
      <p style="font-size: 13px; color: #586174;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="font-size: 13px; word-break: break-all; color: #1f6feb;">${inviteLink}</p>
      <p style="font-size: 13px; color: #586174;">This invite expires in 7 days. If you did not expect this invite, you can ignore this email.</p>
    </div>
  </body>
</html>`;

    const response = await fetch("https://api.lovable.dev/v1/email/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: email,
        from,
        subject: "You're invited to Maintenance Manager",
        html,
        text: `You're invited to Maintenance Manager. Open this link to choose your password: ${inviteLink}`,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Email not sent to ${email}: ${response.status} ${body || response.statusText}. Copy the invite link manually.`);
    }

    await context.supabase.from("activity_log").insert({
      user_id: context.userId,
      action: "invite_email_sent",
      table_name: "account_invites",
      record_id: invite.id,
      details: { email, invite_id: invite.id },
    });

    return { ok: true, email, inviteLink };
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