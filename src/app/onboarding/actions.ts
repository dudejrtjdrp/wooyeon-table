"use server";

import { redirect } from "next/navigation";
import { requireMe, safeNext } from "@/lib/auth";
import { INTERESTS, MBTIS, PRICE_RANGES, TRAITS } from "@/lib/constants";
import { db } from "@/lib/supabase";

const pick = (form: FormData, key: string, allowed: readonly string[]) =>
  form.getAll(key).map(String).filter((v) => allowed.includes(v));

export async function saveProfile(form: FormData) {
  const me = await requireMe();
  const nextQ = encodeURIComponent(String(form.get("next") ?? "/"));
  const back = (m: string) => redirect(`/onboarding?next=${nextQ}&e=${encodeURIComponent(m)}`);

  // 본인인증을 마친 사람은 인증된 값만 쓴다 (폼 값으로 나이·성별을 바꾸지 못하게)
  const { data: u } = await db().from("users").select("name,phone,birth_date,verified_gender,identity_verified_at,phone_verified_at").eq("id", me.id).single();
  const v = u?.identity_verified_at ? u : null;
  const name = v?.name ?? String(form.get("name") ?? "").trim();
  // 번호는 인증을 거친 값만 쓴다 (폼으로 바꿀 수 없다)
  const phone = String(v?.phone ?? (u?.phone_verified_at ? u.phone : "") ?? "").replace(/-/g, "");
  const birthYear = v?.birth_date ? Number(String(v.birth_date).slice(0, 4)) : Number(form.get("birth_year"));
  const genderRaw = String(form.get("gender") ?? "");
  const gender = v?.verified_gender ?? (genderRaw === "남성" ? "M" : genderRaw === "여성" ? "F" : genderRaw);
  const job = String(form.get("job") ?? "").trim();
  const mbtiRaw = String(form.get("mbti") ?? "");
  // '잘 모르겠어요'를 고르면 비워 둔다 (엔진은 MBTI가 없으면 중간 점수로 본다)
  const mbti = (MBTIS as readonly string[]).includes(mbtiRaw) ? mbtiRaw : null;
  if (!mbti && mbtiRaw !== "unknown") back("MBTI를 골라 주세요");
  const interests = pick(form, "interests", INTERESTS);
  const myTraits = pick(form, "my_traits", TRAITS);
  const wantedTraits = pick(form, "wanted_traits", TRAITS);
  const price = String(form.get("price_range") ?? "");
  const food = String(form.get("food_restrictions") ?? "").trim();
  const agreed = form.get("agree_privacy") === "on" && form.get("agree_policy") === "on";

  if (name.length < 2) back("이름을 두 글자 이상 적어 주세요");
  if (!/^01\d{8,9}$/.test(phone)) back("휴대폰 번호 인증을 먼저 해 주세요");
  if (!(birthYear >= 1970 && birthYear <= 2007)) back("출생연도를 골라 주세요");
  if (!["M", "F"].includes(gender)) back("성별을 골라 주세요");
  if (!job) back("하는 일을 적어 주세요");
  if (interests.length < 2) back("관심사를 두 개 이상 골라 주세요");
  if (myTraits.length < 1) back("내 성향을 하나 이상 골라 주세요");
  if (wantedTraits.length < 1 && form.get("wanted_any") !== "on") back("만나고 싶은 사람을 하나 이상 골라 주세요");
  if (!(PRICE_RANGES as readonly string[]).includes(price)) back("식사 가격대를 골라 주세요");
  if (!agreed) back("개인정보 수집·이용과 운영 정책에 동의해야 신청할 수 있어요");

  // 휴대폰 번호는 다른 계정과 겹치면 안 된다 (번호 가입 계정의 아이디이기도 하다)
  const { data: dup } = await db().from("users").select("id").or(`phone.eq.${phone},login_id.eq.${phone}`).neq("id", me.id).limit(1);
  if (dup?.length) back("이미 다른 계정에서 쓰는 번호예요. 그 계정으로 로그인해 주세요");
  await db().from("users").update({ name, phone }).eq("id", me.id);

  const { error } = await db().from("profiles").upsert({
    user_id: me.id,
    birth_year: birthYear,
    gender,
    job,
    mbti,
    interests,
    my_traits: myTraits,
    wanted_traits: wantedTraits,
    price_range: price,
    food_restrictions: food || null,
    agreed_at: new Date().toISOString(),
    marketing_opt_in: form.get("agree_marketing") === "on",
    updated_at: new Date().toISOString(),
  });
  if (error) back("저장하지 못했어요. 다시 시도해 주세요");
  const next = String(form.get("next") ?? "/");
  redirect(safeNext(next) ?? "/");
}
