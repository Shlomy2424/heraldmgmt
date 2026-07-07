import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useServerFn } from "@tanstack/react-start";
import { acceptInviteWithPassword } from "@/lib/invites.functions";

const schema = z.object({ token: fallback(z.string(), "").default("") });

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  validateSearch: zodValidator(schema),
  head: () => ({ meta: [{ title: "Accept invite" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const nav = useNavigate();
  const acceptInvite = useServerFn(acceptInviteWithPassword);
  const [invite, setInvite] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<any>(null);

  useEffect(() => {
    if (!token) { setErr("Invalid invite link."); return; }
    supabase.rpc("get_invite_by_token", { _token: token }).then(({ data, error }) => {
      if (error) { setErr(error.message); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { setErr("Invite not found."); return; }
      if (row.revoked_at) { setErr("This invite was revoked."); return; }
      if (row.accepted_at) { setAccepted(row); return; }
      if (new Date(row.expires_at) < new Date()) { setErr("This invite has expired."); return; }
      setInvite(row);
    });
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setBusy(true);
    try {
      await acceptInvite({ data: { token, password } });
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.email, password });
      if (signInError) throw signInError;
      toast.success("Welcome! Account ready.");
      nav({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary to-background p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="size-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <Building2 className="size-5" />
          </div>
          <span className="font-display text-2xl">Maintenance Manager</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Accept your invite</CardTitle>
            <CardDescription>
              {err ? "Something's wrong with this invite" : accepted ? "This invite has already been used" : invite ? `Setting up ${invite.email} as ${invite.role}` : "Verifying invite…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {err ? (
              <div className="text-sm text-destructive">{err}</div>
            ) : accepted ? (
              <div className="space-y-4">
                <div className="rounded-md bg-muted p-3 text-sm">
                  <div className="font-medium">{accepted.email}</div>
                  <div className="text-muted-foreground">
                    Accepted {new Date(accepted.accepted_at).toLocaleString()}
                    {accepted.accepted_by_name ? ` by ${accepted.accepted_by_name}` : ""}.
                  </div>
                </div>
                <Button className="w-full" onClick={() => nav({ to: "/auth" })}>Sign in</Button>
              </div>
            ) : invite ? (
              <form onSubmit={accept} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={invite.email} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Choose a password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
                </div>
                <Button type="submit" className="w-full" disabled={busy || password.length < 8 || password !== confirm}>
                  {busy ? "Creating account…" : "Create account & sign in"}
                </Button>
              </form>
            ) : (
              <div className="text-sm text-muted-foreground">Loading…</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
