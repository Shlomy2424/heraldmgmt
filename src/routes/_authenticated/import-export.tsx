import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Download, Upload, ChevronRight, ChevronLeft, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type ImportKind = "properties" | "units" | "tenants";

const SCHEMAS: Record<ImportKind, { field: string; label: string; required?: boolean; help?: string }[]> = {
  properties: [
    { field: "property_name", label: "Property Name", required: true },
    { field: "address", label: "Address" },
    { field: "city", label: "City" },
    { field: "state", label: "State" },
    { field: "zip", label: "Zip" },
    { field: "property_type", label: "Property Type" },
    { field: "notes", label: "Notes" },
  ],
  units: [
    { field: "property_name", label: "Property Name (existing)", required: true, help: "Must match a property already in the system" },
    { field: "unit_number", label: "Unit Number", required: true },
    { field: "unit_type", label: "Unit Type" },
    { field: "floor", label: "Floor" },
    { field: "notes", label: "Notes" },
  ],
  tenants: [
    { field: "tenant_name", label: "Tenant Name", required: true },
    { field: "property_name", label: "Property Name (existing)" },
    { field: "unit_number", label: "Unit Number (existing)" },
    { field: "email", label: "Email" },
    { field: "phone", label: "Phone" },
    { field: "move_in_date", label: "Move-in date (YYYY-MM-DD)" },
  ],
};

const TEMPLATES: Record<ImportKind, string[][]> = {
  properties: [
    ["property_name","address","city","state","zip","property_type","notes"],
    ["906 Evans St","906 Evans St","Anytown","NC","28001","apartment","Sample row"],
  ],
  units: [
    ["property_name","unit_number","unit_type","floor","notes"],
    ["906 Evans St","1A","apartment","1","Sample row"],
  ],
  tenants: [
    ["tenant_name","property_name","unit_number","email","phone","move_in_date"],
    ["Jane Doe","906 Evans St","1A","jane@example.com","555-0101","2024-01-15"],
  ],
};

export const Route = createFileRoute("/_authenticated/import-export")({
  head: () => ({ meta: [{ title: "Import / Export" }] }),
  component: ImportExportPage,
});

function ImportExportPage() {
  const [kind, setKind] = useState<ImportKind>("properties");
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-3xl">Import / Export</h1>
        <p className="text-sm text-muted-foreground">Move data in and out of the system</p>
      </div>
      <Tabs value={kind} onValueChange={(v) => setKind(v as ImportKind)}>
        <TabsList>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
        </TabsList>
        <TabsContent value={kind}>
          <ImportWizard key={kind} kind={kind}/>
        </TabsContent>
      </Tabs>
      <Card>
        <CardHeader><CardTitle>Export Work Orders</CardTitle></CardHeader>
        <CardContent><Button onClick={exportWO}><Download className="size-4 mr-1"/>Download work orders (CSV)</Button></CardContent>
      </Card>
    </div>
  );
}

async function exportWO() {
  const { data } = await supabase.from("work_orders")
    .select("job_number,title,status,priority,category,created_at,closed_at,property:properties(property_name),unit:units(unit_number),tenant:tenants(tenant_name),assignee:profiles!work_orders_assigned_to_fkey(name)")
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const cols = ["job_number","title","status","priority","category","property","unit","tenant","assignee","created_at","closed_at"];
  const csv = [cols.join(",")];
  rows.forEach((w: any) => {
    csv.push([w.job_number,w.title,w.status,w.priority,w.category,w.property?.property_name,w.unit?.unit_number,w.tenant?.tenant_name,w.assignee?.name,w.created_at,w.closed_at].map((v) => JSON.stringify(String(v ?? ""))).join(","));
  });
  const blob = new Blob([csv.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `work-orders-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

type Step = "upload" | "map" | "preview" | "done";
type Row = Record<string, any>;

function ImportWizard({ kind }: { kind: ImportKind }) {
  const { user } = useAuth();
  const schema = SCHEMAS[kind];
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dupHandling, setDupHandling] = useState<"skip" | "update">("skip");
  const [result, setResult] = useState<{ ok: number; failed: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet(TEMPLATES[kind]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, kind);
    XLSX.writeFile(wb, `${kind}-template.xlsx`);
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
    if (rows.length === 0) { toast.error("Empty file"); return; }
    const headers = Object.keys(rows[0]);
    setRawHeaders(headers);
    setRawRows(rows);
    // Auto-map by normalized name
    const m: Record<string, string> = {};
    schema.forEach((s) => {
      const hit = headers.find((h) => h.toLowerCase().replace(/[^a-z0-9]/g, "") === s.field.toLowerCase().replace(/[^a-z0-9]/g, ""));
      if (hit) m[s.field] = hit;
    });
    setMapping(m);
    setStep("map");
  }

  const mapped = useMemo(() => rawRows.map((r) => {
    const o: Row = {};
    schema.forEach((s) => { o[s.field] = mapping[s.field] ? r[mapping[s.field]] : null; });
    return o;
  }), [rawRows, mapping, schema]);

  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    schema.filter((s) => s.required).forEach((s) => {
      const missing = mapped.filter((r) => !r[s.field]).length;
      if (missing > 0) errs.push(`${missing} rows missing required "${s.label}"`);
    });
    return errs;
  }, [mapped, schema]);

  async function commit() {
    setBusy(true); setResult(null);
    const errors: string[] = [];
    let ok = 0, failed = 0;
    // resolve property/unit lookups for units/tenants imports
    const propMap = new Map<string, string>();
    const unitMap = new Map<string, string>(); // key: `${property_id}|${unit_number}`
    if (kind === "units" || kind === "tenants") {
      const { data: props } = await supabase.from("properties").select("id,property_name");
      (props ?? []).forEach((p: any) => propMap.set(p.property_name.toLowerCase(), p.id));
    }
    if (kind === "tenants") {
      const { data: units } = await supabase.from("units").select("id,unit_number,property_id");
      (units ?? []).forEach((u: any) => unitMap.set(`${u.property_id}|${u.unit_number.toLowerCase()}`, u.id));
    }

    for (let i = 0; i < mapped.length; i++) {
      const row = mapped[i];
      try {
        let payload: any = { ...row };
        if (kind === "properties") {
          // duplicate check on property_name
          if (dupHandling === "skip") {
            const { data: exists } = await supabase.from("properties").select("id").ilike("property_name", row.property_name).maybeSingle();
            if (exists) { errors.push(`Row ${i + 2}: duplicate property "${row.property_name}" — skipped`); continue; }
          }
        }
        if (kind === "units") {
          const pid = propMap.get(String(row.property_name ?? "").toLowerCase());
          if (!pid) { errors.push(`Row ${i + 2}: unknown property "${row.property_name}"`); failed++; continue; }
          payload = { property_id: pid, unit_number: row.unit_number, unit_type: row.unit_type || "apartment", floor: row.floor || null, notes: row.notes || null };
          if (dupHandling === "skip") {
            const { data: exists } = await supabase.from("units").select("id").eq("property_id", pid).eq("unit_number", row.unit_number).maybeSingle();
            if (exists) { errors.push(`Row ${i + 2}: duplicate unit "${row.unit_number}" — skipped`); continue; }
          }
        }
        if (kind === "tenants") {
          const pid = row.property_name ? propMap.get(String(row.property_name).toLowerCase()) : null;
          const uid = pid && row.unit_number ? unitMap.get(`${pid}|${String(row.unit_number).toLowerCase()}`) : null;
          payload = {
            tenant_name: row.tenant_name,
            property_id: pid || null,
            unit_id: uid || null,
            email: row.email || null,
            phone: row.phone || null,
            move_in_date: row.move_in_date || null,
          };
        }
        const { error } = await supabase.from(kind).insert(payload);
        if (error) { errors.push(`Row ${i + 2}: ${error.message}`); failed++; }
        else ok++;
      } catch (e: any) {
        errors.push(`Row ${i + 2}: ${e.message}`); failed++;
      }
    }
    await supabase.from("import_batches").insert({
      import_type: kind, file_name: fileName, uploaded_by: user?.id,
      total_rows: mapped.length, successful_rows: ok, failed_rows: failed,
      notes: errors.slice(0, 20).join("\n"),
    });
    setResult({ ok, failed, errors });
    setStep("done");
    setBusy(false);
    if (failed === 0) toast.success(`Imported ${ok} rows`);
    else toast.warning(`Imported ${ok}, ${failed} failed`);
  }

  function reset() {
    setStep("upload"); setFileName(""); setRawHeaders([]); setRawRows([]); setMapping({}); setResult(null);
  }

  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {step === "upload" && <>1. Upload file</>}
          {step === "map" && <>2. Map columns</>}
          {step === "preview" && <>3. Preview &amp; commit</>}
          {step === "done" && <>Done</>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "upload" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={downloadTemplate}><Download className="size-4 mr-1"/>Download template (XLSX)</Button>
              <span className="text-xs text-muted-foreground">Fields: {schema.map((s) => s.label + (s.required ? " *" : "")).join(", ")}</span>
            </div>
            <div className="border-2 border-dashed rounded p-8 text-center">
              <Upload className="size-8 mx-auto text-muted-foreground mb-2"/>
              <p className="text-sm text-muted-foreground mb-3">Upload a CSV or XLSX file</p>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}/>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">{fileName} · {rawRows.length} rows · Map each system field to a column in the file.</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {schema.map((s) => (
                <div key={s.field} className="space-y-1">
                  <Label>{s.label}{s.required && <span className="text-destructive"> *</span>}</Label>
                  <Select value={mapping[s.field] ?? "__none__"} onValueChange={(v) => setMapping({ ...mapping, [s.field]: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="— skip —"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— skip —</SelectItem>
                      {rawHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {s.help && <p className="text-[11px] text-muted-foreground">{s.help}</p>}
                </div>
              ))}
            </div>
            <div className="space-y-1 max-w-xs">
              <Label>Duplicate handling</Label>
              <Select value={dupHandling} onValueChange={(v: any) => setDupHandling(v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip duplicates</SelectItem>
                  <SelectItem value="update">Insert anyway</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={reset}><ChevronLeft className="size-4 mr-1"/>Back</Button>
              <Button onClick={() => setStep("preview")}>Preview<ChevronRight className="size-4 ml-1"/></Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            {validationErrors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
                {validationErrors.map((e, i) => <div key={i}>⚠ {e}</div>)}
              </div>
            )}
            <div className="overflow-x-auto border rounded max-h-96">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0"><tr>{schema.map((s) => <th key={s.field} className="text-left px-2 py-1">{s.label}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {mapped.slice(0, 50).map((r, i) => (
                    <tr key={i}>{schema.map((s) => (
                      <td key={s.field} className={`px-2 py-1 ${s.required && !r[s.field] ? "bg-destructive/10" : ""}`}>{String(r[s.field] ?? "")}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
              {mapped.length > 50 && <div className="px-2 py-1 text-xs text-muted-foreground">…and {mapped.length - 50} more rows</div>}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep("map")}><ChevronLeft className="size-4 mr-1"/>Back</Button>
              <Button onClick={commit} disabled={busy || validationErrors.length > 0}>
                {busy ? "Importing…" : `Import ${mapped.length} rows`}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 border rounded bg-success/10 text-success flex items-center gap-2"><Check className="size-5"/><b>{result.ok}</b> imported</div>
              <div className={`p-4 border rounded flex items-center gap-2 ${result.failed ? "bg-destructive/10 text-destructive" : "bg-muted"}`}><X className="size-5"/><b>{result.failed}</b> failed / skipped</div>
            </div>
            {result.errors.length > 0 && (
              <div className="border rounded max-h-64 overflow-auto p-2 text-xs font-mono space-y-1">
                {result.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <Button onClick={reset}>Import another file</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
