import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { PriorityBadge } from "./dashboard";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({ meta: [{ title: "Schedule" }] }),
  component: SchedulePage,
});

function SchedulePage() {
  const nav = useNavigate();
  const [start, setStart] = useState(() => startOfDay(new Date()));
  const days = Array.from({ length: 30 }, (_, i) => addDays(start, i));

  const { data } = useQuery({
    queryKey: ["schedule", start.toISOString()],
    queryFn: async () => {
      const from = format(start, "yyyy-MM-dd");
      const to = format(addDays(start, 30), "yyyy-MM-dd");
      const { data } = await supabase
        .from("schedule_visits")
        .select("id,scheduled_date,visit_status,work_order:work_orders(id,job_number,title,priority,status,property:properties(property_name),unit:units(unit_number)),assignee:profiles!schedule_visits_assigned_to_fkey(name)")
        .gte("scheduled_date", from).lt("scheduled_date", to)
        .order("scheduled_date");
      return data ?? [];
    },
  });

  const byDay = new Map<string, any[]>();
  (data ?? []).forEach((v: any) => {
    const k = v.scheduled_date;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(v);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl">30-Day Schedule</h1>
          <p className="text-sm text-muted-foreground">Daily maintenance visits</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setStart(addDays(start, -7))}><ChevronLeft className="size-4"/></Button>
          <Button variant="outline" size="sm" onClick={() => setStart(startOfDay(new Date()))}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => setStart(addDays(start, 7))}><ChevronRight className="size-4"/></Button>
        </div>
      </div>
      <div className="space-y-2">
        {days.map((d) => {
          const k = format(d, "yyyy-MM-dd");
          const visits = byDay.get(k) ?? [];
          const isToday = k === format(new Date(), "yyyy-MM-dd");
          return (
            <Card key={k} className={isToday ? "border-primary" : ""}>
              <CardContent className="p-3 flex gap-3">
                <div className={`w-20 shrink-0 text-center ${isToday ? "text-primary" : ""}`}>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{format(d, "EEE")}</div>
                  <div className="text-2xl font-display">{format(d, "d")}</div>
                  <div className="text-xs text-muted-foreground">{format(d, "MMM")}</div>
                </div>
                <div className="flex-1 min-w-0">
                  {visits.length === 0 ? (
                    <div className="h-full flex items-center text-sm text-muted-foreground">No visits scheduled</div>
                  ) : (
                    <div className="space-y-1">
                      {visits.map((v: any) => (
                        <div key={v.id} onClick={() => v.work_order && nav({ to: "/work-orders/$id", params: { id: v.work_order.id }})}
                          className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm">
                          <PriorityBadge p={v.work_order?.priority ?? "normal"}/>
                          <span className="font-medium truncate flex-1">{v.work_order?.title}</span>
                          <span className="text-xs text-muted-foreground truncate hidden sm:block">
                            {v.work_order?.property?.property_name} {v.work_order?.unit?.unit_number && `• ${v.work_order.unit.unit_number}`}
                          </span>
                          <span className="text-xs text-muted-foreground hidden md:block">{v.assignee?.name ?? "Unassigned"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
