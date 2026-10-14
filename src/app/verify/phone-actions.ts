"use server";

import { requireMe } from "@/lib/auth";
import { checkCode, issueCode } from "@/lib/phone-verify";

export async function requestCode(phone: string) {
  const me = await requireMe();
  return issueCode(me.id, phone);
}

export async function submitCode(phone: string, code: string) {
  const me = await requireMe();
  return checkCode(me.id, phone, code);
}
