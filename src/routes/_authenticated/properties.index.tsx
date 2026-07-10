import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Building } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({ meta: [{ title: "Properties" }] }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canWrite = hasRole(["admin", "manager"]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ property_name: "", address: "", city: "", state: "", zip: "", notes: "" });

  const [sortBy, setSortBy] = useState<"name" | "open" | "units">("name");

  const { data } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => (await supabase.from("properties").select("*,units(count)").order("property_name")).data ?? [],
  });
  const { data: openWO } = useQuery({
    queryKey: ["properties-open-wo"],
    queryFn: async () => (await supabase.from("work_orders").select("property_id").not("status", "in", "(closed,cancelled)")).data ?? [],
  });

  async function save() {
    if (!form.property_name) return;
    const { error } = await supabase.from("properties").insert(form);
    if (error) toast.error(error.message);
    else { toast.success("Created"); setOpen(false); setForm({ property_name: "", address: "", city: "", state: "", zip: "", notes: "" }); qc.invalidateQueries({ queryKey: ["properties"] }); }
  }

  const filtered = (data ?? []).filter((p: any) => !q || p.property_name?.toLowerCase().includes(q.toLowerCase()) || p.address?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl">Properties</h1>
          <p className="text-sm text-muted-foreground">Buildings managed by the team</p>
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4 mr-1"/>New Property</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Property</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Name *</Label><Input value={form.property_name} onChange={(e) => setForm({ ...form, property_name: e.target.value })}/></div>
                <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}/></div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}/></div>
                  <div className="space-y-1.5"><Label>State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}/></div>
                  <div className="space-y-1.5"><Label>Zip</Label><Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })}/></div>
                </div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></div>
              </div>
              <DialogFooter><Button onClick={save}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <Input placeholder="Search property name or address…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md"/>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((p: any) => (
          <Link key={p.id} to="/properties/$id" params={{ id: p.id }}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0"><Building className="size-5"/></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-lg truncate">{p.property_name}</div>
                    <div className="text-sm text-muted-foreground truncate">{p.address ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-2">{p.units?.[0]?.count ?? 0} units</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && <div className="col-span-full text-center text-muted-foreground py-8 text-sm">No properties match.</div>}
      </div>
    </div>
  );
}
