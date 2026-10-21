import Link from "next/link";
import { btnLight, ctl } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { escapeLike, maskPhone, parseMemberQuery } from "@/lib/members";
import { db } from "@/lib/supabase";
import { FeedbackHeader } from "../header";
import { PersonSafety } from "../person-safety";

export const dynamic = "force-dynamic";

type Person = { id: string; name: string; phone: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 찾을 회원 (이름·연락처 뒤 4자리) */
async function findPeople(raw: string | undefined): Promise<Person[]> {
  const q = parseMemberQuery(raw);
  const base = () => db().from("users").select("id,name,phone").eq("role", "user").order("created_at", { ascending: false }).limit(20);
  if (q.kind === "phone4") return ((await base().like("phone", `%${q.digits}`)).data ?? []) as Person[];
  if (q.kind === "phone") return ((await base().eq("phone", q.digits)).data ?? []) as Person[];
  if (q.kind === "text") return ((await base().ilike("name", `%${escapeLike(q.text)}%`)).data ?? []) as Person[];
  return [];
}

/** 피드백·안전 › 사람별 보기: 한 사람이 고르고 받은 선호, 차단, 신고 */
export default async function PersonView({ searchParams }: { searchParams: Promise<{ r?: string; u?: string; pq?: string }> }) {
  const me = await requireAdmin();
  const { r, u, pq } = await searchParams;
  const personId = u && UUID.test(u) ? u : undefined;
  const [people, { data: person }] = await Promise.all([
    personId ? Promise.resolve([] as Person[]) : findPeople(pq),
    personId ? db().from("users").select("id,name").eq("id", personId).eq("role", "user").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const qs = new URLSearchParams();
  if (r) qs.set("r", r);
  if (personId) qs.set("u", personId);
  const back = `/admin/feedback/person?${qs.toString()}`;
  const rq = r ? `r=${encodeURIComponent(r)}&` : "";

  return (
    <div>
      <FeedbackHeader
        current="/admin/feedback/person"
        r={r}
        desc="한 사람의 선호·차단·신고가 다음 자동 매칭에서 누구와 떨어뜨리고 누구를 가깝게 두는지 확인하는 화면이에요."
        how={["이름이나 연락처 뒤 4자리로 사람 찾기", "피하는 사이·만나고 싶은 사이와 매칭 반영 방식 보기", "잘못 닫은 신고는 다시 열기"]}
      />
      <form className="mt-6 flex flex-wrap gap-2" role="search" aria-label="사람 찾기">
        {r && <input type="hidden" name="r" value={r} />}
        <input name="pq" defaultValue={pq ?? ""} placeholder="이름, 연락처 뒤 4자리" aria-label="찾을 사람" className={`${ctl} w-full max-w-72`} />
        <button className={btnLight}>찾기</button>
        {personId && <Link href={`/admin/feedback/person${r ? `?r=${encodeURIComponent(r)}` : ""}`} className={btnLight}>다른 사람 보기</Link>}
      </form>
      {personId ? (
        person ? (
          <div className="mt-4">
            <p className="mb-3 text-[15px]"><Link href={`/admin/members/${person.id}`} className="font-bold text-ink hover:text-accent">{person.name}님</Link><span className="text-muted">의 관계가 다음 매칭에 쓰이는 방식</span></p>
            <PersonSafety userId={person.id} back={back} canWrite={me.level === "full"} />
          </div>
        ) : <p className="mt-3 text-[14px] text-muted">회원을 찾지 못했어요.</p>
      ) : pq ? (
        <ul className="mt-3 divide-y divide-line rounded-[20px] bg-card px-4 shadow-card">
          {people.map((x) => (
            <li key={x.id}>
              <Link href={`/admin/feedback/person?${rq}u=${x.id}`} className="flex min-h-12 items-center gap-3 text-[14px] hover:text-accent">
                <span className="font-semibold">{x.name}</span><span className="tabular-nums text-muted">{maskPhone(x.phone)}</span>
              </Link>
            </li>
          ))}
          {!people.length && <li className="py-4 text-[14px] text-muted">맞는 회원이 없어요. 두 글자 이상이나 연락처 뒤 4자리로 찾아 주세요.</li>}
        </ul>
      ) : (
        <div className="mt-3 rounded-[20px] bg-card p-5 text-[14px] text-ink2 shadow-card">
          <p className="font-semibold text-ink">먼저 사람을 찾아 주세요</p>
          <p className="mt-1 text-muted">고르면 이런 걸 바로 볼 수 있어요. 안전 신고 탭에서 이름을 눌러도 여기로 와요.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            <li className="rounded-xl bg-paper px-3 py-2"><span className="font-semibold text-ink">이 사람이 피하고 싶은 사람</span> · 다음 매칭에서 반드시 떨어뜨려요</li>
            <li className="rounded-xl bg-paper px-3 py-2"><span className="font-semibold text-ink">이 사람을 피하고 싶은 사람</span> · 다음 매칭에서 반드시 떨어뜨려요</li>
            <li className="rounded-xl bg-paper px-3 py-2"><span className="font-semibold text-ink">다시 만나고 싶은 사람</span> · 점수에만 조금 더해요</li>
            <li className="rounded-xl bg-paper px-3 py-2"><span className="font-semibold text-ink">이미 같이 앉은 사람</span> · 되도록 떨어뜨려요</li>
          </ul>
        </div>
      )}
    </div>
  );
}
