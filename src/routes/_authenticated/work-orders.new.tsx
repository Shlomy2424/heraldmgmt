import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Upload, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/work-orders/new")({
  head: () => ({ meta: [{ title: "New Work Order" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    property_id: (s.property_id as string) ?? "",
    unit_id: (s.unit_id as string) ?? "",
    tenant_id: (s.tenant_id as string) ?? "",
  }),
  component: NewWO,
});

const JOB_TYPES: { value: string; label: string }[] = [
  { value: "in_house", label: "In House" },
  { value: "outsourced", label: "Outsourced" },
];

function NewWO() {
  const nav = useNavigate();
  const { user, hasRole, loading: authLoading } = useAuth();
  const isAdmin = hasRole(["admin"]);
  const canCreate = hasRole(["admin", "manager", "technician"]);
  const initial = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [form, setForm] = useState({
    title: "",
    task_description: "",
    priority: "normal",
    category: "",
    job_type: "",
    property_id: initial.property_id,
    unit_id: initial.unit_id,
    tenant_id: initial.tenant_id,
    assigned_to: "",
    due_at: "",
    scheduled_date: "",
    start_time: "",
    estimated_hours: "",
    parts_needed: "",
    follow_up: "no",
    follow_up_date: "",
    follow_up_notes: "",
    payer_responsibility: "",
    admin_estimated_hours: "",
  });

  const { data: properties } = useQuery({
    queryKey: ["properties-active"],
    queryFn: async () => (await supabase.from("properties").select("id,property_name").eq("active", true).order("property_name")).data ?? [],
  });
  const { data: units } = useQuery({
    queryKey: ["units-by-property", form.property_id],
    queryFn: async () => form.property_id
      ? (await supabase.from("units").select("id,unit_number").eq("property_id", form.property_id).order("unit_number")).data ?? []
      : [],
  });
  const { data: tenants } = useQuery({
    queryKey: ["tenants-by-unit", form.unit_id],
    queryFn: async () => form.unit_id
      ? (await supabase.from("tenants").select("id,tenant_name").eq("unit_id", form.unit_id)).data ?? []
      : [],
  });
  const { data: techs } = useQuery({
    queryKey: ["techs"],
    queryFn: async () => {
      const { data: ur } = await supabase.from("user_roles").select("user_id").in("role", ["technician", "manager", "admin"]);
      const ids = [...new Set((ur ?? []).map((r) => r.user_id))];
      if (!ids.length) return [];
      return (await supabase.from("profiles").select("id,name").in("id", ids).order("name")).data ?? [];
    },
  });
  const { data: categories } = useQuery({
    queryKey: ["dropdown-categories"],
    queryFn: async () => (await supabase.from("dropdown_options").select("option_value").eq("option_type", "category").eq("active", true).order("sort_order")).data ?? [],
  });

  // Same-day conflicts for chosen tech
  const { data: conflicts } = useQuery({
    queryKey: ["schedule-conflicts", form.scheduled_date, form.assigned_to],
    enabled: !!form.scheduled_date && !!form.assigned_to,
    queryFn: async () =>
      (await supabase.from("schedule_visits")
        .select("id,start_time,work_order:work_orders(job_number,title)")
        .eq("scheduled_date", form.scheduled_date)
        .eq("assigned_to", form.assigned_to)).data ?? [],
  });

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotos((p) => [...p, ...files]);
    if (fileRef.current) fileRef.current.value = "";
  }
  function removePhoto(i: number) { setPhotos((p) => p.filter((_, idx) => idx !== i)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) { toast.error("Not signed in"); return; }
    if (!canCreate) {
      toast.error("Your role does not allow creating work orders. Contact an administrator.");
      return;
    }
    if (!form.job_type) { toast.error("Job type is required"); return; }
    setBusy(true);
    try {
      const payload: any = {
        title: form.title,
        task_description: form.task_description || null,
        priority: form.priority as any,
        category: form.category || null,
        job_type: form.job_type || null,
        property_id: form.property_id || null,
        unit_id: form.unit_id || null,
        tenant_id: form.tenant_id || null,
        assigned_to: form.assigned_to || null,
        created_by: user.id,
        job_number: "",
        status: form.scheduled_date ? "scheduled" : form.assigned_to ? "scheduled" : "new",
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        parts_needed: form.parts_needed || null,
        follow_up: form.follow_up as any,
        follow_up_date: form.follow_up_date || null,
        follow_up_notes: form.follow_up_notes || null,
      };
      if (isAdmin) {
        payload.payer_responsibility = form.payer_responsibility || null;
        payload.admin_estimated_hours = form.admin_estimated_hours ? Number(form.admin_estimated_hours) : null;
      }
      const { data: wo, error } = await supabase.from("work_orders").insert(payload).select("id,job_number").single();
      if (error) throw error;

      // Create schedule_visits row if scheduled — surface any failure to the user
      // instead of swallowing it. Roll back the work order so the record isn't
      // left inconsistent, then throw the actual error.
      if (form.scheduled_date) {
        const { error: svErr } = await supabase.from("schedule_visits").insert({
          work_order_id: wo.id,
          scheduled_date: form.scheduled_date,
          start_time: form.start_time || null,
          estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
          assigned_to: form.assigned_to || null,
          created_by: user.id,
        });
        if (svErr) {
          console.error("schedule_visits insert failed", svErr);
          // Try to remove the just-created work order so the user can retry cleanly.
          await supabase.from("work_orders").delete().eq("id", wo.id);
          throw new Error(`Couldn't save the calendar entry: ${svErr.message}. Work order was not created — please try again.`);
        }
      }

      // Upload photos
      for (const file of photos) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${wo.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("work-order-photos").upload(path, file, { contentType: file.type });
        if (upErr) { toast.error(`Photo upload failed: ${upErr.message}`); continue; }
        await supabase.from("photos").insert({
          work_order_id: wo.id, storage_path: path, file_name: file.name,
          file_type: file.type, uploaded_by: user.id, photo_category: "before",
        });
      }

      toast.success(`Created ${wo.job_number}`);
      nav({ to: "/work-orders/$id", params: { id: wo.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create work order");
    } finally { setBusy(false); }
  }

  if (!authLoading && !canCreate) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader><CardTitle>Not allowed</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Your role doesn't allow creating work orders. Ask an administrator to grant you technician, manager, or admin access.
            <div className="mt-3"><Button variant="outline" onClick={() => nav({ to: "/work-orders" })}>Back to Work Orders</Button></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
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
              <Textarea rows={3} value={form.task_description} onChange={(e) => setForm({ ...form, task_description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Priority</Label>
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
              <div className="space-y-1.5"><Label>Job type *</Label>
                <Select value={form.job_type} onValueChange={(v) => setForm({ ...form, job_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{JOB_TYPES.map((j) => <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {(categories ?? []).map((c) => <SelectItem key={c.option_value} value={c.option_value}>{c.option_value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Property</Label>
                <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v, unit_id: "", tenant_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{(properties ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Unit</Label>
                <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v, tenant_id: "" })} disabled={!form.property_id}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{(units ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.unit_number}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Tenant</Label>
                <Select value={form.tenant_id} onValueChange={(v) => setForm({ ...form, tenant_id: v })} disabled={!form.unit_id}>
                  <SelectTrigger><SelectValue placeholder={form.unit_id && (tenants?.length ?? 0) === 0 ? "No tenants linked to this unit" : "Select…"} /></SelectTrigger>
                  <SelectContent>{(tenants ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.tenant_name}</SelectItem>)}</SelectContent>
                </Select>
                {form.unit_id && (tenants?.length ?? 0) === 0 && (
                  <p className="text-xs text-amber-700">No tenants are linked to this unit. Add one from the unit page.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Due date/time</Label>
                <Input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Assign to technician</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>{(techs ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Scheduled/visit date</Label>
                <Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Start time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Estimated hours</Label>
                <Input type="number" step="0.25" min="0" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} />
              </div>
            </div>

            {conflicts && conflicts.length > 0 && (
              <div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm">
                <div className="font-medium mb-1">Existing jobs for this technician on this day:</div>
                <ul className="text-xs space-y-0.5">
                  {conflicts.map((c: any) => (
                    <li key={c.id}>• {c.start_time ?? "—"} — {c.work_order?.job_number} {c.work_order?.title}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Parts needed</Label>
              <Textarea rows={2} value={form.parts_needed} onChange={(e) => setForm({ ...form, parts_needed: e.target.value })} placeholder="e.g. 2 x 15A breakers, pipe fittings"/>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Follow-up</Label>
                <Select value={form.follow_up} onValueChange={(v) => setForm({ ...form, follow_up: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No follow-up</SelectItem>
                    <SelectItem value="yes">Yes — follow up</SelectItem>
                    <SelectItem value="next_week">Next week</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="needs_manager_review">Needs manager review</SelectItem>
                    <SelectItem value="needs_tenant_response">Needs tenant response</SelectItem>
                    <SelectItem value="needs_parts">Needs parts</SelectItem>
                    <SelectItem value="needs_vendor">Needs vendor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Follow-up date</Label>
                <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Follow-up notes</Label>
                <Input value={form.follow_up_notes} onChange={(e) => setForm({ ...form, follow_up_notes: e.target.value })} />
              </div>
            </div>

            {isAdmin && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded border p-3 bg-muted/30">
                <div className="md:col-span-2 text-xs font-medium text-muted-foreground uppercase">Admin-only</div>
                <div className="space-y-1.5"><Label>Payer responsibility</Label>
                  <Select value={form.payer_responsibility} onValueChange={(v) => setForm({ ...form, payer_responsibility: v })}>
                    <SelectTrigger><SelectValue placeholder="Select…"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tenant">Tenant</SelectItem>
                      <SelectItem value="landlord">Landlord</SelectItem>
                      <SelectItem value="management">Management</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Admin estimated hours</Label>
                  <Input type="number" step="0.25" min="0" value={form.admin_estimated_hours} onChange={(e) => setForm({ ...form, admin_estimated_hours: e.target.value })}/>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Photos ({photos.length})</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="size-4 mr-1"/> Add
                </Button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={onFiles}/>
              {photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {photos.map((f, i) => (
                    <div key={i} className="relative aspect-square bg-muted rounded overflow-hidden">
                      <img src={URL.createObjectURL(f)} alt="" className="size-full object-cover"/>
                      <button type="button" onClick={() => removePhoto(i)} className="absolute top-1 right-1 bg-black/60 text-white rounded p-0.5">
                        <X className="size-3"/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
