// 휴대폰 인증번호 발급과 확인.
// 규칙: 6자리, 3분 유효, 번호당 5회 틀리면 무효, 30초 안에 다시 보내기 불가, 한 번호로 1시간에 5번까지.
import { iyeyo } from "./korean";
import { createHash, randomInt } from "crypto";
import { sendSms, smsEnabled } from "./sms";
import { db } from "./supabase";

const TTL_MS = 3 * 60_000;
const RESEND_MS = 30_000;
const HOURLY_LIMIT = 5;
const MAX_ATTEMPTS = 5;

const hash = (id: string, code: string) => createHash("sha256").update(`wt-otp:${id}:${code}`).digest("hex");
export const normalizePhone = (p: string) => p.replace(/\D/g, "");
export const isPhone = (p: string) => /^01[016789]\d{7,8}$/.test(p);

export type SendResult =
  | { ok: true; expiresAt: string; resendAt: string; demoCode?: string }
  | { ok: false; error: string };

export async function issueCode(userId: string, rawPhone: string): Promise<SendResult> {
  const phone = normalizePhone(rawPhone);
  if (!isPhone(phone)) return { ok: false, error: "휴대폰 번호를 다시 확인해 주세요" };

  const { data: taken } = await db()
    .from("users")
    .select("id")
    .or(`and(phone.eq.${phone},phone_verified_at.not.is.null),login_id.eq.${phone}`)
    .neq("id", userId)
    .limit(1);
  if (taken?.length) return { ok: false, error: "이미 다른 계정에서 인증한 번호예요. 그 계정으로 로그인해 주세요" };

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: recent } = await db()
    .from("phone_verifications")
    .select("created_at")
    .eq("phone", phone)
    .gte("created_at", hourAgo)
    .order("created_at", { ascending: false });
  if ((recent?.length ?? 0) >= HOURLY_LIMIT) return { ok: false, error: "인증번호를 너무 많이 요청했어요. 1시간 뒤 다시 시도해 주세요" };
  if (recent?.[0] && Date.now() - new Date(recent[0].created_at).getTime() < RESEND_MS) {
    return { ok: false, error: "잠시 뒤 다시 보낼 수 있어요" };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const { data: row, error } = await db()
    .from("phone_verifications")
    .insert({ user_id: userId, phone, code_hash: "pending", expires_at: expiresAt })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: "인증번호를 만들지 못했어요. 다시 시도해 주세요" };
  await db().from("phone_verifications").update({ code_hash: hash(row.id, code) }).eq("id", row.id);

  const resendAt = new Date(Date.now() + RESEND_MS).toISOString();
  if (!smsEnabled()) return { ok: true, expiresAt, resendAt, demoCode: code };
  try {
    await sendSms(phone, `[우연한 식탁] 인증번호는 ${iyeyo(code)}. 이 번호를 입력해 주세요. 3분 안에 입력해야 해요.`);
  } catch (e) {
    console.error("[sms]", e);
    return { ok: false, error: "문자를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요" };
  }
  return { ok: true, expiresAt, resendAt };
}

export async function checkCode(userId: string, rawPhone: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const phone = normalizePhone(rawPhone);
  const { data: v } = await db()
    .from("phone_verifications")
    .select("id,expires_at,attempts,verified_at")
    .eq("user_id", userId)
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!v) return { ok: false, error: "인증번호를 먼저 받아 주세요" };
  if (v.verified_at) return { ok: true };
  if (new Date(v.expires_at) < new Date()) return { ok: false, error: "인증번호 시간이 지났어요. 다시 받아 주세요" };
  if (v.attempts >= MAX_ATTEMPTS) return { ok: false, error: "여러 번 틀려서 이 인증번호는 쓸 수 없어요. 다시 받아 주세요" };

  const { data: row } = await db().from("phone_verifications").select("code_hash").eq("id", v.id).single();
  if (row?.code_hash !== hash(v.id, code.trim())) {
    await db().from("phone_verifications").update({ attempts: v.attempts + 1 }).eq("id", v.id);
    const left = MAX_ATTEMPTS - v.attempts - 1;
    return { ok: false, error: left > 0 ? `인증번호가 맞지 않아요. ${left}번 더 입력할 수 있어요` : "여러 번 틀려서 이 인증번호는 쓸 수 없어요. 다시 받아 주세요" };
  }
  const now = new Date().toISOString();
  await db().from("phone_verifications").update({ verified_at: now }).eq("id", v.id);
  await db().from("users").update({ phone, phone_verified_at: now }).eq("id", userId);
  return { ok: true };
}
