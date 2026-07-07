import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { StatusBadge, PriorityBadge } from "./dashboard";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  head: () => ({ meta: [{ title: "Property" }] }),
  component: PropertyDetail,
});

function PropertyDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canWrite = hasRole(["admin", "manager"]);
  const [unitOpen, setUnitOpen] = useState(false);
  const [unitForm, setUnitForm] = useState({ unit_number: "", unit_type: "apartment", floor: "", notes: "" });

  const { data: property } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => (await supabase.from("properties").select("*").eq("id", id).maybeSingle()).data,
  });
  const { data: units } = useQuery({
    queryKey: ["property-units", id],
    queryFn: async () => (await supabase.from("units").select("*").eq("property_id", id).order("unit_number")).data ?? [],
  });
  const { data: tenants } = useQuery({
    queryKey: ["property-tenants", id],
    queryFn: async () => (await supabase.from("tenants").select("id,tenant_name,unit_id,unit:units(unit_number)").eq("property_id", id)).data ?? [],
  });
  const { data: workOrders } = useQuery({
    queryKey: ["property-wo", id],
    queryFn: async () => (await supabase.from("work_orders")
      .select("id,job_number,title,status,priority,created_at,closed_at,unit_id,unit:units(unit_number),assignee:profiles!work_orders_assigned_to_fkey(name)")
      .eq("property_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  async function saveUnit() {
    if (!unitForm.unit_number) return;
    const { error } = await supabase.from("units").insert({ property_id: id, ...unitForm });
    if (error) toast.error(error.message);
    else { toast.success("Unit added"); setUnitOpen(false); setUnitForm({ unit_number: "", unit_type: "apartment", floor: "", notes: "" }); qc.invalidateQueries({ queryKey: ["property-units", id] }); }
  }

  if (!property) return <div className="text-muted-foreground">Loading…</div>;

  const openWO = (workOrders ?? []).filter((w: any) => !["closed","cancelled"].includes(w.status));
  const closedWO = (workOrders ?? []).filter((w: any) => ["closed","cancelled"].includes(w.status));
  const openByUnit = useMemo(() => {
    const m = new Map<string, number>();
    openWO.forEach((w: any) => { if (w.unit_id) m.set(w.unit_id, (m.get(w.unit_id) ?? 0) + 1); });
    return m;
  }, [openWO]);
  const tenantByUnit = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    (tenants ?? []).forEach((t: any) => {
      if (!t.unit_id) return;
      const list = m.get(t.unit_id) ?? [];
      list.push({ id: t.id, name: t.tenant_name });
      m.set(t.unit_id, list);
    });
    return m;
  }, [tenants]);

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <Link to="/properties" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="size-3"/> All Properties</Link>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl">{property.property_name}</h1>
          <p className="text-sm text-muted-foreground">{[property.address, property.city, property.state, property.zip].filter(Boolean).join(", ") || "—"}</p>
        </div>
        <Button onClick={() => nav({ to: "/work-orders/new", search: { property_id: id } as any })}><Plus className="size-4 mr-1"/>New Work Order</Button>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Stat label="Units" value={units?.length ?? 0}/>
        <Stat label="Tenants" value={tenants?.length ?? 0}/>
        <Stat label="Open jobs" value={openWO.length}/>
        <Stat label="Closed jobs" value={closedWO.length}/>
      </div>

      {property.notes && (
        <Card><CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{property.notes}</p></CardContent></Card>
      )}

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open Jobs ({openWO.length})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({closedWO.length})</TabsTrigger>
          <TabsTrigger value="units">Units ({units?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="tenants">Tenants ({tenants?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="open"><WOTable rows={openWO}/></TabsContent>
        <TabsContent value="closed"><WOTable rows={closedWO}/></TabsContent>
        <TabsContent value="units">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Units</CardTitle>
              {canWrite && (
                <Dialog open={unitOpen} onOpenChange={setUnitOpen}>
                  <DialogTrigger asChild><Button size="sm"><Plus className="size-3 mr-1"/>Add Unit</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>New Unit</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5"><Label>Unit number *</Label><Input value={unitForm.unit_number} onChange={(e) => setUnitForm({ ...unitForm, unit_number: e.target.value })}/></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5"><Label>Type</Label><Input value={unitForm.unit_type} onChange={(e) => setUnitForm({ ...unitForm, unit_type: e.target.value })}/></div>
                        <div className="space-y-1.5"><Label>Floor</Label><Input value={unitForm.floor} onChange={(e) => setUnitForm({ ...unitForm, floor: e.target.value })}/></div>
                      </div>
                      <div className="space-y-1.5"><Label>Notes</Label><Textarea value={unitForm.notes} onChange={(e) => setUnitForm({ ...unitForm, notes: e.target.value })}/></div>
                    </div>
                    <DialogFooter><Button onClick={saveUnit}>Create</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {(units ?? []).map((u: any) => (
                  <Link key={u.id} to="/units/$id" params={{ id: u.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <HomeIcon className="size-4 text-muted-foreground"/>
                    <div className="font-medium">Unit {u.unit_number}</div>
                    <div className="text-xs text-muted-foreground">{u.unit_type}{u.floor ? ` • Floor ${u.floor}` : ""}</div>
                  </Link>
                ))}
                {units?.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No units yet.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tenants">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {(tenants ?? []).map((t: any) => (
                  <Link key={t.id} to="/tenants/$id" params={{ id: t.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <Users className="size-4 text-muted-foreground"/>
                    <div className="font-medium">{t.tenant_name}</div>
                    {t.unit?.unit_number && <div className="text-xs text-muted-foreground">Unit {t.unit.unit_number}</div>}
                  </Link>
                ))}
                {tenants?.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No tenants recorded (admin/manager only).</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-display mt-1">{value}</div></CardContent></Card>;
}

export function WOTable({ rows }: { rows: any[] }) {
  const nav = useNavigate();
  if (!rows.length) return <div className="p-8 text-center text-sm text-muted-foreground">No work orders.</div>;
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Job #</th>
              <th className="text-left px-4 py-2">Title</th>
              <th className="text-left px-4 py-2 hidden md:table-cell">Unit</th>
              <th className="text-left px-4 py-2 hidden md:table-cell">Assigned</th>
              <th className="text-left px-4 py-2">Priority</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2 hidden sm:table-cell">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((w: any) => (
              <tr key={w.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => nav({ to: "/work-orders/$id", params: { id: w.id } })}>
                <td className="px-4 py-2 font-mono text-xs">{w.job_number}</td>
                <td className="px-4 py-2 font-medium">{w.title}</td>
                <td className="px-4 py-2 hidden md:table-cell text-xs">{w.unit?.unit_number ?? "—"}</td>
                <td className="px-4 py-2 hidden md:table-cell text-xs">{w.assignee?.name ?? "—"}</td>
                <td className="px-4 py-2"><PriorityBadge p={w.priority}/></td>
                <td className="px-4 py-2"><StatusBadge s={w.status}/></td>
                <td className="px-4 py-2 hidden sm:table-cell text-xs text-muted-foreground">{format(new Date(w.closed_at ?? w.created_at), "MMM d, yyyy")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
