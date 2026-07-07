import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Mail, Phone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { WOTable } from "./properties.$id";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/tenants/$id")({
  head: () => ({ meta: [{ title: "Tenant" }] }),
  component: TenantDetail,
});

function TenantDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { hasRole } = useAuth();
  const canSeePII = hasRole(["admin", "manager"]);

  const { data: tenant } = useQuery({
    queryKey: ["tenant", id],
    queryFn: async () => (await supabase.from("tenants").select("*,property:properties(id,property_name),unit:units(id,unit_number)").eq("id", id).maybeSingle()).data,
  });
  const { data: workOrders } = useQuery({
    queryKey: ["tenant-wo", id],
    queryFn: async () => (await supabase.from("work_orders")
      .select("id,job_number,title,status,priority,created_at,closed_at,unit:units(unit_number),assignee:profiles!work_orders_assigned_to_fkey(name)")
      .eq("tenant_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  if (!tenant) return <div className="text-muted-foreground">Loading… (technicians can only see tenants tied to their assigned open work orders)</div>;

  const openWO = (workOrders ?? []).filter((w: any) => !["closed","cancelled"].includes(w.status));
  const closedWO = (workOrders ?? []).filter((w: any) => ["closed","cancelled"].includes(w.status));

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <Link to="/tenants" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="size-3"/> All Tenants</Link>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl">{tenant.tenant_name}</h1>
          <p className="text-sm text-muted-foreground">
            {tenant.property && <Link to="/properties/$id" params={{ id: tenant.property.id }} className="hover:underline">{tenant.property.property_name}</Link>}
            {tenant.unit && <> • <Link to="/units/$id" params={{ id: tenant.unit.id }} className="hover:underline">Unit {tenant.unit.unit_number}</Link></>}
          </p>
        </div>
        <Button onClick={() => nav({ to: "/work-orders/new", search: { tenant_id: id, unit_id: tenant.unit?.id, property_id: tenant.property?.id } as any })}>
          <Plus className="size-4 mr-1"/>New Work Order
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {tenant.phone && <div className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground"/><a href={`tel:${tenant.phone}`} className="hover:underline">{tenant.phone}</a></div>}
          {tenant.email && <div className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground"/><a href={`mailto:${tenant.email}`} className="hover:underline">{tenant.email}</a></div>}
          {!tenant.phone && !tenant.email && <div className="text-muted-foreground">No contact info</div>}
          {canSeePII && tenant.move_in_date && <div className="text-xs text-muted-foreground">Move-in: {format(new Date(tenant.move_in_date), "MMM d, yyyy")}</div>}
          {canSeePII && tenant.move_out_date && <div className="text-xs text-muted-foreground">Move-out: {format(new Date(tenant.move_out_date), "MMM d, yyyy")}</div>}
        </CardContent>
      </Card>

      {canSeePII && (tenant.access_notes || tenant.special_instructions || tenant.lease_notes) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes (admin/manager only)</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {tenant.access_notes && <div><div className="text-xs font-medium text-muted-foreground">Access</div><p className="whitespace-pre-wrap">{tenant.access_notes}</p></div>}
            {tenant.special_instructions && <div><div className="text-xs font-medium text-muted-foreground">Special instructions</div><p className="whitespace-pre-wrap">{tenant.special_instructions}</p></div>}
            {tenant.lease_notes && <div><div className="text-xs font-medium text-muted-foreground">Lease</div><p className="whitespace-pre-wrap">{tenant.lease_notes}</p></div>}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open Jobs ({openWO.length})</TabsTrigger>
          <TabsTrigger value="closed">History ({closedWO.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open"><WOTable rows={openWO}/></TabsContent>
        <TabsContent value="closed"><WOTable rows={closedWO}/></TabsContent>
      </Tabs>
    </div>
  );
}
