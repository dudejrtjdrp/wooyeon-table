// PASS 본인인증 (PortOne V2). 브라우저에서 인증을 띄우고, 결과는 반드시 서버에서 PortOne API로 다시 확인한다.
import { createHash } from "crypto";
import { db } from "./supabase";

export const idvEnabled = () =>
  Boolean(process.env.NEXT_PUBLIC_PORTONE_STORE_ID && process.env.NEXT_PUBLIC_PORTONE_IDV_CHANNEL_KEY && process.env.PORTONE_API_SECRET);

type Verified = { name: string; phone: string | null; birthDate: string; gender: "M" | "F" | null; ci: string | null };

async function fetchVerified(id: string): Promise<Verified> {
  const r = await fetch(`https://api.portone.io/identity-verifications/${encodeURIComponent(id)}`, {
    headers: { Authorization: `PortOne ${process.env.PORTONE_API_SECRET}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`본인인증 조회 실패 ${r.status}`);
  const d = await r.json();
  if (d.status !== "VERIFIED") throw new Error("본인인증이 끝나지 않았어요");
  const c = d.verifiedCustomer ?? {};
  return {
    name: c.name,
    phone: c.phoneNumber ? String(c.phoneNumber).replace(/\D/g, "") : null,
    birthDate: c.birthDate,
    gender: c.gender === "MALE" ? "M" : c.gender === "FEMALE" ? "F" : null,
    ci: c.ci ?? null,
  };
}

/** 인증 결과를 회원 정보에 반영한다. 실패하면 사람이 읽을 수 있는 이유를 돌려준다 */
export async function confirmIdentity(userId: string, verificationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // 다른 사람이 만든 인증 ID를 가져다 쓰지 못하게 내 ID로 시작하는지 확인한다
  if (!verificationId.startsWith(`idv-${userId.slice(0, 8)}-`)) return { ok: false, error: "인증 정보가 맞지 않아요. 다시 시도해 주세요" };
  let v: Verified;
  try {
    v = await fetchVerified(verificationId);
  } catch (e) {
    console.error("[idv]", e);
    return { ok: false, error: "본인인증을 확인하지 못했어요. 다시 시도해 주세요" };
  }
  const age = new Date().getFullYear() - Number(v.birthDate.slice(0, 4));
  if (age < 19) return { ok: false, error: "만 19세 이상만 이용할 수 있어요" };

  const ciHash = v.ci ? createHash("sha256").update(`wt-ci:${v.ci}`).digest("hex") : null;
  if (ciHash) {
    const { data: dup } = await db().from("users").select("id").eq("ci_hash", ciHash).neq("id", userId).maybeSingle();
    if (dup) return { ok: false, error: "이미 다른 계정으로 가입한 분이에요. 처음 가입한 방법으로 로그인해 주세요" };
  }
  const { error } = await db()
    .from("users")
    .update({
      name: v.name,
      phone: v.phone,
      birth_date: v.birthDate,
      verified_gender: v.gender,
      ci_hash: ciHash,
      identity_verified_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return { ok: false, error: "인증 결과를 저장하지 못했어요. 다시 시도해 주세요" };
  return { ok: true };
}
