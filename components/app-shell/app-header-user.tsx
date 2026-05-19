import { getSessionUser, getSupabaseServer } from "@/lib/auth/session";
import { AppHeaderUserMenu } from "@/components/app-shell/app-header-user-menu";

export async function AppHeaderUser() {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }

  const supabase = await getSupabaseServer();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.full_name?.trim() || user.email;
  if (!displayName) {
    return null;
  }

  return (
    <AppHeaderUserMenu
      displayName={displayName}
      email={user.email ?? ""}
    />
  );
}
