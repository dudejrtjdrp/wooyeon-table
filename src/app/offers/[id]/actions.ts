"use server";

import { redirect } from "next/navigation";
import { respondOffer } from "@/lib/attendance";
import { requireProfile } from "@/lib/auth";

export async function answerOffer(form: FormData) {
  const me = await requireProfile();
  const id = String(form.get("offer_id"));
  const accept = String(form.get("answer")) === "accept";
  const r = await respondOffer(id, me.id, accept);
  if (r.ok && r.tableId) redirect(`/tables/${r.tableId}?m=${encodeURIComponent(r.message)}`);
  redirect(`/offers/${id}?${r.ok ? "m" : "e"}=${encodeURIComponent(r.message)}`);
}
