import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, btnLight } from "@/components/admin-ui";
import { SubTabs } from "@/components/admin-subtabs";
import { HashRedirect } from "@/components/hash-redirect";
import { MESSAGES_HASH } from "@/lib/legacy-links";
import { db } from "@/lib/supabase";
import { TEMPLATES } from "@/lib/templates";

/** 안 나간 알림 수 (실패 + 푸시 실패). 발송 이력 탭에 빨간 숫자로 뜬다 */
export async function countFailedNotices() {
  const { count } = await db().from("notifications").select("id", { count: "exact", head: true }).or('status.eq.failed,and(status.eq.sent,last_error.like."푸시 실패*")');
  return count ?? 0;
}

export type MessagesTab = "/admin/messages" | "/admin/messages/notice" | "/admin/messages/templates";

/** 자동 메시지 세 화면(발송 이력·공지 보내기·문구 템플릿)이 함께 쓰는 머리와 탭 */
export async function MessagesHeader({ current, failed: known, desc, how }: { current: MessagesTab; failed?: number; desc: ReactNode; how: ReactNode[] }) {
  const failed = known ?? (await countFailedNotices());
  return (
    <>
      <HashRedirect rules={MESSAGES_HASH} />
      <PageHeader
        title="자동 메시지"
        desc={desc}
        how={how}
        actions={current === "/admin/messages/templates" ? <Link href="/admin/audit?kind=template" className={btnLight}>문구 변경 이력·되돌리기</Link> : undefined}
      />
      <SubTabs
        label="자동 메시지 화면"
        current={current}
        tabs={[
          { href: "/admin/messages", label: "발송 이력", count: failed || undefined, tone: "danger", hint: failed ? `안 나간 알림 ${failed}건` : undefined },
          { href: "/admin/messages/notice", label: "공지 보내기" },
          { href: "/admin/messages/templates", label: "문구 템플릿", count: Object.keys(TEMPLATES).length, hint: `문구 ${Object.keys(TEMPLATES).length}개` },
        ]}
      />
    </>
  );
}
