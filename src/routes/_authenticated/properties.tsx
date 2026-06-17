import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/properties")({
  head: () => ({ meta: [{ title: "Properties" }] }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ property_name: "", address: "", city: "", state: "", zip: "" });

  const { data } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => (await supabase.from("properties").select("*,units(count)").order("property_name")).data ?? [],
  });

  async function save() {
    if (!form.property_name) return;
    const { error } = await supabase.from("properties").insert(form);
    if (error) toast.error(error.message);
    else { toast.success("Created"); setOpen(false); setForm({ property_name: "", address: "", city: "", state: "", zip: "" }); qc.invalidateQueries({ queryKey: ["properties"] }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl">Properties</h1>
          <p className="text-sm text-muted-foreground">Buildings managed by the team</p>
        </div>
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
            </div>
            <DialogFooter><Button onClick={save}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(data ?? []).map((p: any) => (
          <Card key={p.id}><CardContent className="p-4">
            <div className="font-display text-lg">{p.property_name}</div>
            <div className="text-sm text-muted-foreground">{p.address ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-2">{p.units?.[0]?.count ?? 0} units</div>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
