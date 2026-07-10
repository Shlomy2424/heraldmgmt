import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
type ViewBy = "scheduled" | "created" | "due" | "closed";

const OPEN = ["new","scheduled","not_started","in_progress","waiting_parts","waiting_tenant","waiting_approval","could_not_access","done","manager_review","reopened"];

function SchedulePage() {
  const nav = useNavigate();
  const [view, setView] = useState<View>("week");
  const [viewBy, setViewBy] = useState<ViewBy>("scheduled");
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

  const { data: items } = useQuery({
    queryKey: ["schedule", viewBy, range.start.toISOString(), range.end.toISOString(), propertyFilter, techFilter, statusFilter, priorityFilter],
    queryFn: async () => {
      if (viewBy === "scheduled") {
        let q = supabase.from("schedule_visits")
          .select("id,scheduled_date,start_time,visit_status,assigned_to,work_order:work_orders(id,job_number,title,priority,status,property_id,property:properties(property_name),unit:units(unit_number),tenant:tenants(tenant_name)),assignee:profiles!schedule_visits_assigned_to_fkey(name)")
          .gte("scheduled_date", format(range.start, "yyyy-MM-dd"))
          .lt("scheduled_date", format(range.end, "yyyy-MM-dd"))
          .order("scheduled_date").order("start_time");
        if (techFilter !== "all") q = q.eq("assigned_to", techFilter);
        const { data } = await q;
        let rows = (data ?? []).map((v: any) => ({
          id: v.id,
          date: v.scheduled_date,
          start_time: v.start_time,
          wo: v.work_order,
          assignee: v.assignee?.name,
        }));
        if (propertyFilter !== "all") rows = rows.filter((r: any) => r.wo?.property_id === propertyFilter);
        if (statusFilter === "open") rows = rows.filter((r: any) => !["closed","cancelled"].includes(r.wo?.status));
        else if (statusFilter === "closed") rows = rows.filter((r: any) => ["closed","cancelled"].includes(r.wo?.status));
        if (priorityFilter !== "all") rows = rows.filter((r: any) => r.wo?.priority === priorityFilter);
        return rows;
      }
      // work_orders based views (created/due/closed)
      const col = viewBy === "created" ? "created_at" : viewBy === "due" ? "due_at" : "closed_at";
      let q = supabase.from("work_orders")
        .select("id,job_number,title,priority,status,property_id,assigned_to,created_at,due_at,closed_at,property:properties(property_name),unit:units(unit_number),tenant:tenants(tenant_name),assignee:profiles!work_orders_assigned_to_fkey(name)")
        .gte(col, range.start.toISOString())
        .lt(col, range.end.toISOString())
        .order(col);
      if (techFilter !== "all") q = q.eq("assigned_to", techFilter);
      if (propertyFilter !== "all") q = q.eq("property_id", propertyFilter);
      if (priorityFilter !== "all") q = q.eq("priority", priorityFilter as any);
      if (statusFilter === "open") q = q.in("status", OPEN as any);
      else if (statusFilter === "closed") q = q.in("status", ["closed", "cancelled"] as any);
      const { data } = await q;
      return (data ?? []).map((w: any) => {
        const d = viewBy === "created" ? w.created_at : viewBy === "due" ? w.due_at : w.closed_at;
        return { id: w.id, date: d ? format(new Date(d), "yyyy-MM-dd") : null, start_time: null, wo: w, assignee: w.assignee?.name };
      }).filter((r: any) => r.date);
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    (items ?? []).forEach((v: any) => {
      if (!v.date) return;
      if (!m.has(v.date)) m.set(v.date, []);
      m.get(v.date)!.push(v);
    });
    return m;
  }, [items]);

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
          <p className="text-sm text-muted-foreground">{heading} • view by {viewBy}</p>
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
        <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Select value={viewBy} onValueChange={(v) => setViewBy(v as ViewBy)}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">View by scheduled date</SelectItem>
              <SelectItem value="created">View by created date</SelectItem>
              <SelectItem value="due">View by due date</SelectItem>
              <SelectItem value="closed">View by closed date</SelectItem>
            </SelectContent>
          </Select>
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

      {view === "day" && <DayView date={anchor} items={byDay.get(format(anchor, "yyyy-MM-dd")) ?? []} onOpen={(id) => nav({ to: "/work-orders/$id", params: { id } })}/>}
      {view === "week" && <WeekView start={range.start} byDay={byDay} onOpen={(id) => nav({ to: "/work-orders/$id", params: { id } })}/>}
      {view === "month" && <MonthView anchor={anchor} start={range.start} end={range.end} byDay={byDay} onOpen={(id) => nav({ to: "/work-orders/$id", params: { id } })}/>}
    </div>
  );
}

function VisitRow({ v, onOpen }: { v: any; onOpen: (id: string) => void }) {
  const wo = v.wo;
  return (
    <div onClick={() => wo && onOpen(wo.id)} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm border">
      {v.start_time && <span className="text-xs text-muted-foreground w-14 shrink-0">{v.start_time}</span>}
      <PriorityBadge p={wo?.priority ?? "normal"}/>
      <span className="font-medium truncate flex-1">{wo?.title ?? "—"}</span>
      <span className="text-xs text-muted-foreground truncate hidden md:inline">{wo?.property?.property_name} {wo?.unit?.unit_number && `• ${wo.unit.unit_number}`}</span>
      <span className="text-xs text-muted-foreground truncate hidden lg:inline">{v.assignee ?? "Unassigned"}</span>
      {wo?.status && <StatusBadge s={wo.status}/>}
    </div>
  );
}

function DayView({ date, items, onOpen }: { date: Date; items: any[]; onOpen: (id: string) => void }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-sm text-muted-foreground mb-3">{format(date, "EEEE, MMMM d")}</div>
      {items.length === 0 ? <div className="text-sm text-muted-foreground text-center py-8">No jobs.</div>
      : <div className="space-y-1">{items.map((v) => <VisitRow key={v.id} v={v} onOpen={onOpen}/>)}</div>}
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
                  <div key={v.id} onClick={() => v.wo && onOpen(v.wo.id)}
                    className="truncate cursor-pointer hover:underline">
                    • {v.wo?.title ?? "—"}
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
