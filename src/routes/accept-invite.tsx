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
  const [invite, setInvite] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setHasSession(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) { setErr("Invalid invite link."); return; }
    supabase.rpc("get_invite_by_token", { _token: token }).then(({ data, error }) => {
      if (error) { setErr(error.message); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { setErr("Invite not found."); return; }
      if (row.revoked_at) { setErr("This invite was revoked."); return; }
      if (row.accepted_at && !hasSession) { setErr("This invite has already been used. Please sign in."); return; }
      if (new Date(row.expires_at) < new Date()) { setErr("This invite has expired."); return; }
      setInvite(row);
    });
  }, [token, hasSession]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setBusy(true);
    try {
      if (hasSession) {
        // User already authenticated via emailed magic/invite link — just set password
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: invite.email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { invite_token: token, name: invite.name ?? undefined },
          },
        });
        if (error) throw error;
        const { error: sErr } = await supabase.auth.signInWithPassword({ email: invite.email, password });
        if (sErr) throw sErr;
      }
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
              {err ? "Something's wrong with this invite" : invite ? `Setting up ${invite.email} as ${invite.role}` : "Verifying invite…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {err ? (
              <div className="text-sm text-destructive">{err}</div>
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
                <Button type="submit" className="w-full" disabled={busy || password.length < 8}>Create account &amp; sign in</Button>
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
