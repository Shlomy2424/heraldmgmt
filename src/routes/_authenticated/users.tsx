import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const ROLES = ["admin", "manager", "technician", "viewer"] as const;

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users & Roles" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasRole(["admin"]);

  const { data } = useQuery({
    queryKey: ["users-roles"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("id,name,email,active").order("name");
      const { data: roles } = await supabase.from("user_roles").select("user_id,role");
      const byUser = new Map<string, string[]>();
      (roles ?? []).forEach((r) => { if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id)!.push(r.role); });
      return (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  async function setRole(userId: string, role: string) {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
    if (error) toast.error(error.message); else { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["users-roles"] }); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl">Users & Roles</h1>
        <p className="text-sm text-muted-foreground">Manage who can access what</p>
      </div>
      {!canEdit && <div className="text-sm text-muted-foreground">Read-only. Admin role required to make changes.</div>}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left px-4 py-2">Name</th><th className="text-left px-4 py-2">Email</th><th className="text-left px-4 py-2">Role</th></tr>
            </thead>
            <tbody className="divide-y">
              {(data ?? []).map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-medium">{u.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2">
                    <Select value={u.roles[0] ?? "viewer"} onValueChange={(v) => setRole(u.id, v)} disabled={!canEdit}>
                      <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
                      <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
