import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];

type AuthCtx = {
  user: User | null;
  session: Session | null;
  roles: Role[];
  profile: { name: string | null; email: string | null } | null;
  loading: boolean;
  hasRole: (r: Role | Role[]) => boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [profile, setProfile] = useState<AuthCtx["profile"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) setTimeout(() => loadUserMeta(s.user), 0);
      else { setRoles([]); setProfile(null); }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadUserMeta(data.session.user);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadUserMeta(u: User) {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", u.id),
      supabase.from("profiles").select("name").eq("id", u.id).maybeSingle(),
    ]);
    setRoles((r ?? []).map((x) => x.role));
    setProfile({ name: p?.name ?? null, email: u.email ?? null });
  }

  const hasRole: AuthCtx["hasRole"] = (r) => {
    const list = Array.isArray(r) ? r : [r];
    return roles.some((x) => list.includes(x));
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        roles,
        profile,
        loading,
        hasRole,
        signOut: async () => { await supabase.auth.signOut(); },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
