import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { WOTable } from "./properties.$id";

export const Route = createFileRoute("/_authenticated/units/$id")({
  head: () => ({ meta: [{ title: "Unit" }] }),
  component: UnitDetail,
});

function UnitDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canWrite = hasRole(["admin", "manager"]);
  const [editOpen, setEditOpen] = useState(false);
  const [notesText, setNotesText] = useState("");

  const { data: unit } = useQuery({
    queryKey: ["unit", id],
    queryFn: async () => (await supabase.from("units").select("*,property:properties(id,property_name,address)").eq("id", id).maybeSingle()).data,
  });
  const { data: tenants } = useQuery({
    queryKey: ["unit-tenants", id],
    queryFn: async () => (await supabase.from("tenants").select("id,tenant_name,phone,email").eq("unit_id", id)).data ?? [],
  });
  const { data: workOrders } = useQuery({
    queryKey: ["unit-wo", id],
    queryFn: async () => (await supabase.from("work_orders")
      .select("id,job_number,title,status,priority,created_at,closed_at,unit:units(unit_number),assignee:profiles!work_orders_assigned_to_fkey(name)")
      .eq("unit_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  async function saveNotes() {
    const { error } = await supabase.from("units").update({ notes: notesText }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Notes saved"); setEditOpen(false); qc.invalidateQueries({ queryKey: ["unit", id] }); }
  }

  if (!unit) return <div className="text-muted-foreground">Loading…</div>;

  const openWO = (workOrders ?? []).filter((w: any) => !["closed","cancelled"].includes(w.status));
  const closedWO = (workOrders ?? []).filter((w: any) => ["closed","cancelled"].includes(w.status));

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <Link to="/properties/$id" params={{ id: unit.property.id }} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-3"/> Back to {unit.property.property_name}
      </Link>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl">Unit {unit.unit_number}</h1>
          <p className="text-sm text-muted-foreground">{unit.property.property_name} • {unit.unit_type}{unit.floor ? ` • Floor ${unit.floor}` : ""}</p>
        </div>
        <Button onClick={() => nav({ to: "/work-orders/new", search: { unit_id: id, property_id: unit.property.id } as any })}>
          <Plus className="size-4 mr-1"/>New Work Order
        </Button>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Stat label="Tenants" value={tenants?.length ?? 0}/>
        <Stat label="Open jobs" value={openWO.length}/>
        <Stat label="Closed jobs" value={closedWO.length}/>
        {hasRole(["admin"]) && <Stat label="Total calls (admin)" value={workOrders?.length ?? 0}/>}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Notes</CardTitle>
          {canWrite && !editOpen && <Button size="sm" variant="outline" onClick={() => { setNotesText(unit.notes ?? ""); setEditOpen(true); }}>Edit</Button>}
        </CardHeader>
        <CardContent>
          {editOpen ? (
            <div className="space-y-2">
              <Textarea rows={4} value={notesText} onChange={(e) => setNotesText(e.target.value)}/>
              <div className="flex gap-2"><Button size="sm" onClick={saveNotes}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button></div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{unit.notes || <span className="text-muted-foreground">No notes.</span>}</p>
          )}
          {unit.access_notes && <div className="mt-3 pt-3 border-t"><div className="text-xs font-medium text-muted-foreground mb-1">Access notes</div><p className="text-sm whitespace-pre-wrap">{unit.access_notes}</p></div>}
        </CardContent>
      </Card>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open Jobs ({openWO.length})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({closedWO.length})</TabsTrigger>
          <TabsTrigger value="tenants">Tenants ({tenants?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="open"><WOTable rows={openWO}/></TabsContent>
        <TabsContent value="closed"><WOTable rows={closedWO}/></TabsContent>
        <TabsContent value="tenants">
          <Card><CardContent className="p-0">
            <div className="divide-y">
              {(tenants ?? []).map((t: any) => (
                <Link key={t.id} to="/tenants/$id" params={{ id: t.id }} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50">
                  <div className="font-medium">{t.tenant_name}</div>
                  <div className="text-xs text-muted-foreground">{t.phone ?? ""}</div>
                </Link>
              ))}
              {tenants?.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No tenants recorded.</div>}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-display mt-1">{value}</div></CardContent></Card>;
}
