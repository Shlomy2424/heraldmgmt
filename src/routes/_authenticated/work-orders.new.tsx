import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/work-orders/new")({
  head: () => ({ meta: [{ title: "New Work Order" }] }),
  component: NewWO,
});

function NewWO() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "", task_description: "", priority: "normal", category: "",
    property_id: "", unit_id: "", tenant_id: "", assigned_to: "",
  });

  const { data: properties } = useQuery({
    queryKey: ["properties-active"],
    queryFn: async () => (await supabase.from("properties").select("id,property_name").eq("active", true).order("property_name")).data ?? [],
  });
  const { data: units } = useQuery({
    queryKey: ["units-by-property", form.property_id],
    queryFn: async () => {
      if (!form.property_id) return [];
      return (await supabase.from("units").select("id,unit_number").eq("property_id", form.property_id).order("unit_number")).data ?? [];
    },
  });
  const { data: tenants } = useQuery({
    queryKey: ["tenants-by-unit", form.unit_id],
    queryFn: async () => {
      if (!form.unit_id) return [];
      return (await supabase.from("tenants").select("id,tenant_name").eq("unit_id", form.unit_id)).data ?? [];
    },
  });
  const { data: techs } = useQuery({
    queryKey: ["techs"],
    queryFn: async () => {
      const { data: ur } = await supabase.from("user_roles").select("user_id").in("role", ["technician", "manager", "admin"]);
      const ids = [...new Set((ur ?? []).map((r) => r.user_id))];
      if (ids.length === 0) return [];
      return (await supabase.from("profiles").select("id,name").in("id", ids).order("name")).data ?? [];
    },
  });
  const { data: categories } = useQuery({
    queryKey: ["dropdown-categories"],
    queryFn: async () => (await supabase.from("dropdown_options").select("option_value").eq("option_type", "category").eq("active", true).order("sort_order")).data ?? [],
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: any = {
        title: form.title,
        task_description: form.task_description || null,
        priority: form.priority as any,
        category: form.category || null,
        property_id: form.property_id || null,
        unit_id: form.unit_id || null,
        tenant_id: form.tenant_id || null,
        assigned_to: form.assigned_to || null,
        created_by: user?.id,
        job_number: "",
        status: form.assigned_to ? "scheduled" : "new",
      };
      const { data, error } = await supabase.from("work_orders").insert(payload).select("id").single();
      if (error) throw error;
      toast.success("Work order created");
      nav({ to: "/work-orders/$id", params: { id: data.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl mb-4">New Work Order</h1>
      <Card>
        <CardHeader><CardTitle>Job details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={4} value={form.task_description} onChange={(e) => setForm({ ...form, task_description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c) => <SelectItem key={c.option_value} value={c.option_value}>{c.option_value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Property</Label>
                <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v, unit_id: "", tenant_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(properties ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v, tenant_id: "" })} disabled={!form.property_id}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(units ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.unit_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tenant</Label>
                <Select value={form.tenant_id} onValueChange={(v) => setForm({ ...form, tenant_id: v })} disabled={!form.unit_id}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(tenants ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.tenant_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Assign to technician</Label>
              <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {(techs ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => nav({ to: "/work-orders" })}>Cancel</Button>
              <Button type="submit" disabled={busy || !form.title}>{busy ? "Creating…" : "Create"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
