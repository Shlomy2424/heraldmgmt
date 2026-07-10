import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { format, formatDistanceStrict } from "date-fns";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({ meta: [{ title: "Activity Log" }] }),
  component: ActivityPage,
});

const ACTION_LABELS: Record<string, string> = {
  work_orders_created: "Work order created",
  work_orders_updated: "Work order updated",
  work_orders_deleted: "Work order deleted",
  job_notes_created: "Note added",
  job_notes_deleted: "Note deleted",
  photos_created: "Photo uploaded",
  photos_deleted: "Photo deleted",
  properties_created: "Property created",
  properties_updated: "Property updated",
  units_created: "Unit created",
  units_updated: "Unit updated",
  tenants_created: "Tenant created",
  tenants_updated: "Tenant updated",
  user_invited: "User invited",
  role_changed: "Role changed",
};

function actionLabel(a: string) {
  if (ACTION_LABELS[a]) return ACTION_LABELS[a];
  if (a.startsWith("work_order_status_")) return `Status → ${a.replace("work_order_status_", "").replace(/_/g, " ")}`;
  return a.replace(/_/g, " ");
}

function ActivityPage() {
  const { hasRole, loading } = useAuth();
  const nav = useNavigate();
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const isAdmin = hasRole("admin");

  const { data } = useQuery({
    queryKey: ["activity", userFilter, actionFilter, tableFilter, from, to],
    enabled: isAdmin,
    queryFn: async () => {
      let q = supabase.from("activity_log")
        .select("*,profile:profiles(name),work_order:work_orders(id,job_number,title)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (userFilter) q = q.eq("user_id", userFilter);
      if (actionFilter) q = q.eq("action", actionFilter);
      if (tableFilter) q = q.eq("table_name", tableFilter);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to + "T23:59:59");
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles-list-admin"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.rpc("admin_list_profiles")).data ?? [],
  });

  const { data: sessions } = useQuery({
    queryKey: ["user-sessions", userFilter, from, to],
    enabled: isAdmin,
    queryFn: async () => {
      let q = supabase.from("user_sessions")
        .select("*,profile:profiles(name,email)")
        .order("login_at", { ascending: false })
        .limit(500);
      if (userFilter) q = q.eq("user_id", userFilter);
      if (from) q = q.gte("login_at", from);
      if (to) q = q.lte("login_at", to + "T23:59:59");
      const { data } = await q;
      return data ?? [];
    },
  });

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="text-sm text-muted-foreground">Admin only.</div>;


  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl">Activity Log</h1>
        <p className="text-sm text-muted-foreground">Full audit of user actions</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          <Select value={userFilter || "all"} onValueChange={(v) => setUserFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="User"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {(profiles ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={actionFilter || "all"} onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Action"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.keys(ACTION_LABELS).map((a) => <SelectItem key={a} value={a}>{ACTION_LABELS[a]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tableFilter || "all"} onValueChange={(v) => setTableFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Entity"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              {["work_orders","job_notes","photos","properties","units","tenants","account_invites","user_roles"].map((t) =>
                <SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From"/>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To"/>
        </CardContent>
      </Card>

      <Tabs defaultValue="actions">
        <TabsList>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="sessions">Login sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="actions">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2">When</th>
                      <th className="text-left px-4 py-2">User</th>
                      <th className="text-left px-4 py-2">Action</th>
                      <th className="text-left px-4 py-2">Related</th>
                      <th className="text-left px-4 py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data ?? []).map((r: any) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy h:mm a")}</td>
                        <td className="px-4 py-2">{r.profile?.name ?? <span className="text-muted-foreground">System</span>}</td>
                        <td className="px-4 py-2">{actionLabel(r.action)}</td>
                        <td className="px-4 py-2">
                          {r.work_order ? (
                            <Link to="/work-orders/$id" params={{ id: r.work_order.id }} className="text-primary hover:underline">
                              <span className="font-mono text-xs">{r.work_order.job_number}</span> {r.work_order.title}
                            </Link>
                          ) : <span className="text-xs text-muted-foreground">{r.table_name ?? "—"}</span>}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground font-mono truncate max-w-xs">
                          {r.details ? JSON.stringify(r.details) : "—"}
                        </td>
                      </tr>
                    ))}
                    {data?.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No activity matches these filters</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2">User</th>
                      <th className="text-left px-4 py-2">Login</th>
                      <th className="text-left px-4 py-2">Logout / Last seen</th>
                      <th className="text-left px-4 py-2">Duration</th>
                      <th className="text-left px-4 py-2">Device</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(sessions ?? []).map((s: any) => {
                      const end = s.logout_at ?? s.last_seen_at ?? null;
                      const durMin = s.duration_minutes ?? (end ? Math.max(0, Math.round((new Date(end).getTime() - new Date(s.login_at).getTime()) / 60000)) : null);
                      return (
                        <tr key={s.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2">{s.profile?.name ?? s.profile?.email ?? <span className="text-muted-foreground">Unknown</span>}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">{format(new Date(s.login_at), "MMM d, yyyy h:mm a")}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                            {end ? format(new Date(end), "MMM d, yyyy h:mm a") : <span className="text-success">Active</span>}
                            {!s.logout_at && s.last_seen_at && <span className="ml-1 text-[10px]">(last seen)</span>}
                          </td>
                          <td className="px-4 py-2 text-xs">{durMin != null ? `${durMin} min` : "—"}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-xs">{s.user_agent ?? "—"}</td>
                        </tr>
                      );
                    })}
                    {sessions?.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No sessions recorded yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
