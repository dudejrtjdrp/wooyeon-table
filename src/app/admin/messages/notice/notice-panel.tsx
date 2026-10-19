import Link from "next/link";
import { Panel, btnLight, btnPrimary, ctl } from "@/components/admin-ui";
import { Required } from "@/components/ui";
import { fmtSlot } from "@/lib/format";
import { escapeLike, maskPhone, parseMemberQuery } from "@/lib/members";
import { NOTICE_BODY_MAX, NOTICE_SCOPES, NOTICE_TITLE_MAX, type NoticeScope, parseScope } from "@/lib/notice-rules";
import { db } from "@/lib/supabase";
import { ConfirmButton } from "../../confirm-button";
import { sendAnnouncement } from "../actions";
import { loadNoticeTarget } from "../notice-data";

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 공지 보내기: 대상 고르기 → 받는 사람 수 미리 보기 → 문구 쓰고 확인 후 보내기 */
export async function NoticePanel({ sp, ro }: { sp: SP; ro: boolean }) {
  const ns: NoticeScope = parseScope(one(sp, "ns")) ?? "round";
  const nr = one(sp, "nr");
  const nt = one(sp, "nt");
  const nq = one(sp, "nq");
  const nm = one(sp, "nm");
  const roundId = nr && UUID.test(nr) ? nr : undefined;
  const { data: rounds } = await db().from("rounds").select("id,title,status").order("match_at", { ascending: false }).limit(30);
  const { data: tables } = ns === "table" && roundId
    ? await db().from("dining_tables").select("id,status,slots(starts_at,region),venues(name)").eq("round_id", roundId).limit(200)
    : { data: [] };
  const tbs = ((tables ?? []) as unknown as { id: string; status: string; slots: { starts_at: string; region: string } | null; venues: { name: string } | null }[])
    .sort((a, b) => (a.slots?.starts_at ?? "").localeCompare(b.slots?.starts_at ?? ""));
  const mq = ns === "member" && !nm ? parseMemberQuery(nq) : { kind: "empty" as const };
  const base = () => db().from("users").select("id,name,phone").eq("role", "user").is("deleted_at", null).order("created_at", { ascending: false }).limit(10);
  const found = mq.kind === "phone4" ? (await base().like("phone", `%${mq.digits}`)).data
    : mq.kind === "phone" ? (await base().eq("phone", mq.digits)).data
    : mq.kind === "text" ? (await base().ilike("name", `%${escapeLike(mq.text)}%`)).data
    : [];

  const targetId = ns === "round" ? roundId : ns === "table" ? (nt && UUID.test(nt) ? nt : undefined) : nm && UUID.test(nm) ? nm : undefined;
  const target = targetId ? await loadNoticeTarget(ns, targetId) : null;
  const here = new URLSearchParams();
  here.set("ns", ns);
  if (roundId) here.set("nr", roundId);
  if (ns === "table" && nt) here.set("nt", nt);
  if (ns === "member" && nm) here.set("nm", nm);
  const back = `/admin/messages/notice?${here.toString()}`;

  return (
    <Panel title="공지 보내기" action={<span className="text-[12px] text-muted">푸시·알림함</span>}>
      <p className="text-[13px] text-muted">회차 신청자, 테이블, 회원 한 명에게 짧은 공지를 보내요. 보내기 전에 받는 사람 수를 먼저 보여 드려요. 같은 대상에게 같은 공지는 한 번만 나가요.</p>
      <form className="mt-3 flex flex-wrap items-end gap-2" action="/admin/messages/notice">
        <label className="text-[13px] text-muted">
          받는 사람
          <select name="ns" defaultValue={ns} className={`${ctl} mt-1 block`}>
            {Object.entries(NOTICE_SCOPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {ns !== "member" ? (
          <label className="text-[13px] text-muted">
            회차
            <select name="nr" defaultValue={roundId ?? ""} className={`${ctl} mt-1 block max-w-[260px]`}>
              <option value="">회차를 골라 주세요</option>
              {(rounds ?? []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </label>
        ) : (
          <label className="text-[13px] text-muted">
            회원
            <input name="nq" defaultValue={nq ?? ""} placeholder="이름, 연락처 뒤 4자리" className={`${ctl} mt-1 block w-60`} />
          </label>
        )}
        {ns === "table" && roundId && (
          <label className="text-[13px] text-muted">
            테이블
            <select name="nt" defaultValue={nt ?? ""} className={`${ctl} mt-1 block max-w-[300px]`}>
              <option value="">테이블을 골라 주세요</option>
              {tbs.map((t) => <option key={t.id} value={t.id}>{t.slots ? `${fmtSlot(t.slots.starts_at)} ${t.slots.region}` : "테이블"}{t.venues ? ` · ${t.venues.name}` : ""}</option>)}
            </select>
          </label>
        )}
        <button className={btnLight}>{ns === "member" ? "찾기" : ns === "table" && roundId ? "대상 보기" : ns === "table" ? "테이블 고르기" : "대상 보기"}</button>
      </form>
      {ns === "table" && roundId && !tbs.length && <p className="mt-2 text-[13px] text-muted">이 회차에는 아직 테이블이 없어요.</p>}

      {ns === "member" && !nm && nq && (
        <ul className="mt-3 divide-y divide-line rounded-xl bg-paper px-3">
          {(found ?? []).map((u) => (
            <li key={u.id}>
              <Link href={`/admin/messages/notice?ns=member&nm=${u.id}`} className="flex min-h-11 items-center gap-3 text-[14px] hover:text-accent">
                <span className="font-semibold">{u.name}</span><span className="tabular-nums text-muted">{maskPhone(u.phone)}</span>
              </Link>
            </li>
          ))}
          {!found?.length && <li className="py-3 text-[13px] text-muted">맞는 회원이 없어요. 두 글자 이상이나 연락처 뒤 4자리로 찾아 주세요.</li>}
        </ul>
      )}

      {target && !target.ok && <p className="mt-3 text-[13px] text-danger">{target.message}</p>}
      {target?.ok && (
        <div className="mt-4 rounded-xl bg-paper p-4">
          <p className="text-[14px]">
            <b>{target.label}</b> · 받는 사람 <b className="tabular-nums">{target.userIds.length}명</b>
          </p>
          {target.userIds.length > 0 ? (
            <p className="mt-0.5 text-[13px] text-muted">{target.names.slice(0, 8).join(", ")}{target.names.length > 8 ? ` 외 ${target.names.length - 8}명` : ""}</p>
          ) : (
            <p className="mt-0.5 text-[13px] text-muted">{ns === "table" ? "지금 이 테이블에 확정된 사람이 없어요." : ns === "round" ? "이 회차에 신청서를 낸 사람이 없어요." : "탈퇴한 회원이라 보낼 수 없어요."}</p>
          )}
          {ro ? <p className="mt-3 text-[12px] text-muted">조회 전용 계정이라 공지를 보낼 수 없어요.</p> : target.userIds.length > 0 && (
            <form action={sendAnnouncement} className="mt-3 space-y-2">
              <input type="hidden" name="scope" value={ns} />
              <input type="hidden" name="target" value={targetId} />
              <input type="hidden" name="expect" value={target.userIds.length} />
              <input type="hidden" name="back" value={back} />
              <label className="block text-[13px] text-muted">
                제목<Required />
                <input name="title" required minLength={2} maxLength={NOTICE_TITLE_MAX} placeholder="예: 이번 주 모임 장소 안내" className={`${ctl} mt-1 w-full`} />
              </label>
              <label className="block text-[13px] text-muted">
                내용<Required /> <span className="text-[12px]">(한 줄, {NOTICE_BODY_MAX}자까지)</span>
                <input name="body" required minLength={4} maxLength={NOTICE_BODY_MAX} placeholder="예: 식당 입구가 공사 중이라 옆문으로 들어와 주세요" className={`${ctl} mt-1 w-full`} />
              </label>
              <ConfirmButton confirm={`${target.label} ${target.userIds.length}명에게 공지를 보내요. 보낸 공지는 되돌릴 수 없어요. 보낼까요?`} className={btnPrimary}>
                {target.userIds.length}명에게 보내기
              </ConfirmButton>
            </form>
          )}
        </div>
      )}
    </Panel>
  );
}
