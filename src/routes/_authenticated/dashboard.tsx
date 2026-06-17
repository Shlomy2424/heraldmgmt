import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, AlertTriangle, CheckCircle2, Clock, Calendar } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Maintenance Manager" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [open, emergency, today, doneWeek] = await Promise.all([
        supabase.from("work_orders").select("id", { count: "exact", head: true }).not("status", "in", "(closed,cancelled)"),
        supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("priority", "emergency").not("status", "in", "(closed,cancelled)"),
        supabase.from("schedule_visits").select("id", { count: "exact", head: true }).eq("scheduled_date", new Date().toISOString().slice(0, 10)),
        supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("status", "closed").gte("closed_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      ]);
      return {
        open: open.count ?? 0,
        emergency: emergency.count ?? 0,
        today: today.count ?? 0,
        doneWeek: doneWeek.count ?? 0,
      };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-work-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_orders")
        .select("id,job_number,title,status,priority,created_at,property:properties(property_name),unit:units(unit_number)")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const cards = [
    { label: "Open Jobs", value: stats?.open ?? "—", icon: ClipboardList, color: "text-primary" },
    { label: "Emergency", value: stats?.emergency ?? "—", icon: AlertTriangle, color: "text-destructive" },
    { label: "Scheduled Today", value: stats?.today ?? "—", icon: Calendar, color: "text-accent-foreground" },
    { label: "Closed this Week", value: stats?.doneWeek ?? "—", icon: CheckCircle2, color: "text-success" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of maintenance operations</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">{c.label}</div>
                    <div className="text-3xl font-display mt-1">{c.value}</div>
                  </div>
                  <Icon className={`size-8 ${c.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Work Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {(recent ?? []).map((w: any) => (
              <Link
                key={w.id}
                to="/work-orders/$id"
                params={{ id: w.id }}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{w.job_number}</span>
                    <PriorityBadge p={w.priority} />
                  </div>
                  <div className="font-medium truncate">{w.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {w.property?.property_name} {w.unit?.unit_number && `• Unit ${w.unit.unit_number}`}
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <StatusBadge s={w.status} />
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-end">
                    <Clock className="size-3" />
                    {format(new Date(w.created_at), "MMM d")}
                  </div>
                </div>
              </Link>
            ))}
            {recent?.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">No work orders yet</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    new: "bg-primary/10 text-primary",
    scheduled: "bg-accent/20 text-accent-foreground",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
    done: "bg-success/15 text-success",
    closed: "bg-muted text-muted-foreground",
    cancelled: "bg-muted text-muted-foreground line-through",
    waiting_parts: "bg-amber-100 text-amber-800",
    waiting_tenant: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[s] ?? "bg-muted text-muted-foreground"}`}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

export function PriorityBadge({ p }: { p: string }) {
  const map: Record<string, string> = {
    emergency: "bg-destructive text-destructive-foreground",
    high: "bg-accent text-accent-foreground",
    normal: "bg-secondary text-secondary-foreground",
    low: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${map[p] ?? "bg-muted"}`}>
      {p}
    </span>
  );
}
