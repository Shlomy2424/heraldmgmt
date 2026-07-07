import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
  addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek,
} from "date-fns";
import { PriorityBadge, StatusBadge } from "./dashboard";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({ meta: [{ title: "Schedule" }] }),
  component: SchedulePage,
});

type View = "day" | "week" | "month";

function SchedulePage() {
  const nav = useNavigate();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [jumpDate, setJumpDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [techFilter, setTechFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const range = useMemo(() => {
    if (view === "day") return { start: anchor, end: addDays(anchor, 1) };
    if (view === "week") return { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: addDays(endOfWeek(anchor, { weekStartsOn: 1 }), 1) };
    return { start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }), end: addDays(endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }), 1) };
  }, [view, anchor]);

  const { data: properties } = useQuery({
    queryKey: ["properties-list"],
    queryFn: async () => (await supabase.from("properties").select("id,property_name").order("property_name")).data ?? [],
  });
  const { data: techs } = useQuery({
    queryKey: ["techs-list"],
    queryFn: async () => {
      const { data: ur } = await supabase.from("user_roles").select("user_id").in("role", ["technician", "manager", "admin"]);
      const ids = [...new Set((ur ?? []).map((r) => r.user_id))];
      if (!ids.length) return [];
      return (await supabase.from("profiles").select("id,name").in("id", ids).order("name")).data ?? [];
    },
  });

  const { data: visits } = useQuery({
    queryKey: ["schedule", range.start.toISOString(), range.end.toISOString(), propertyFilter, techFilter, statusFilter, priorityFilter],
    queryFn: async () => {
      let q = supabase
        .from("schedule_visits")
        .select("id,scheduled_date,start_time,visit_status,assigned_to,work_order:work_orders(id,job_number,title,priority,status,property_id,property:properties(property_name),unit:units(unit_number),tenant:tenants(tenant_name)),assignee:profiles!schedule_visits_assigned_to_fkey(name)")
        .gte("scheduled_date", format(range.start, "yyyy-MM-dd"))
        .lt("scheduled_date", format(range.end, "yyyy-MM-dd"))
        .order("scheduled_date").order("start_time");
      if (techFilter !== "all") q = q.eq("assigned_to", techFilter);
      const { data } = await q;
      let rows = data ?? [];
      if (propertyFilter !== "all") rows = rows.filter((v: any) => v.work_order?.property_id === propertyFilter);
      if (statusFilter === "open") rows = rows.filter((v: any) => !["closed","cancelled"].includes(v.work_order?.status));
      else if (statusFilter === "closed") rows = rows.filter((v: any) => ["closed","cancelled"].includes(v.work_order?.status));
      else if (statusFilter === "completed") rows = rows.filter((v: any) => v.visit_status === "completed" || v.work_order?.status === "done");
      if (priorityFilter !== "all") rows = rows.filter((v: any) => v.work_order?.priority === priorityFilter);
      return rows;
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    (visits ?? []).forEach((v: any) => {
      const k = v.scheduled_date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(v);
    });
    return m;
  }, [visits]);

  function goPrev() {
    if (view === "day") setAnchor(addDays(anchor, -1));
    else if (view === "week") setAnchor(addWeeks(anchor, -1));
    else setAnchor(addMonths(anchor, -1));
  }
  function goNext() {
    if (view === "day") setAnchor(addDays(anchor, 1));
    else if (view === "week") setAnchor(addWeeks(anchor, 1));
    else setAnchor(addMonths(anchor, 1));
  }
  function jump() { if (jumpDate) setAnchor(startOfDay(new Date(jumpDate + "T00:00:00"))); }

  const heading = view === "day" ? format(anchor, "EEEE, MMMM d, yyyy")
                : view === "week" ? `Week of ${format(range.start, "MMM d")}`
                : format(anchor, "MMMM yyyy");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl">Schedule</h1>
          <p className="text-sm text-muted-foreground">{heading}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={jumpDate} onChange={(e) => setJumpDate(e.target.value)} className="w-40"/>
          <Button variant="outline" size="sm" onClick={jump}>Go</Button>
          <Button variant="outline" size="icon" onClick={goPrev}><ChevronLeft className="size-4"/></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
          <Button variant="outline" size="icon" onClick={goNext}><ChevronRight className="size-4"/></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger><SelectValue placeholder="Property"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {(properties ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={techFilter} onValueChange={setTechFilter}>
            <SelectTrigger><SelectValue placeholder="Technician"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All techs</SelectItem>
              {(techs ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open only</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="closed">Closed / cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger><SelectValue placeholder="Priority"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priority</SelectItem>
              <SelectItem value="emergency">Emergency</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList className="w-full">
              <TabsTrigger value="day" className="flex-1">Day</TabsTrigger>
              <TabsTrigger value="week" className="flex-1">Week</TabsTrigger>
              <TabsTrigger value="month" className="flex-1">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {view === "day" && <DayView date={anchor} visits={byDay.get(format(anchor, "yyyy-MM-dd")) ?? []} onOpen={(id) => nav({ to: "/work-orders/$id", params: { id } })}/>}
      {view === "week" && <WeekView start={range.start} byDay={byDay} onOpen={(id) => nav({ to: "/work-orders/$id", params: { id } })}/>}
      {view === "month" && <MonthView anchor={anchor} start={range.start} end={range.end} byDay={byDay} onOpen={(id) => nav({ to: "/work-orders/$id", params: { id } })}/>}
    </div>
  );
}

function VisitRow({ v, onOpen }: { v: any; onOpen: (id: string) => void }) {
  const wo = v.work_order;
  return (
    <div onClick={() => wo && onOpen(wo.id)} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm border">
      {v.start_time && <span className="text-xs text-muted-foreground w-14 shrink-0">{v.start_time}</span>}
      <PriorityBadge p={wo?.priority ?? "normal"}/>
      <span className="font-medium truncate flex-1">{wo?.title ?? "—"}</span>
      <span className="text-xs text-muted-foreground truncate hidden md:inline">{wo?.property?.property_name} {wo?.unit?.unit_number && `• ${wo.unit.unit_number}`}</span>
      <span className="text-xs text-muted-foreground truncate hidden lg:inline">{v.assignee?.name ?? "Unassigned"}</span>
      {wo?.status && <StatusBadge s={wo.status}/>}
    </div>
  );
}

function DayView({ date, visits, onOpen }: { date: Date; visits: any[]; onOpen: (id: string) => void }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-sm text-muted-foreground mb-3">{format(date, "EEEE, MMMM d")}</div>
      {visits.length === 0 ? <div className="text-sm text-muted-foreground text-center py-8">No visits scheduled.</div>
      : <div className="space-y-1">{visits.map((v) => <VisitRow key={v.id} v={v} onOpen={onOpen}/>)}</div>}
    </CardContent></Card>
  );
}

function WeekView({ start, byDay, onOpen }: { start: Date; byDay: Map<string, any[]>; onOpen: (id: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-7 gap-2">
      {days.map((d) => {
        const k = format(d, "yyyy-MM-dd");
        const items = byDay.get(k) ?? [];
        const today = isSameDay(d, new Date());
        return (
          <Card key={k} className={today ? "border-primary" : ""}>
            <CardContent className="p-2">
              <div className={`text-xs font-medium mb-2 ${today ? "text-primary" : "text-muted-foreground"}`}>
                {format(d, "EEE d")}
              </div>
              <div className="space-y-1">
                {items.length === 0 && <div className="text-xs text-muted-foreground py-2">—</div>}
                {items.map((v) => <VisitRow key={v.id} v={v} onOpen={onOpen}/>)}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MonthView({ anchor, start, end, byDay, onOpen }: { anchor: Date; start: Date; end: Date; byDay: Map<string, any[]>; onOpen: (id: string) => void }) {
  const days: Date[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) days.push(d);
  return (
    <Card><CardContent className="p-2">
      <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground mb-1">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => <div key={d} className="px-1 py-1 font-medium">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const k = format(d, "yyyy-MM-dd");
          const items = byDay.get(k) ?? [];
          const inMonth = isSameMonth(d, anchor);
          const today = isSameDay(d, new Date());
          return (
            <div key={k} className={`min-h-[90px] border rounded p-1 text-xs ${today ? "border-primary" : ""} ${inMonth ? "" : "opacity-40"}`}>
              <div className="font-medium mb-0.5">{format(d, "d")}</div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((v: any) => (
                  <div key={v.id} onClick={() => v.work_order && onOpen(v.work_order.id)}
                    className="truncate cursor-pointer hover:underline">
                    • {v.work_order?.title ?? "—"}
                  </div>
                ))}
                {items.length > 3 && <div className="text-muted-foreground">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </CardContent></Card>
  );
}
