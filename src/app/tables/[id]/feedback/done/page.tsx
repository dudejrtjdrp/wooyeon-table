import Link from "next/link";
import { redirect } from "next/navigation";
import { RoundTable } from "@/components/brand";
import { Card, LinkButton, PageTitle, Screen } from "@/components/ui";
import { requireMe } from "@/lib/auth";
import { fmtSlot } from "@/lib/format";
import { nextPick } from "@/lib/next-pick";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 후기를 보낸 직후: 고맙다는 말과 함께 다음 일정을 바로 권한다.
 * 100명 시뮬레이션에서 재방문을 가장 크게 막은 것이 '모임은 괜찮았지만 다음엔 안 옴'이라, 만족한 순간에 다음 신청을 이어 준다 (성효님 결정, 2026-10-18)
 */
export default async function FeedbackDone({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  const { data: mine } = await db().from("applications").select("id").eq("table_id", id).eq("user_id", me.id).maybeSingle();
  if (!mine) redirect("/");
  // 후기를 아직 안 보냈으면 후기 화면으로
  const { data: fb } = await db().from("feedbacks").select("application_id").eq("application_id", mine.id).maybeSingle();
  if (!fb) redirect(`/tables/${id}/feedback`);
  const next = await nextPick(me.id);

  return (
    <Screen title="보냈어요" back="/">
      <PageTitle className="mt-4" title="알려 줘서 고마워요." accent="다음 테이블에 반영할게요" />
      {next ? (
        <Card className="mt-7">
          <p className="text-[14px] text-muted">다음 일정 추천</p>
          <h2 className="mt-1.5 text-[21px] font-black leading-[1.4]">{next.why}</h2>
          <div className="my-5 flex justify-center"><RoundTable size={180} filled={1} /></div>
          <p className="mb-3 text-center text-[14px] text-muted">{next.roundTitle} · {fmtSlot(next.deadline)} 마감</p>
          <LinkButton href={`/apply/${next.roundId}`}>다음 일정 신청하기</LinkButton>
          <p className="mt-2 text-center">
            <Link href="/" className="inline-flex h-11 items-center px-3 text-[14px] text-muted underline underline-offset-4">나중에 할게요</Link>
          </p>
        </Card>
      ) : (
        <Card className="mt-7">
          <p className="text-[16px] font-bold text-ink">지금 모집 중인 다음 일정이 없어요</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">새 일정이 열리면 일정 탭에 바로 올라와요. 새 일정 알림을 켜 두면 열릴 때 알려 드려요.</p>
          <LinkButton href="/" className="mt-5">홈으로</LinkButton>
        </Card>
      )}
    </Screen>
  );
}
