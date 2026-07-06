import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
  Building2, LayoutDashboard, ClipboardList, CalendarDays, Building,
  Home, Users, Wrench, BarChart3, Upload, Settings, LogOut, Menu, X, Activity,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/work-orders", label: "Work Orders", icon: ClipboardList },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/properties", label: "Properties", icon: Building },
  { to: "/units", label: "Units", icon: Home },
  { to: "/tenants", label: "Tenants", icon: Users },
  { to: "/technician", label: "Tech View", icon: Wrench },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/import-export", label: "Import/Export", icon: Upload },
  { to: "/activity", label: "Activity Log", icon: Activity, adminOnly: true },
  { to: "/users", label: "Users & Invites", icon: Settings, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut, hasRole, loading } = useAuth();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    nav({ to: "/auth", replace: true });
  }

  const items = NAV.filter((n) => !n.adminOnly || hasRole(["admin", "manager"]));

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground transform transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-16 flex items-center gap-2 px-4 border-b border-sidebar-border">
          <div className="size-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
            <Building2 className="size-4" />
          </div>
          <span className="font-display text-lg">Maintenance</span>
        </div>
        <nav className="p-3 space-y-1">
          {items.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 inset-x-0 p-3 border-t border-sidebar-border">
          <div className="text-xs text-sidebar-foreground/70 px-2 mb-2 truncate">{profile?.email}</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen((v) => !v)}>
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
            <div className="text-sm text-muted-foreground hidden sm:block">
              {profile?.name ? `Hello, ${profile.name.split(" ")[0]}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 max-w-full overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
