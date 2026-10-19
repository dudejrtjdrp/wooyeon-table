import { PageHeader, Panel, Stat, td, th } from "@/components/admin-ui";
import { SubTabs } from "@/components/admin-subtabs";
import { requireAdmin } from "@/lib/auth";
import { OPEN_REGIONS } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 지역 수요: 아직 안 연 동네에 '열리면 알려 주세요'를 남긴 사람 수. 다음에 열 곳을 고르는 근거 */
export default async function Demand({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin();
  const tab = (await searchParams).tab === "notes" ? "notes" : "areas";
  const { data } = await db().from("region_demands").select("id,sido,area,note,notified_at,created_at,users(name)").order("created_at", { ascending: false }).limit(1000);
  const rows = (data ?? []) as unknown as { id: string; sido: string; area: string | null; note: string | null; notified_at: string | null; created_at: string; users: { name: string } }[];
  const since = Date.now() - 30 * 86400_000;
  const by = new Map<string, { sido: string; area: string; total: number; recent: number; waiting: number }>();
  for (const r of rows) {
    const k = `${r.sido}|${r.area ?? ""}`;
    const cur = by.get(k) ?? { sido: r.sido, area: r.area ?? "(동네 미정)", total: 0, recent: 0, waiting: 0 };
    cur.total++;
    if (new Date(r.created_at).getTime() >= since) cur.recent++;
    if (!r.notified_at) cur.waiting++;
    by.set(k, cur);
  }
  const ranked = [...by.values()].sort((a, b) => b.waiting - a.waiting || b.recent - a.recent);
  const allNotes = rows.filter((r) => r.note);
  const notes = allNotes.slice(0, 50);

  return (
    <div>
      <PageHeader
        title="새 동네 요청"
        desc={`지금 여는 동네는 ${OPEN_REGIONS.join(", ")}예요. 아직 안 연 동네에 참가자가 '열리면 알려 주세요'를 남기면 여기에 모여요. 그 동네에 회차를 열면 기다리던 사람에게 자동으로 알림이 가요.`}
        how={["'기다리는 사람'이 많은 동네부터 보기", "'남긴 말' 탭에서 원하는 시간·분위기 읽기", "열 곳을 정하면 식당을 넣고 회차 만들기"]}
      />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="남긴 사람" value={`${new Set(rows.map((r) => r.users?.name)).size}명`} />
        <Stat label="아직 알림 전" value={`${rows.filter((r) => !r.notified_at).length}건`} />
        <Stat label="최근 30일" value={`${rows.filter((r) => new Date(r.created_at).getTime() >= since).length}건`} />
        <Stat label="1순위 후보" value={ranked[0] ? ranked[0].area : "-"} sub={ranked[0] ? `${ranked[0].waiting}명 기다림` : undefined} />
      </div>
      <SubTabs
        label="새 동네 요청 화면"
        current={tab}
        tabs={[
          { key: "areas", href: "/admin/demand", label: "동네별 수요", count: ranked.length },
          { key: "notes", href: "/admin/demand?tab=notes", label: "남긴 말", count: allNotes.length },
        ]}
      />
      {tab === "areas" ? (
      <Panel title="동네별 수요" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead className="border-b border-line"><tr>{["시·도", "동네", "기다리는 사람", "최근 30일", "전체", ].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {ranked.map((r) => (
                <tr key={`${r.sido}${r.area}`}>
                  <td className={td}>{r.sido}</td>
                  <td className={`${td} font-semibold`}>{r.area}</td>
                  <td className={`${td} tabular-nums font-bold text-accent`}>{r.waiting}</td>
                  <td className={`${td} tabular-nums`}>{r.recent}</td>
                  <td className={`${td} tabular-nums text-muted`}>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ranked.length && <p className="p-10 text-center text-muted">아직 남긴 수요가 없어요.</p>}
        </div>
      </Panel>
      ) : (
        <Panel title="남긴 말" className="mt-4" action={allNotes.length > notes.length ? <span className="text-[13px] text-muted">최근 {notes.length}개</span> : undefined}>
          {!notes.length ? <p className="text-[14px] text-muted">아직 남긴 말이 없어요.</p> : (
            <ul className="divide-y divide-line text-[14px]">
              {notes.map((n) => (
                <li key={n.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4"><span className="shrink-0 text-muted sm:w-40">{n.sido} · {n.area ?? "동네 미정"}</span><span className="min-w-0 flex-1">{n.note}</span><span className="shrink-0 text-[13px] text-muted">{fmtDateTime(n.created_at)}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
