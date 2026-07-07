import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { StatusBadge, PriorityBadge } from "./dashboard";

const REPORTS = [
  { id: "open", label: "Open jobs" },
  { id: "closed", label: "Closed jobs" },
  { id: "completed", label: "Completed" },
  { id: "overdue", label: "Overdue (>14 days open)" },
  { id: "waiting_parts", label: "Waiting parts" },
  { id: "waiting_tenant", label: "Waiting tenant" },
  { id: "follow_up", label: "Follow-up needed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "reopened", label: "Reopened" },
  { id: "tech_hours", label: "Technician hours" },
  { id: "estimate_vs_actual", label: "Estimated vs actual hours" },
  { id: "by_property", label: "Jobs by property" },
  { id: "by_tenant", label: "Jobs by tenant" },
  { id: "old_open", label: "Old open jobs (>30 days)" },
];

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const nav = useNavigate();
  const [report, setReport] = useState<string>("open");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [techFilter, setTechFilter] = useState("all");

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

  const { data: rows } = useQuery({
    queryKey: ["report", report, from, to, propertyFilter, techFilter],
    queryFn: async () => {
      let q = supabase.from("work_orders")
        .select("id,job_number,title,status,priority,category,created_at,closed_at,completed_at,estimated_hours,actual_hours,property:properties(property_name),unit:units(unit_number),tenant:tenants(tenant_name),assignee:profiles!work_orders_assigned_to_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (report === "open") q = q.not("status", "in", "(closed,cancelled)");
      else if (report === "closed") q = q.eq("status", "closed");
      else if (report === "completed") q = q.eq("completed", true);
      else if (report === "cancelled") q = q.eq("status", "cancelled");
      else if (report === "reopened") q = q.eq("reopened", true);
      else if (report === "waiting_parts") q = q.eq("status", "waiting_parts");
      else if (report === "waiting_tenant") q = q.eq("status", "waiting_tenant");
      else if (report === "follow_up") q = q.not("follow_up", "is", null);
      else if (report === "overdue") q = q.not("status", "in", "(closed,cancelled)").lt("created_at", new Date(Date.now() - 14 * 86400000).toISOString());
      else if (report === "old_open") q = q.not("status", "in", "(closed,cancelled)").lt("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to + "T23:59:59");
      if (propertyFilter !== "all") q = q.eq("property_id", propertyFilter);
      if (techFilter !== "all") q = q.eq("assigned_to", techFilter);

      const { data } = await q;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    if (!rows) return null;
    if (report === "tech_hours") {
      const m = new Map<string, { name: string; jobs: number; actual: number; estimated: number }>();
      rows.forEach((w: any) => {
        const key = w.assignee?.name ?? "Unassigned";
        const cur = m.get(key) ?? { name: key, jobs: 0, actual: 0, estimated: 0 };
        cur.jobs++;
        cur.actual += Number(w.actual_hours ?? 0);
        cur.estimated += Number(w.estimated_hours ?? 0);
        m.set(key, cur);
      });
      return [...m.values()].sort((a, b) => b.actual - a.actual);
    }
    if (report === "by_property") {
      const m = new Map<string, number>();
      rows.forEach((w: any) => {
        const k = w.property?.property_name ?? "—";
        m.set(k, (m.get(k) ?? 0) + 1);
      });
      return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    }
    if (report === "by_tenant") {
      const m = new Map<string, number>();
      rows.forEach((w: any) => {
        const k = w.tenant?.tenant_name ?? "—";
        m.set(k, (m.get(k) ?? 0) + 1);
      });
      return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    }
    return null;
  }, [rows, report]);

  function exportCSV() {
    if (!rows) return;
    const cols = ["job_number","title","status","priority","category","assigned","property","unit","tenant","created","closed","estimated_hours","actual_hours"];
    const csv = [cols.join(",")];
    rows.forEach((w: any) => {
      const row = [
        w.job_number, w.title, w.status, w.priority, w.category ?? "",
        w.assignee?.name ?? "", w.property?.property_name ?? "", w.unit?.unit_number ?? "",
        w.tenant?.tenant_name ?? "",
        w.created_at ?? "", w.closed_at ?? "",
        w.estimated_hours ?? "", w.actual_hours ?? "",
      ].map((v) => JSON.stringify(String(v ?? "")));
      csv.push(row.join(","));
    });
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report-${report}-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl">Reports</h1>
          <p className="text-sm text-muted-foreground">Detail reports and export</p>
        </div>
        <Button variant="outline" onClick={exportCSV}><Download className="size-4 mr-1"/>Export CSV</Button>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          <Select value={report} onValueChange={setReport}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{REPORTS.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger><SelectValue placeholder="Property"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {(properties ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={techFilter} onValueChange={setTechFilter}>
            <SelectTrigger><SelectValue placeholder="Technician"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All techs</SelectItem>
              {(techs ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From"/>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To"/>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">{rows?.length ?? 0} rows</div>

      {grouped ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                {report === "tech_hours" ? (
                  <tr><th className="text-left px-4 py-2">Technician</th><th className="text-right px-4 py-2">Jobs</th><th className="text-right px-4 py-2">Estimated</th><th className="text-right px-4 py-2">Actual</th><th className="text-right px-4 py-2">Variance</th></tr>
                ) : (
                  <tr><th className="text-left px-4 py-2">Name</th><th className="text-right px-4 py-2">Jobs</th></tr>
                )}
              </thead>
              <tbody className="divide-y">
                {report === "tech_hours" ? (grouped as any[]).map((r) => (
                  <tr key={r.name}>
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-right">{r.jobs}</td>
                    <td className="px-4 py-2 text-right">{r.estimated.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right">{r.actual.toFixed(1)}</td>
                    <td className={`px-4 py-2 text-right ${r.actual - r.estimated > 0 ? "text-destructive" : "text-success"}`}>
                      {(r.actual - r.estimated).toFixed(1)}
                    </td>
                  </tr>
                )) : (grouped as any[]).map((r) => (
                  <tr key={r.name}><td className="px-4 py-2 font-medium">{r.name}</td><td className="px-4 py-2 text-right">{r.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2">Job #</th>
                  <th className="text-left px-4 py-2">Title</th>
                  <th className="text-left px-4 py-2">Property / Unit</th>
                  <th className="text-left px-4 py-2">Tenant</th>
                  <th className="text-left px-4 py-2">Tech</th>
                  <th className="text-left px-4 py-2">Priority</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Created</th>
                  <th className="text-right px-4 py-2">Est/Act hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(rows ?? []).map((w: any) => (
                  <tr key={w.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => nav({ to: "/work-orders/$id", params: { id: w.id } })}>
                    <td className="px-4 py-2 font-mono text-xs">{w.job_number}</td>
                    <td className="px-4 py-2 font-medium">{w.title}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{w.property?.property_name}{w.unit?.unit_number && ` • ${w.unit.unit_number}`}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{w.tenant?.tenant_name ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{w.assignee?.name ?? "—"}</td>
                    <td className="px-4 py-2"><PriorityBadge p={w.priority}/></td>
                    <td className="px-4 py-2"><StatusBadge s={w.status}/></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{format(new Date(w.created_at), "MMM d, yyyy")}</td>
                    <td className="px-4 py-2 text-xs text-right">{w.estimated_hours ?? "—"} / {w.actual_hours ?? "—"}</td>
                  </tr>
                ))}
                {rows?.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No results</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
