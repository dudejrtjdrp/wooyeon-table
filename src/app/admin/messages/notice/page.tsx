import Link from "next/link";
import { Panel } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import { MessagesHeader } from "../header";
import { NoticePanel } from "./notice-panel";

export const dynamic = "force-dynamic";

/** 공지 보내기: 대상 고르기 → 받는 사람 수 보기 → 문구 쓰고 보내기. 단계마다 주소가 바뀌어서 모달이 아니라 탭으로 둔다 */
export default async function NoticePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  // 최근에 보낸 공지 (같은 공지는 받는 사람마다 한 줄이라 제목·내용으로 묶는다)
  const { data: recent } = await db().from("notifications").select("title,body,scheduled_at").eq("template", "announcement").order("scheduled_at", { ascending: false }).limit(200);
  const seen = new Map<string, { title: string; body: string; at: string; n: number }>();
  for (const x of recent ?? []) {
    const k = `${x.title}|${x.body}`;
    const cur = seen.get(k);
    if (cur) cur.n++;
    else seen.set(k, { title: x.title, body: x.body, at: x.scheduled_at, n: 1 });
  }
  const sent = [...seen.values()].slice(0, 8);

  return (
    <div>
      <MessagesHeader
        current="/admin/messages/notice"
        desc="회차 신청자, 테이블, 회원 한 명에게 짧은 공지를 보내요. 자동 메시지로 안 되는 급한 안내에만 써요."
        how={["받는 사람 고르기", "받는 사람 수 확인", "제목·내용 쓰고 보내기"]}
      />
      <div className="mt-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <NoticePanel sp={sp} ro={me.level !== "full"} />
        <Panel title="최근 보낸 공지">
          {!sent.length ? <p className="text-[14px] text-muted">아직 보낸 공지가 없어요.</p> : (
            <ul className="divide-y divide-line text-[14px]">
              {sent.map((x) => (
                <li key={`${x.title}|${x.body}`} className="py-2.5">
                  <p className="font-semibold text-ink">{x.title}</p>
                  <p className="text-[13px] text-ink2">{x.body}</p>
                  <p className="mt-0.5 text-[12px] text-muted">{fmtDateTime(x.at)} · {x.n}명</p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/messages?tpl=announcement" className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-accent hover:underline">발송 이력에서 보기</Link>
        </Panel>
      </div>
    </div>
  );
}
