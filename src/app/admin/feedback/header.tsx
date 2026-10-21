import type { ReactNode } from "react";
import { PageHeader } from "@/components/admin-ui";
import { SubTabs } from "@/components/admin-subtabs";
import { HashRedirect } from "@/components/hash-redirect";
import { FEEDBACK_HASH } from "@/lib/legacy-links";
import { db } from "@/lib/supabase";

export type FeedbackTab = "/admin/feedback" | "/admin/feedback/reports" | "/admin/feedback/person";

/** 피드백·안전 세 화면(만족도·후기, 안전 신고, 사람별 보기)이 함께 쓰는 머리와 탭 */
export async function FeedbackHeader({ current, desc, how, actions, r }: { current: FeedbackTab; desc: ReactNode; how: ReactNode[]; actions?: ReactNode; r?: string }) {
  const { count: open } = await db().from("safety_reports").select("id", { count: "exact", head: true }).eq("status", "open");
  // 고른 회차는 탭을 오가도 남긴다
  const q = r ? `?r=${encodeURIComponent(r)}` : "";
  return (
    <>
      <HashRedirect rules={FEEDBACK_HASH} />
      <PageHeader title="피드백·안전" desc={desc} how={how} actions={actions} />
      <SubTabs
        label="피드백·안전 화면"
        current={current}
        tabs={[
          { href: `/admin/feedback${q}`, label: "만족도·후기" },
          { href: `/admin/feedback/reports${q}`, label: "안전 신고", count: open || undefined, tone: "danger", hint: open ? `검토 대기 ${open}건` : undefined },
          { href: `/admin/feedback/person${q}`, label: "사람별 매칭 반영" },
        ]}
      />
    </>
  );
}
