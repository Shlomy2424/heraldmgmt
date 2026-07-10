import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({ meta: [{ title: "Properties" }] }),
  component: PropertiesPage,
});

type SortKey = "property_name"|"address"|"city"|"units"|"open";

function PropertiesPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole(["admin", "manager"]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("property_name");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [form, setForm] = useState({ property_name: "", address: "", city: "", state: "", zip: "", notes: "" });

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

  const openByProp = new Map<string, number>();
  (openWO ?? []).forEach((w: any) => { if (w.property_id) openByProp.set(w.property_id, (openByProp.get(w.property_id) ?? 0) + 1); });

  const sorted = useMemo(() => {
    const arr = (data ?? []).filter((p: any) => !q || p.property_name?.toLowerCase().includes(q.toLowerCase()) || p.address?.toLowerCase().includes(q.toLowerCase()));
    return [...arr].sort((a: any, b: any) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "units": av = a.units?.[0]?.count ?? 0; bv = b.units?.[0]?.count ?? 0; break;
        case "open": av = openByProp.get(a.id) ?? 0; bv = openByProp.get(b.id) ?? 0; break;
        default: av = (a[sortKey] ?? "").toLowerCase?.() ?? ""; bv = (b[sortKey] ?? "").toLowerCase?.() ?? "";
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, openByProp, q, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "units" || k === "open" ? "desc" : "asc"); }
  }
  function SortTh({ k, label, className }: { k: SortKey; label: string; className?: string }) {
    return (
      <th className={`text-left px-4 py-2 select-none ${className ?? ""}`}>
        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(k)}>
          {label}
          {sortKey === k && (sortDir === "asc" ? <ArrowUp className="size-3"/> : <ArrowDown className="size-3"/>)}
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl">Properties</h1>
          <p className="text-sm text-muted-foreground">Buildings managed by the team</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Search name or address…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56"/>
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
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <SortTh k="property_name" label="Name"/>
                <SortTh k="address" label="Address" className="hidden md:table-cell"/>
                <SortTh k="city" label="City" className="hidden lg:table-cell"/>
                <SortTh k="units" label="Units"/>
                <SortTh k="open" label="Open jobs"/>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => nav({ to: "/properties/$id", params: { id: p.id } })}>
                  <td className="px-4 py-2 font-medium">
                    <Link to="/properties/$id" params={{ id: p.id }} onClick={(e) => e.stopPropagation()} className="hover:underline">{p.property_name}</Link>
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell text-muted-foreground">{p.address ?? "—"}</td>
                  <td className="px-4 py-2 hidden lg:table-cell text-muted-foreground">{p.city ?? "—"}</td>
                  <td className="px-4 py-2">{p.units?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-2">
                    <Link to="/work-orders" search={{ status: "open", property_id: p.id } as any} onClick={(e) => e.stopPropagation()} className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-xs font-medium">
                      {openByProp.get(p.id) ?? 0}
                    </Link>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No properties match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
