import { getSessionUser } from "@/lib/auth/session";
import { AppHeaderUserMenu } from "@/components/app-shell/app-header-user-menu";

export async function AppHeaderUser() {
  const user = await getSessionUser();
  if (!user?.email) {
    return null;
  }

  return <AppHeaderUserMenu email={user.email} />;
}
