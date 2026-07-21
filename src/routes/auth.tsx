import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";

const authSearchSchema = z.object({
  inactive: fallback(z.string(), "").default(""),
  next: fallback(z.string(), "").default(""),
});

function safeNext(next: string, fallbackTo: string): string {
  if (!next) return fallbackTo;
  // Only allow same-origin relative paths.
  if (!next.startsWith("/") || next.startsWith("//")) return fallbackTo;
  return next;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: zodValidator(authSearchSchema),
  head: () => ({ meta: [{ title: "Sign in — Maintenance Manager" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { inactive, next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const returnTo = safeNext(next, "/dashboard");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        supabase.rpc("ensure_user_active").then(async ({ data: active }) => {
          if (active) window.location.href = returnTo;
          else await supabase.auth.signOut();
        });
      }
    });
  }, [nav, returnTo]);

  useEffect(() => {
    if (inactive === "1") toast.error("This user has been deactivated. Contact an administrator.");
  }, [inactive]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: active } = await supabase.rpc("ensure_user_active");
      if (!active) {
        await supabase.auth.signOut();
        throw new Error("This user has been deactivated. Contact an administrator.");
      }
      window.location.href = returnTo;
    } catch (err: any) {
      toast.error(err.message ?? "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const redirect_uri =
      returnTo === "/dashboard"
        ? window.location.origin
        : `${window.location.origin}${returnTo}`;
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri });
    if ((res as any).error) toast.error("Google sign-in failed");
    setBusy(false);
  }

  async function forgotPassword() {
    if (!email) { toast.error("Enter your email first"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
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
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              This system is invite-only. Ask an administrator for an invite link if you don't have an account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full" onClick={google} disabled={busy}>
              Continue with Google
            </Button>
            <div className="relative text-center text-xs text-muted-foreground">
              <span className="bg-card px-2 relative z-10">or</span>
              <div className="absolute inset-x-0 top-1/2 h-px bg-border -z-0" />
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button type="button" onClick={forgotPassword} className="text-xs text-muted-foreground hover:text-foreground">
                    Forgot?
                  </button>
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>Sign in</Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground text-center mt-4">
          <Link to="/dashboard" className="hover:underline">Back to app</Link>
        </p>
      </div>
    </div>
  );
}
