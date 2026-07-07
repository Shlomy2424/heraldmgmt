import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { UserPlus, Copy, Mail, XCircle, RotateCcw, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useServerFn } from "@tanstack/react-start";
import { adminDeleteUser, createInvite, sendInviteEmail } from "@/lib/invites.functions";

const ROLES = ["admin", "manager", "technician", "viewer"] as const;

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users & Invites" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { hasRole, user } = useAuth();
  const qc = useQueryClient();
  const canAdmin = hasRole(["admin"]);

  const { data: users } = useQuery({
    queryKey: ["users-roles"],
    queryFn: async () => {
      const { data: profiles } = await supabase.rpc("admin_list_profiles");
      const { data: roles } = await supabase.from("user_roles").select("user_id,role");
      const byUser = new Map<string, string[]>();
      (roles ?? []).forEach((r) => { if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id)!.push(r.role); });
      return (profiles ?? []).map((p: any) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  const { data: invites } = useQuery({
    queryKey: ["invites"],
    enabled: canAdmin,
    queryFn: async () => (await supabase.from("account_invites").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  async function setRole(userId: string, role: string) {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
    if (error) toast.error(error.message);
    else { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["users-roles"] }); logAction("role_changed", { target_user: userId, role }); }
  }

  async function logAction(action: string, details: any) {
    await supabase.from("activity_log").insert({ user_id: user?.id, action, table_name: "user_roles", details });
  }

  async function revoke(inviteId: string) {
    const { error } = await supabase.from("account_invites").update({ revoked_at: new Date().toISOString() }).eq("id", inviteId);
    if (error) toast.error(error.message); else { toast.success("Invite revoked"); qc.invalidateQueries({ queryKey: ["invites"] }); }
  }
  const sendEmail = useServerFn(sendInviteEmail);
  async function copyLink(inv: any) {
    const url = `${window.location.origin}/accept-invite?token=${inv.token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  }
  async function resendEmail(inv: any) {
    try {
      await sendEmail({ data: { email: inv.email, token: inv.token, redirectOrigin: window.location.origin, name: inv.name } });
      toast.success(`Invite email sent to ${inv.email}`);
    } catch (e: any) {
      toast.error(`Email failed: ${e.message ?? "unknown"} — copy the link manually`);
      await copyLink(inv);
    }
  }
  async function extendInvite(inv: any) {
    const newExpiry = new Date(Date.now() + 7 * 86400000).toISOString();
    const { error } = await supabase.from("account_invites").update({ expires_at: newExpiry }).eq("id", inv.id);
    if (error) toast.error(error.message); else { toast.success("Invite extended 7 days"); qc.invalidateQueries({ queryKey: ["invites"] }); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl">Users &amp; Invites</h1>
          <p className="text-sm text-muted-foreground">Invite new users and manage roles</p>
        </div>
        {canAdmin && <InviteDialog />}
      </div>
      {!canAdmin && <div className="text-sm text-muted-foreground">Read-only. Admin role required to invite or change roles.</div>}

      {canAdmin && (
        <Card>
          <CardHeader><CardTitle>Pending &amp; Recent Invites</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">Email</th>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">Role</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Expires</th>
                    <th className="text-right px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(invites ?? []).map((i: any) => {
                    const status = i.revoked_at ? "revoked" : i.accepted_at ? "accepted" : new Date(i.expires_at) < new Date() ? "expired" : "pending";
                    return (
                      <tr key={i.id}>
                        <td className="px-4 py-2">{i.email}</td>
                        <td className="px-4 py-2 text-muted-foreground">{i.name ?? "—"}</td>
                        <td className="px-4 py-2 capitalize">{i.role}</td>
                        <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs ${
                          status === "pending" ? "bg-amber-100 text-amber-800" :
                          status === "accepted" ? "bg-success/15 text-success" :
                          "bg-muted text-muted-foreground"
                        }`}>{status}</span></td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{format(new Date(i.expires_at), "MMM d, yyyy")}</td>
                        <td className="px-4 py-2 text-right">
                          {status === "pending" && (
                            <div className="inline-flex gap-1">
                              <Button size="sm" variant="ghost" title="Copy invite link" onClick={() => copyLink(i)}><Copy className="size-3.5"/></Button>
                              <Button size="sm" variant="ghost" title="Resend invite email" onClick={() => resendEmail(i)}><Mail className="size-3.5"/></Button>
                              <Button size="sm" variant="ghost" title="Extend 7 days" onClick={() => extendInvite(i)}><RotateCcw className="size-3.5"/></Button>
                              <Button size="sm" variant="ghost" title="Revoke" onClick={() => revoke(i.id)}><XCircle className="size-3.5"/></Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {invites?.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No invites yet</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">Role</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Admin actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(users ?? []).map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 font-medium">{u.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-2">
                      <Select value={u.roles[0] ?? "viewer"} onValueChange={(v) => setRole(u.id, v)} disabled={!canAdmin}>
                        <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${u.active ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {u.active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canAdmin && <UserLifecycleActions target={u} isSelf={u.id === user?.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UserLifecycleActions({ target, isSelf }: { target: any; isSelf: boolean }) {
  const qc = useQueryClient();
  const deleteUser = useServerFn(adminDeleteUser);
  const [deleteText, setDeleteText] = useState("");
  const [busy, setBusy] = useState(false);

  async function setActive(active: boolean) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_set_user_active", { _target_user: target.id, _active: active });
      if (error) throw error;
      toast.success(active ? "User reactivated" : "User deactivated");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not update user");
    } finally {
      setBusy(false);
    }
  }

  async function removeAuthUser() {
    setBusy(true);
    try {
      await deleteUser({ data: { userId: target.id, confirmEmail: deleteText } });
      toast.success("Auth user deleted");
      setDeleteText("");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex gap-1">
      {target.active ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" title="Deactivate user" disabled={isSelf || busy}><ShieldOff className="size-3.5" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate {target.name || target.email}?</AlertDialogTitle>
              <AlertDialogDescription>
                They will be blocked from signing in and using the app. Historical jobs, notes, photos, and activity remain intact.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => setActive(false)}>Deactivate</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" title="Reactivate user" disabled={busy}><ShieldCheck className="size-3.5" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reactivate {target.name || target.email}?</AlertDialogTitle>
              <AlertDialogDescription>They will be able to sign in and use the app again.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => setActive(true)}>Reactivate</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost" title="Delete auth user" disabled={isSelf || busy}><Trash2 className="size-3.5" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete auth user?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the sign-in account. Historical work remains, but this cannot be undone. Type the user's email to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder={target.email} />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteText("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleteText.trim().toLowerCase() !== String(target.email).toLowerCase()} onClick={removeAuthUser}>
              Delete auth user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InviteDialog() {
  const qc = useQueryClient();
  const sendEmail = useServerFn(sendInviteEmail);
  const createInviteFn = useServerFn(createInvite);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"admin"|"manager"|"technician"|"viewer">("technician");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<"sent"|"failed"|null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await createInviteFn({ data: { email, name: name || null, phone: phone || null, role, redirectOrigin: window.location.origin } });
      const data = result.invite;
      const url = result.inviteLink;
      setCreatedUrl(url);
      qc.invalidateQueries({ queryKey: ["invites"] });
      try {
        await sendEmail({ data: { email: data.email, token: data.token, redirectOrigin: window.location.origin, name: name || null } });
        setEmailStatus("sent");
        toast.success(`Invite email sent to ${data.email}`);
      } catch (e: any) {
        setEmailStatus("failed");
        await navigator.clipboard.writeText(url);
        toast.error(`Email failed (${e.message ?? "unknown"}). Link copied — send manually.`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not create invite");
    } finally {
      setBusy(false);
    }
  }
  function reset() { setEmail(""); setName(""); setPhone(""); setRole("technician"); setCreatedUrl(null); setEmailStatus(null); }


  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild><Button><UserPlus className="size-4 mr-2"/> Invite user</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite a new user</DialogTitle></DialogHeader>
        {createdUrl ? (
          <div className="space-y-3">
            {emailStatus === "sent" && <div className="text-sm p-3 rounded bg-success/10 text-success">✓ Invite email sent to {email}. They can click the link to set their password.</div>}
            {emailStatus === "failed" && <div className="text-sm p-3 rounded bg-destructive/10 text-destructive">Email sending failed. Copy the link below and share it manually.</div>}
            <p className="text-sm">Invite link (expires in 7 days):</p>
            <div className="p-3 bg-muted rounded text-xs break-all font-mono">{createdUrl}</div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(createdUrl); toast.success("Copied"); }}>Copy link</Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}/></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)}/></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)}/></div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Create invite & send email"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
