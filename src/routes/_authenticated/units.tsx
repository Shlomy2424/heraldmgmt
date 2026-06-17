import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/units")({
  head: () => ({ meta: [{ title: "Units" }] }),
  component: UnitsPage,
});

function UnitsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ property_id: "", unit_number: "", unit_type: "apartment", floor: "" });
  const [filterProperty, setFilterProperty] = useState("all");

  const { data: properties } = useQuery({
    queryKey: ["properties-list"],
    queryFn: async () => (await supabase.from("properties").select("id,property_name").order("property_name")).data ?? [],
  });
  const { data: units } = useQuery({
    queryKey: ["units", filterProperty],
    queryFn: async () => {
      let q = supabase.from("units").select("*,property:properties(property_name)").order("unit_number");
      if (filterProperty !== "all") q = q.eq("property_id", filterProperty);
      return (await q).data ?? [];
    },
  });

  async function save() {
    if (!form.property_id || !form.unit_number) return;
    const { error } = await supabase.from("units").insert(form);
    if (error) toast.error(error.message);
    else { toast.success("Created"); setOpen(false); qc.invalidateQueries({ queryKey: ["units"] }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl">Units</h1>
          <p className="text-sm text-muted-foreground">Individual units in each property</p>
        </div>
        <div className="flex gap-2">
          <Select value={filterProperty} onValueChange={setFilterProperty}>
            <SelectTrigger className="w-56"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {(properties ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4 mr-1"/>New Unit</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Unit</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Property *</Label>
                  <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                    <SelectContent>{(properties ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Unit number *</Label><Input value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })}/></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5"><Label>Type</Label><Input value={form.unit_type} onChange={(e) => setForm({ ...form, unit_type: e.target.value })}/></div>
                  <div className="space-y-1.5"><Label>Floor</Label><Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })}/></div>
                </div>
              </div>
              <DialogFooter><Button onClick={save}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left px-4 py-2">Property</th><th className="text-left px-4 py-2">Unit</th><th className="text-left px-4 py-2">Type</th><th className="text-left px-4 py-2">Floor</th></tr>
            </thead>
            <tbody className="divide-y">
              {(units ?? []).map((u: any) => (
                <tr key={u.id}>
                  <td className="px-4 py-2">{u.property?.property_name}</td>
                  <td className="px-4 py-2 font-medium">{u.unit_number}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.unit_type}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.floor ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
