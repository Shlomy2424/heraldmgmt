import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
  component: WorkOrdersPage,
});

function WorkOrdersPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["work-orders", statusFilter, priorityFilter, q],
    queryFn: async () => {
      let query = supabase
        .from("work_orders")
        .select("id,job_number,title,status,priority,created_at,assigned_to,property:properties(property_name),unit:units(unit_number),tenant:tenants(tenant_name),assignee:profiles!work_orders_assigned_to_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter === "open") query = query.not("status", "in", "(closed,cancelled)");
      else if (statusFilter === "closed") query = query.in("status", ["closed", "cancelled"]);
      else if (statusFilter !== "all") query = query.eq("status", statusFilter as any);
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter as any);
      if (q) query = query.or(`title.ilike.%${q}%,job_number.ilike.%${q}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl">Work Orders</h1>
          <p className="text-sm text-muted-foreground">All maintenance jobs</p>
        </div>
        <Button onClick={() => nav({ to: "/work-orders/new" })}>
          <Plus className="size-4 mr-1" /> New Work Order
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search title or job #" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="waiting_parts">Waiting parts</SelectItem>
              <SelectItem value="done">Done</SelectItem>
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
