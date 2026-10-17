import { Toast } from "@/components/ui";
import { requireMe, safeNext } from "@/lib/auth";
import { FOOD_AVOID, INTEREST_GROUPS, MBTIS, PRICE_RANGES, TRAITS } from "@/lib/constants";
import { idvEnabled } from "@/lib/identity";
import { db } from "@/lib/supabase";
import { saveProfile } from "./actions";
import { OnboardingWizard } from "./wizard";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ e?: string; m?: string; next?: string; by?: string; g?: string; step?: string }> }) {
  const me = await requireMe();
  const { e, m, next, by, g, step } = await searchParams;
  const [{ data: p }, { data: u }] = await Promise.all([
    db().from("profiles").select("*").eq("user_id", me.id).maybeSingle(),
    db().from("users").select("name,phone,birth_date,verified_gender,identity_verified_at,phone_verified_at").eq("id", me.id).single(),
  ]);
  const verified = u?.identity_verified_at && u.birth_date
    ? { name: u.name, phone: u.phone, birthYear: Number(String(u.birth_date).slice(0, 4)), gender: u.verified_gender as "M" | "F" | null }
    : null;
  return (
    <>
    <Toast msg={m} />
    <OnboardingWizard
      action={saveProfile}
      profile={p}
      name={me.name.endsWith(" 사용자") ? "" : me.name}
      phone={me.phone}
      next={safeNext(next) ?? "/"}
      error={e}
      prefill={{ by: by ? Number(by) : undefined, g }}
      lists={{ groups: INTEREST_GROUPS, traits: TRAITS, mbtis: MBTIS, prices: PRICE_RANGES, avoid: FOOD_AVOID }}
      editing={Boolean(p)}
      verified={verified}
      idvOn={idvEnabled()}
      userKey={me.id.slice(0, 8)}
      phoneVerified={Boolean(u?.phone_verified_at)}
      initialStep={step !== undefined && Number.isInteger(Number(step)) ? Number(step) : undefined}
    />
    </>
  );
}
