"use server";

import { requireMe } from "@/lib/auth";
import { confirmIdentity } from "@/lib/identity";

export async function confirmVerification(id: string) {
  const me = await requireMe();
  return confirmIdentity(me.id, id);
}
