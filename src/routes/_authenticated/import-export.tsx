import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import-export")({
  head: () => ({ meta: [{ title: "Import / Export" }] }),
  component: ImportExport,
});

function ImportExport() {
  const [busy, setBusy] = useState(false);

  async function exportWO() {
    setBusy(true);
    const { data } = await supabase.from("work_orders").select("job_number,title,status,priority,category,created_at,closed_at");
    const rows = data ?? [];
    const headers = Object.keys(rows[0] ?? { job_number: "", title: "" });
    const csv = [headers.join(","), ...rows.map((r: any) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `work-orders-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  async function importCSV(file: File, table: "properties" | "tenants" | "units") {
    setBusy(true);
    try {
      const text = await file.text();
      const [header, ...lines] = text.split(/\r?\n/).filter(Boolean);
      const cols = header.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const rows = lines.map((l) => {
        const vals = l.match(/("([^"]*)"|[^,]+)(?=,|$)/g)?.map((v) => v.replace(/^"|"$/g, "")) ?? [];
        const o: any = {}; cols.forEach((c, i) => o[c] = vals[i] ?? null); return o;
      });
      const { error } = await supabase.from(table).insert(rows);
      if (error) throw error;
      toast.success(`Imported ${rows.length} rows`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-3xl">Import / Export</h1>
        <p className="text-sm text-muted-foreground">Move data in and out of the system</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Export Work Orders</CardTitle></CardHeader>
        <CardContent>
          <Button onClick={exportWO} disabled={busy}>Download CSV</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Import CSV</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">CSV columns must match table fields exactly. Header row required.</p>
          {(["properties", "units", "tenants"] as const).map((t) => (
            <div key={t} className="flex items-center justify-between border rounded p-3">
              <div className="capitalize font-medium">{t}</div>
              <input type="file" accept=".csv" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f, t); e.target.value = ""; }}/>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
