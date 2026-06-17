import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { PriorityBadge, StatusBadge } from "./dashboard";

export const Route = createFileRoute("/_authenticated/technician")({
  head: () => ({ meta: [{ title: "Technician View" }] }),
  component: TechView,
});

function TechView() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-work", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("work_orders")
        .select("id,job_number,title,priority,status,property:properties(property_name,address),unit:units(unit_number),tenant:tenants(tenant_name,phone)")
        .eq("assigned_to", user!.id)
        .not("status", "in", "(closed,cancelled)")
        .order("priority", { ascending: true });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl">My Jobs</h1>
        <p className="text-sm text-muted-foreground">Tap a job to view details, add notes & photos</p>
      </div>
      {isLoading && <div className="text-muted-foreground">Loading…</div>}
      {!isLoading && data?.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No jobs assigned to you right now.</CardContent></Card>
      )}
      <div className="space-y-2">
        {(data ?? []).map((w: any) => (
          <Link key={w.id} to="/work-orders/$id" params={{ id: w.id }}>
            <Card className="hover:border-primary transition-colors">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <PriorityBadge p={w.priority}/>
                  <StatusBadge s={w.status}/>
                  <span className="font-mono text-xs text-muted-foreground ml-auto">{w.job_number}</span>
                </div>
                <div className="font-medium">{w.title}</div>
                <div className="text-sm text-muted-foreground">
                  {w.property?.property_name} {w.unit?.unit_number && `• Unit ${w.unit.unit_number}`}
                </div>
                {w.tenant && <div className="text-xs text-muted-foreground">Tenant: {w.tenant.tenant_name} {w.tenant.phone && `• ${w.tenant.phone}`}</div>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
