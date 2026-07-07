import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, AlertTriangle, CheckCircle2, Clock, Calendar, Timer } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Maintenance Manager" }] }),
  component: Dashboard,
});

function Dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [open, emergency, todayVisits, doneWeek, overdue, waitingParts] = await Promise.all([
        supabase.from("work_orders").select("id", { count: "exact", head: true }).not("status", "in", "(closed,cancelled)"),
        supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("priority", "emergency").not("status", "in", "(closed,cancelled)"),
        supabase.from("schedule_visits").select("id", { count: "exact", head: true }).eq("scheduled_date", today),
        supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("status", "closed").gte("closed_at", weekAgo),
        supabase.from("work_orders").select("id", { count: "exact", head: true }).lt("created_at", twoWeeksAgo).not("status", "in", "(closed,cancelled)"),
        supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("status", "waiting_parts"),
      ]);
      return {
        open: open.count ?? 0,
        emergency: emergency.count ?? 0,
        today: todayVisits.count ?? 0,
        doneWeek: doneWeek.count ?? 0,
        overdue: overdue.count ?? 0,
        waitingParts: waitingParts.count ?? 0,
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
        .limit(10);
      return data ?? [];
    },
  });

  const cards: { label: string; value: any; icon: any; color: string; to: any; search?: any }[] = [
    { label: "Open Jobs", value: stats?.open ?? "—", icon: ClipboardList, color: "text-primary", to: "/work-orders", search: { status: "open" } },
    { label: "Emergency", value: stats?.emergency ?? "—", icon: AlertTriangle, color: "text-destructive", to: "/work-orders", search: { status: "open", priority: "emergency" } },
    { label: "Scheduled Today", value: stats?.today ?? "—", icon: Calendar, color: "text-accent-foreground", to: "/schedule" },
    { label: "Closed this Week", value: stats?.doneWeek ?? "—", icon: CheckCircle2, color: "text-success", to: "/work-orders", search: { status: "closed" } },
    { label: "Overdue (>14d)", value: stats?.overdue ?? "—", icon: Timer, color: "text-destructive", to: "/work-orders", search: { status: "open", overdue: "1" } },
    { label: "Waiting Parts", value: stats?.waitingParts ?? "—", icon: Clock, color: "text-amber-600", to: "/work-orders", search: { status: "waiting_parts" } },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of maintenance operations</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} to={c.to} search={c.search as any}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground truncate">{c.label}</div>
                      <div className="text-3xl font-display mt-1">{c.value}</div>
                    </div>
                    <Icon className={`size-7 ${c.color} shrink-0`} />
                  </div>
                </CardContent>
              </Card>
            </Link>
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
    reopened: "bg-orange-100 text-orange-800",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[s] ?? "bg-muted text-muted-foreground"}`}>
      {s?.replace(/_/g, " ")}
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
