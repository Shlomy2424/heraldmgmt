import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data } = useQuery({
    queryKey: ["reports-summary"],
    queryFn: async () => {
      const { data: byStatus } = await supabase.from("work_orders").select("status");
      const { data: byPriority } = await supabase.from("work_orders").select("priority");
      const { data: byProperty } = await supabase.from("work_orders").select("property:properties(property_name)");
      const count = (arr: any[], key: string) => {
        const m: Record<string, number> = {};
        arr.forEach((r) => { const v = key.includes(".") ? r[key.split(".")[0]]?.[key.split(".")[1]] : r[key]; if (v) m[v] = (m[v] ?? 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
      };
      return {
        byStatus: count(byStatus ?? [], "status"),
        byPriority: count(byPriority ?? [], "priority"),
        byProperty: count(byProperty ?? [], "property.property_name"),
      };
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl">Reports</h1>
        <p className="text-sm text-muted-foreground">Aggregated maintenance metrics</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <ReportCard title="By Status" rows={data?.byStatus ?? []}/>
        <ReportCard title="By Priority" rows={data?.byPriority ?? []}/>
        <ReportCard title="By Property" rows={data?.byProperty ?? []}/>
      </div>
    </div>
  );
}

function ReportCard({ title, rows }: { title: string; rows: [string, number][] }) {
  const total = rows.reduce((a, [, n]) => a + n, 0) || 1;
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No data</div>}
        {rows.map(([k, n]) => (
          <div key={k}>
            <div className="flex justify-between text-sm"><span>{k.replace(/_/g, " ")}</span><span className="font-medium">{n}</span></div>
            <div className="h-1.5 bg-muted rounded overflow-hidden"><div className="h-full bg-primary" style={{ width: `${(n / total) * 100}%` }}/></div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
