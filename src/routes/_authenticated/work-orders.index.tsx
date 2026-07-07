import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { StatusBadge, PriorityBadge } from "./dashboard";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/work-orders/")({
  head: () => ({ meta: [{ title: "Work Orders" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    status: (s.status as string) ?? "open",
    priority: (s.priority as string) ?? "all",
    property_id: (s.property_id as string) ?? "all",
    unit_id: (s.unit_id as string) ?? "",
    tenant_id: (s.tenant_id as string) ?? "",
    assigned_to: (s.assigned_to as string) ?? "all",
    from: (s.from as string) ?? "",
    to: (s.to as string) ?? "",
    overdue: (s.overdue as string) ?? "",
    q: (s.q as string) ?? "",
  }),
  component: WorkOrdersPage,
});

function WorkOrdersPage() {
  const nav = useNavigate();
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q);
  const [statusFilter, setStatusFilter] = useState(search.status);
  const [priorityFilter, setPriorityFilter] = useState(search.priority);
  const [propertyFilter, setPropertyFilter] = useState(search.property_id);
  const [assignedFilter, setAssignedFilter] = useState(search.assigned_to);
  const [from, setFrom] = useState(search.from);
  const [to, setTo] = useState(search.to);
  const [overdue, setOverdue] = useState(search.overdue === "1");

  // Sync from URL when it changes (dashboard card click)
  useEffect(() => {
    setStatusFilter(search.status);
    setPriorityFilter(search.priority);
    setPropertyFilter(search.property_id);
    setAssignedFilter(search.assigned_to);
    setFrom(search.from);
    setTo(search.to);
    setOverdue(search.overdue === "1");
    setQ(search.q);
  }, [search.status, search.priority, search.property_id, search.assigned_to, search.from, search.to, search.overdue, search.q]);

  const { data: properties } = useQuery({
    queryKey: ["properties-list"],
    queryFn: async () => (await supabase.from("properties").select("id,property_name").order("property_name")).data ?? [],
  });
  const { data: techs } = useQuery({
    queryKey: ["techs-list"],
    queryFn: async () => {
      const { data: ur } = await supabase.from("user_roles").select("user_id").in("role", ["technician", "manager", "admin"]);
      const ids = [...new Set((ur ?? []).map((r) => r.user_id))];
      if (!ids.length) return [];
      return (await supabase.from("profiles").select("id,name").in("id", ids).order("name")).data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["work-orders", statusFilter, priorityFilter, propertyFilter, assignedFilter, from, to, overdue, q, search.unit_id, search.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from("work_orders")
        .select("id,job_number,title,status,priority,created_at,closed_at,assigned_to,property:properties(property_name),unit:units(unit_number),tenant:tenants(tenant_name),assignee:profiles!work_orders_assigned_to_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (statusFilter === "open") query = query.not("status", "in", "(closed,cancelled)");
      else if (statusFilter === "closed") query = query.in("status", ["closed", "cancelled"]);
      else if (statusFilter !== "all") query = query.eq("status", statusFilter as any);
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter as any);
      if (propertyFilter !== "all") query = query.eq("property_id", propertyFilter);
      if (search.unit_id) query = query.eq("unit_id", search.unit_id);
      if (search.tenant_id) query = query.eq("tenant_id", search.tenant_id);
      if (assignedFilter === "unassigned") query = query.is("assigned_to", null);
      else if (assignedFilter !== "all") query = query.eq("assigned_to", assignedFilter);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to + "T23:59:59");
      if (overdue) query = query.lt("created_at", new Date(Date.now() - 14 * 86400000).toISOString());
      if (q) query = query.or(`title.ilike.%${q}%,job_number.ilike.%${q}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

  function clearFilters() {
    nav({ to: "/work-orders", search: { status: "open", priority: "all", property_id: "all", assigned_to: "all", from: "", to: "", overdue: "", q: "" } as any });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl">Work Orders</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} results</p>
        </div>
        <Button onClick={() => nav({ to: "/work-orders/new", search: { property_id: "", unit_id: "", tenant_id: "" } as any })}>
          <Plus className="size-4 mr-1" /> New Work Order
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search title or job #" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed / cancelled</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="waiting_parts">Waiting parts</SelectItem>
                <SelectItem value="waiting_tenant">Waiting tenant</SelectItem>
                <SelectItem value="done">Done (completed)</SelectItem>
                <SelectItem value="reopened">Reopened</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priority</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={propertyFilter} onValueChange={setPropertyFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Property"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {(properties ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Technician"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(techs ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" placeholder="From"/>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" placeholder="To"/>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)}/>
              Overdue (older than 14 days)
            </label>
            <Button size="sm" variant="ghost" onClick={clearFilters}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Job #</th>
                <th className="text-left px-4 py-3">Title</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Property / Unit</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Assigned</th>
                <th className="text-left px-4 py-3">Priority</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
              {(data ?? []).map((w: any) => (
                <tr key={w.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => nav({ to: "/work-orders/$id", params: { id: w.id } })}>
                  <td className="px-4 py-3 font-mono text-xs">{w.job_number}</td>
                  <td className="px-4 py-3 font-medium max-w-[300px] truncate">{w.title}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                    {w.property?.property_name}{w.unit?.unit_number && ` • ${w.unit.unit_number}`}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs">{w.assignee?.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3"><PriorityBadge p={w.priority} /></td>
                  <td className="px-4 py-3"><StatusBadge s={w.status} /></td>
                  <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">{format(new Date(w.created_at), "MMM d, yyyy")}</td>
                </tr>
              ))}
              {!isLoading && data?.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No work orders match the filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
