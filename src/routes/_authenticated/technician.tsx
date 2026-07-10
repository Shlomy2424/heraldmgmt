import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { PriorityBadge, StatusBadge } from "./dashboard";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/technician")({
  head: () => ({ meta: [{ title: "Technician View" }] }),
  component: TechView,
});

function TechView() {
  const { user } = useAuth();
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["my-jobs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("work_orders")
        .select("id,job_number,title,priority,status,created_at,closed_at,scheduled_date,estimated_hours,actual_hours,property_id,property:properties(property_name,address),unit:units(unit_number),tenant:tenants(tenant_name,phone)")
        .eq("assigned_to", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: properties } = useQuery({
    queryKey: ["my-props", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const propIds = [...new Set((jobs ?? []).map((j: any) => j.property_id).filter(Boolean))];
      if (!propIds.length) return [];
      return (await supabase.from("properties").select("id,property_name").in("id", propIds).order("property_name")).data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return (jobs ?? []).filter((w: any) => {
      if (propertyFilter !== "all" && w.property_id !== propertyFilter) return false;
      if (from && new Date(w.created_at) < new Date(from)) return false;
      if (to && new Date(w.created_at) > new Date(to + "T23:59:59")) return false;
      return true;
    });
  }, [jobs, propertyFilter, from, to]);

  const open = filtered.filter((w: any) => !["closed","cancelled"].includes(w.status));
  const completed = filtered.filter((w: any) => ["closed","cancelled","done"].includes(w.status));

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl">My Jobs</h1>
        <p className="text-sm text-muted-foreground">Tap a job to view details, add notes & photos</p>
      </div>

      <Card><CardContent className="p-3 flex flex-wrap gap-2 items-center">
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Property"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties</SelectItem>
            {(properties ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40"/>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40"/>
      </CardContent></Card>

      {isLoading && <div className="text-muted-foreground">Loading…</div>}

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open"><JobList rows={open}/></TabsContent>
        <TabsContent value="completed"><JobList rows={completed}/></TabsContent>
      </Tabs>
    </div>
  );
}

function JobList({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <Card><CardContent className="p-8 text-center text-muted-foreground">No jobs here.</CardContent></Card>;
  return (
    <div className="space-y-2">
      {rows.map((w: any) => (
        <Link key={w.id} to="/work-orders/$id" params={{ id: w.id }}>
          <Card className="hover:border-primary transition-colors">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <PriorityBadge p={w.priority}/>
                <StatusBadge s={w.status}/>
                <span className="font-mono text-xs text-muted-foreground ml-auto">{w.job_number}</span>
              </div>
              <div className="font-medium">{w.title}</div>
              <div className="text-sm text-muted-foreground">
                {w.property?.property_name} {w.unit?.unit_number && `• Unit ${w.unit.unit_number}`}
              </div>
              {w.tenant && <div className="text-xs text-muted-foreground">Tenant: {w.tenant.tenant_name} {w.tenant.phone && `• ${w.tenant.phone}`}</div>}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t">
                {w.scheduled_date && <span>Visit: {format(new Date(w.scheduled_date), "MMM d")}</span>}
                <span>Est: {w.estimated_hours ?? "—"} h</span>
                <span>Actual: {w.actual_hours ?? "—"} h</span>
                {w.closed_at && <span>Closed: {format(new Date(w.closed_at), "MMM d")}</span>}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
