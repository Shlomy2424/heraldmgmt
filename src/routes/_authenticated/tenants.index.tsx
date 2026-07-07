import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/tenants/")({
  head: () => ({ meta: [{ title: "Tenants" }] }),
  component: TenantsPage,
});

function TenantsPage() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canWrite = hasRole(["admin", "manager"]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ tenant_name: "", email: "", phone: "", property_id: "", unit_id: "" });

  const { data: properties } = useQuery({ queryKey: ["properties-list"], queryFn: async () => (await supabase.from("properties").select("id,property_name").order("property_name")).data ?? [] });
  const { data: units } = useQuery({
    queryKey: ["units-list", form.property_id],
    queryFn: async () => form.property_id ? (await supabase.from("units").select("id,unit_number").eq("property_id", form.property_id).order("unit_number")).data ?? [] : [],
  });
  const { data: tenants } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => (await supabase.from("tenants").select("*,property:properties(property_name),unit:units(unit_number)").order("tenant_name")).data ?? [],
  });

  async function save() {
    if (!form.tenant_name) return;
    const payload: any = { ...form, unit_id: form.unit_id || null, property_id: form.property_id || null };
    const { error } = await supabase.from("tenants").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success("Created"); setOpen(false); qc.invalidateQueries({ queryKey: ["tenants"] }); }
  }

  const filtered = (tenants ?? []).filter((t: any) => !q || t.tenant_name?.toLowerCase().includes(q.toLowerCase()) || t.email?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl">Tenants</h1>
          <p className="text-sm text-muted-foreground">People living in managed units {!canWrite && "— (limited access)"}</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56"/>
          {canWrite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="size-4 mr-1"/>New Tenant</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Tenant</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label>Name *</Label><Input value={form.tenant_name} onChange={(e) => setForm({ ...form, tenant_name: e.target.value })}/></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/></div>
                    <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/></div>
                  </div>
                  <div className="space-y-1.5"><Label>Property</Label>
                    <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v, unit_id: "" })}>
                      <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                      <SelectContent>{(properties ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Unit</Label>
                    <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })} disabled={!form.property_id}>
                      <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                      <SelectContent>{(units ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.unit_number}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter><Button onClick={save}>Create</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2">Property</th><th className="text-left px-4 py-2">Unit</th><th className="text-left px-4 py-2">Email</th><th className="text-left px-4 py-2">Phone</th></tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((t: any) => (
                <tr key={t.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium"><Link to="/tenants/$id" params={{ id: t.id }} className="text-primary hover:underline">{t.tenant_name}</Link></td>
                  <td className="px-4 py-2 text-muted-foreground">{t.property?.property_name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.unit?.unit_number ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.email ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.phone ?? "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No tenants visible. Technicians only see tenants for their assigned open work orders.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
