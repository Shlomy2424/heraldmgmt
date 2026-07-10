import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({ meta: [{ title: "Unsubscribe" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) ?? "" }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<"loading"|"ready"|"done"|"invalid"|"used"|"error">("loading");
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setState("invalid"); setError(j.error ?? "Invalid link"); return; }
        if (j.used) { setState("used"); setEmail(j.email ?? ""); return; }
        setEmail(j.email ?? "");
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [token]);

  async function confirm() {
    setState("loading");
    const r = await fetch("/email/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (r.ok) setState("done"); else { setState("error"); setError((await r.text().catch(() => "")) || "Failed"); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="max-w-md w-full">
        <CardHeader><CardTitle>Unsubscribe from Herald Property Management emails</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {state === "loading" && <p className="text-muted-foreground">Please wait…</p>}
          {state === "ready" && (
            <>
              <p>Unsubscribe <b>{email}</b> from all Herald Property Management emails?</p>
              <Button onClick={confirm}>Unsubscribe</Button>
            </>
          )}
          {state === "done" && <p className="text-success">{email} has been unsubscribed. You will no longer receive emails.</p>}
          {state === "used" && <p className="text-muted-foreground">{email} was already unsubscribed.</p>}
          {state === "invalid" && <p className="text-destructive">This unsubscribe link is invalid or expired. {error}</p>}
          {state === "error" && <p className="text-destructive">Something went wrong. {error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
