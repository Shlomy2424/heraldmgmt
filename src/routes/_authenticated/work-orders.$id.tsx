import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge, PriorityBadge } from "./dashboard";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/work-orders/$id")({
  head: ({ params }) => ({ meta: [{ title: `Work Order ${params.id.slice(0, 8)}` }] }),
  component: WODetail,
});

const ALL_STATUSES = ["new","scheduled","not_started","in_progress","waiting_parts","waiting_tenant","waiting_approval","could_not_access","done","manager_review","closed","reopened","cancelled"];
const TECH_STATUSES = ALL_STATUSES.filter((s) => s !== "closed" && s !== "cancelled");

function WODetail() {
  const { id } = Route.useParams();
  const { user, hasRole } = useAuth();
  const canClose = hasRole(["admin","manager"]);
  const isAdmin = hasRole(["admin"]);
  const statuses = canClose ? ALL_STATUSES : TECH_STATUSES;
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<"technician"|"manager"|"tenant"|"internal">("internal");
  const [actualHours, setActualHours] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: wo, refetch } = useQuery({
    queryKey: ["work-order", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_orders")
        .select("*,property:properties(property_name,address),unit:units(id,unit_number),tenant:tenants(id,tenant_name,phone,email),assignee:profiles!work_orders_assigned_to_fkey(name),creator:profiles!work_orders_created_by_fkey(name)")
        .eq("id", id).maybeSingle();
      if (data && (data as any).actual_hours != null) setActualHours(String((data as any).actual_hours));
      return data;
    },
  });

  const { data: callCounts } = useQuery({
    queryKey: ["wo-call-counts", (wo as any)?.unit?.id, (wo as any)?.tenant?.id],
    enabled: isAdmin && !!wo,
    queryFn: async () => {
      const unitId = (wo as any).unit?.id;
      const tenantId = (wo as any).tenant?.id;
      const [u, t] = await Promise.all([
        unitId ? supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("unit_id", unitId) : Promise.resolve({ count: 0 } as any),
        tenantId ? supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId) : Promise.resolve({ count: 0 } as any),
      ]);
      return { unit: u.count ?? 0, tenant: t.count ?? 0 };
    },
  });

  const { data: notes } = useQuery({
    queryKey: ["job-notes", id],
    queryFn: async () => (await supabase.from("job_notes").select("*,profile:profiles(name)").eq("work_order_id", id).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: photos } = useQuery({
    queryKey: ["photos", id],
    queryFn: async () => {
      const { data } = await supabase.from("photos")
        .select("*,uploader:profiles!photos_uploaded_by_fkey(name)")
        .eq("work_order_id", id).order("created_at", { ascending: false });
      const rows = data ?? [];
      // Resolve signed URLs for storage_path-backed photos; fall back to file_url for legacy rows.
      const out = await Promise.all(rows.map(async (p: any) => {
        if (p.storage_path) {
          const { data: s } = await supabase.storage.from("work-order-photos").createSignedUrl(p.storage_path, 3600);
          return { ...p, display_url: s?.signedUrl ?? p.file_url };
        }
        return { ...p, display_url: p.file_url };
      }));
      return out;
    },
  });
  const { data: history } = useQuery({
    queryKey: ["status-history", id],
    queryFn: async () => (await supabase.from("status_history").select("*,profile:profiles(name)").eq("work_order_id", id).order("created_at", { ascending: false })).data ?? [],
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

  async function saveActualHours() {
    const h = Number(actualHours);
    if (!isFinite(h) || h < 0) { toast.error("Enter a valid actual hours value"); return; }
    const { error } = await supabase.from("work_orders").update({ actual_hours: h }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Actual hours saved"); refetch(); }
  }
  async function setStatus(s: string) {
    if (s === "closed") {
      const h = Number(actualHours);
      if (!isFinite(h) || h <= 0) { toast.error("Enter Actual hours (greater than 0) before closing"); return; }
      const { error: hErr } = await supabase.from("work_orders").update({ actual_hours: h }).eq("id", id);
      if (hErr) { toast.error(hErr.message); return; }
    }
    const upd: any = { status: s };
    if (s === "closed") { upd.closed_at = new Date().toISOString(); upd.closed_by = user?.id; upd.completed = true; }
    if (s === "done") { upd.completed_at = new Date().toISOString(); upd.completed = true; }
    const { error } = await supabase.from("work_orders").update(upd).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Status updated"); refetch(); qc.invalidateQueries({ queryKey: ["status-history", id] }); }
  }
  async function setAssignee(uid: string) {
    const { error } = await supabase.from("work_orders").update({ assigned_to: uid || null }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Assigned"); refetch(); }
  }
  async function addNote() {
    if (!note.trim()) return;
    if (!user?.id) { toast.error("Not signed in"); return; }
    const { error } = await supabase.from("job_notes").insert({
      work_order_id: id, note_text: note.trim(), note_type: noteType, created_by: user.id,
    });
    if (error) toast.error(error.message); else { setNote(""); qc.invalidateQueries({ queryKey: ["job-notes", id] }); }
  }
  async function uploadPhoto(file: File) {
    if (!user?.id) { toast.error("Not signed in"); return; }
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("work-order-photos").upload(path, file, { contentType: file.type });
    if (upErr) { toast.error(upErr.message); return; }
    const { error: insErr } = await supabase.from("photos").insert({
      work_order_id: id,
      storage_path: path,
      file_name: file.name,
      file_type: file.type,
      uploaded_by: user.id,
      photo_category: "during",
    });
    if (insErr) {
      // clean up orphaned upload
      await supabase.storage.from("work-order-photos").remove([path]);
      toast.error(insErr.message);
      return;
    }
    toast.success("Photo uploaded");
    qc.invalidateQueries({ queryKey: ["photos", id] });
  }

  if (!wo) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Link to="/work-orders" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="size-3"/> Back</Link>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-muted-foreground">{wo.job_number}</span>
            <PriorityBadge p={wo.priority} />
            <StatusBadge s={wo.status} />
          </div>
          <h1 className="text-3xl mt-1">{wo.title}</h1>
          <p className="text-sm text-muted-foreground">
            {wo.property?.property_name} {wo.unit?.unit_number && `• Unit ${wo.unit.unit_number}`}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle>Description</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{wo.task_description || <span className="text-muted-foreground">No description</span>}</p></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes & Updates</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Select value={noteType} onValueChange={(v: any) => setNoteType(v)}>
                  <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="technician">Technician</SelectItem>
                    <SelectItem value="tenant">Tenant-visible</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" rows={2}/>
                <Button size="sm" onClick={addNote} disabled={!note.trim()}>Post note</Button>
              </div>
              <div className="divide-y border-t pt-2">
                {(notes ?? []).map((n: any) => (
                  <div key={n.id} className="py-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span><b className="text-foreground">{n.profile?.name ?? "Unknown"}</b> • {n.note_type}</span>
                      <span>{format(new Date(n.created_at), "MMM d, h:mm a")}</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{n.note_text}</div>
                  </div>
                ))}
                {notes?.length === 0 && <div className="py-4 text-sm text-muted-foreground text-center">No notes yet</div>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Photos</span>
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="size-4 mr-1"/> Upload
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value=""; }} />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(photos ?? []).map((p: any) => (
                  <div key={p.id} className="space-y-1">
                    <a href={p.display_url} target="_blank" rel="noreferrer" className="block aspect-square bg-muted rounded overflow-hidden">
                      <img src={p.display_url} alt={p.file_name ?? ""} className="size-full object-cover" loading="lazy"/>
                    </a>
                    <div className="text-[11px] leading-tight text-muted-foreground">
                      <div className="truncate"><b className="text-foreground">{p.uploader?.name ?? "Unknown"}</b></div>
                      <div>{format(new Date(p.created_at), "MMM d, yyyy h:mm a")}</div>
                    </div>
                  </div>
                ))}
                {photos?.length === 0 && <div className="col-span-full text-sm text-muted-foreground text-center py-6 flex flex-col items-center gap-2"><ImageIcon className="size-6"/> No photos yet</div>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={wo.status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assigned to</Label>
                <Select value={wo.assigned_to ?? ""} onValueChange={setAssignee}>
                  <SelectTrigger><SelectValue placeholder="Unassigned"/></SelectTrigger>
                  <SelectContent>
                    {(techs ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Actual hours {(!wo.actual_hours || Number(wo.actual_hours) <= 0) && <span className="text-amber-700 text-xs">(required to close)</span>}</Label>
                <div className="flex gap-2">
                  <Input type="number" step="0.25" min="0" value={actualHours} onChange={(e) => setActualHours(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={saveActualHours}>Save</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Address" value={wo.property?.address ?? "—"}/>
              <Row label="Tenant" value={wo.tenant?.tenant_name ?? "—"}/>
              <Row label="Tenant phone" value={wo.tenant?.phone ?? "—"}/>
              <Row label="Category" value={wo.category ?? "—"}/>
              <Row label="Job type" value={wo.job_type ?? "—"}/>
              <Row label="Due" value={wo.due_at ? format(new Date(wo.due_at), "MMM d, yyyy h:mm a") : "—"}/>
              <Row label="Estimated hours" value={wo.estimated_hours != null ? String(wo.estimated_hours) : "—"}/>
              <Row label="Actual hours" value={wo.actual_hours != null ? String(wo.actual_hours) : "—"}/>
              <Row label="Follow-up" value={(wo.follow_up ?? "no").replace(/_/g," ")}/>
              {wo.follow_up_date && <Row label="Follow-up date" value={format(new Date(wo.follow_up_date), "MMM d, yyyy")}/>}
              {wo.follow_up_notes && <div><div className="text-muted-foreground text-xs">Follow-up notes</div><p className="whitespace-pre-wrap text-sm">{wo.follow_up_notes}</p></div>}
              {wo.parts_needed && <div><div className="text-muted-foreground text-xs">Parts needed</div><p className="whitespace-pre-wrap text-sm">{wo.parts_needed}</p></div>}
              <Row label="Created" value={format(new Date(wo.created_at), "MMM d, yyyy h:mm a")}/>
              {wo.closed_at && <Row label="Closed" value={format(new Date(wo.closed_at), "MMM d, yyyy")}/>}
              {isAdmin && <>
                <div className="border-t pt-2 mt-2 text-xs uppercase text-muted-foreground">Admin</div>
                <Row label="Created by" value={(wo as any).creator?.name ?? "—"}/>
                <Row label="Payer responsibility" value={wo.payer_responsibility ?? "—"}/>
                <Row label="Admin est. hours" value={wo.admin_estimated_hours != null ? String(wo.admin_estimated_hours) : "—"}/>
                <Row label="Cost" value={wo.cost != null ? `$${Number(wo.cost).toFixed(2)}` : "—"}/>
                {callCounts && <>
                  <Row label="Calls for this unit" value={String(callCounts.unit)}/>
                  <Row label="Calls for this tenant" value={String(callCounts.tenant)}/>
                </>}
              </>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              {(history ?? []).map((h: any) => (
                <div key={h.id} className="flex justify-between gap-2">
                  <div>
                    <b>{h.profile?.name ?? "System"}</b>: {h.old_status ?? "—"} → {h.new_status}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">{format(new Date(h.created_at), "MMM d")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className="text-right">{value}</span></div>;
}
