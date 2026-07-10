import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Trash2, Power, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-settings")({
  head: () => ({ meta: [{ title: "Admin Settings" }] }),
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const { hasRole, loading, user } = useAuth();
  const qc = useQueryClient();
  const [appName, setAppName] = useState("");
  const [brandColor, setBrandColor] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (data) { setAppName(data.app_name ?? ""); setBrandColor(data.brand_color ?? ""); }
      return data;
    },
  });

  const { data: properties } = useQuery({
    queryKey: ["admin-properties"],
    queryFn: async () => (await supabase.from("properties").select("id,property_name,active").order("property_name")).data ?? [],
  });
  const { data: units } = useQuery({
    queryKey: ["admin-units"],
    queryFn: async () => (await supabase.from("units").select("id,unit_number,active,property:properties(property_name)").order("unit_number")).data ?? [],
  });
  const { data: tenants } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: async () => (await supabase.from("tenants").select("id,tenant_name,active").order("tenant_name")).data ?? [],
  });

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!hasRole(["admin"])) return <div className="text-sm text-muted-foreground">Admin only.</div>;

  async function saveSettings() {
    const { error } = await supabase.from("app_settings").update({
      app_name: appName, brand_color: brandColor || null, updated_at: new Date().toISOString(), updated_by: user?.id,
    }).eq("id", 1);
    if (error) toast.error(error.message); else { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["app-settings"] }); }
  }

  async function toggle(table: "properties" | "units" | "tenants", id: string, active: boolean) {
    const { error } = await supabase.from(table).update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(active ? "Deactivated" : "Reactivated"); qc.invalidateQueries(); }
  }
  async function hardDelete(table: "properties" | "units" | "tenants", id: string, name: string) {
    if (!confirm(`Permanently delete "${name}"? Related work orders will lose the link.`)) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); qc.invalidateQueries(); }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-3xl">Admin Settings</h1>
        <p className="text-sm text-muted-foreground">App branding and safe delete/deactivate controls</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
        <CardContent className="space-y-3 max-w-md">
          <div className="space-y-1.5"><Label>App name</Label><Input value={appName} onChange={(e) => setAppName(e.target.value)}/></div>
          <div className="space-y-1.5"><Label>Brand accent color (CSS oklch or hex)</Label><Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} placeholder="e.g. #0e4a6b"/></div>
          <Button onClick={saveSettings}>Save</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Data management</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="properties">
            <TabsList>
              <TabsTrigger value="properties">Properties</TabsTrigger>
              <TabsTrigger value="units">Units</TabsTrigger>
              <TabsTrigger value="tenants">Tenants</TabsTrigger>
            </TabsList>
            <TabsContent value="properties">
              <RowTable rows={(properties ?? []).map((r: any) => ({ id: r.id, name: r.property_name, active: r.active }))}
                onToggle={(id, a) => toggle("properties", id, a)}
                onDelete={(id, n) => hardDelete("properties", id, n)}/>
            </TabsContent>
            <TabsContent value="units">
              <RowTable rows={(units ?? []).map((r: any) => ({ id: r.id, name: `${r.property?.property_name ?? "—"} • ${r.unit_number}`, active: r.active }))}
                onToggle={(id, a) => toggle("units", id, a)}
                onDelete={(id, n) => hardDelete("units", id, n)}/>
            </TabsContent>
            <TabsContent value="tenants">
              <RowTable rows={(tenants ?? []).map((r: any) => ({ id: r.id, name: r.tenant_name, active: r.active }))}
                onToggle={(id, a) => toggle("tenants", id, a)}
                onDelete={(id, n) => hardDelete("tenants", id, n)}/>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <DropdownOptionsCard optionType="category" title="Categories" />
      <DropdownOptionsCard optionType="job_type" title="Job types" />

      <Card>
        <CardHeader><CardTitle>Email invites</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>Invite emails are sent through the built-in email queue. Domain and DNS status is available in Cloud → Emails.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function RowTable({ rows, onToggle, onDelete }: { rows: { id: string; name: string; active: boolean }[]; onToggle: (id: string, active: boolean) => void; onDelete: (id: string, name: string) => void }) {
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2 w-24">Status</th><th className="text-right px-4 py-2 w-40">Actions</th></tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2">{r.name}</td>
              <td className="px-4 py-2">
                <span className={`text-xs px-2 py-0.5 rounded ${r.active ? "bg-success/15 text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                  {r.active ? "Active" : "Deactivated"}
                </span>
              </td>
              <td className="px-4 py-2 text-right space-x-1">
                <Button size="sm" variant="outline" onClick={() => onToggle(r.id, r.active)}>
                  <Power className="size-3 mr-1"/> {r.active ? "Deactivate" : "Reactivate"}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(r.id, r.name)}>
                  <Trash2 className="size-3"/>
                </Button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Nothing here.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function DropdownOptionsCard({ optionType, title }: { optionType: string; title: string }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const { data: opts } = useQuery({
    queryKey: ["dropdown_options", optionType],
    queryFn: async () => (await supabase.from("dropdown_options").select("*").eq("option_type", optionType).order("sort_order").order("label")).data ?? [],
  });
  async function add() {
    if (!label.trim()) return;
    const value = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const { error } = await supabase.from("dropdown_options").insert({ option_type: optionType, label: label.trim(), value, active: true });
    if (error) toast.error(error.message);
    else { setLabel(""); qc.invalidateQueries({ queryKey: ["dropdown_options", optionType] }); }
  }
  async function toggle(id: string, active: boolean) {
    const { error } = await supabase.from("dropdown_options").update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["dropdown_options", optionType] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this option?")) return;
    const { error } = await supabase.from("dropdown_options").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["dropdown_options", optionType] });
  }
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 max-w-md">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Add ${title.toLowerCase().replace(/s$/, "")}…`}/>
          <Button onClick={add}><Plus className="size-4 mr-1"/>Add</Button>
        </div>
        <div className="divide-y">
          {(opts ?? []).map((o: any) => (
            <div key={o.id} className="flex items-center justify-between py-2 text-sm">
              <div><span className="font-medium">{o.label}</span> <span className="text-xs text-muted-foreground">({o.value})</span></div>
              <div className="space-x-1">
                <span className={`text-xs px-2 py-0.5 rounded ${o.active ? "bg-success/15" : "bg-muted text-muted-foreground"}`}>{o.active ? "Active" : "Off"}</span>
                <Button size="sm" variant="outline" onClick={() => toggle(o.id, o.active)}><Power className="size-3"/></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(o.id)}><Trash2 className="size-3"/></Button>
              </div>
            </div>
          ))}
          {opts?.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">No options yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}
