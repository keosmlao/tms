import { getSession, type Session } from "@/lib/auth";
import { isSalesLogin } from "@/lib/sales-role";

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

// Dispatch management — creating / approving / editing / deleting / closing
// delivery trips — is for operations & logistics staff. Sales-department logins
// are confined to their own tracking view, so they must be rejected here too:
// the sidebar hides these screens from sales, but the server actions are
// directly callable, so the authorization has to live on the server, not just
// in the UI.
export async function requireDispatchAccess(): Promise<Session> {
  const session = await requireSession();
  if (isSalesLogin(session)) {
    throw new Error("ບໍ່ມີສິດໃນການຈັດການຖ້ຽວ");
  }
  return session;
}
