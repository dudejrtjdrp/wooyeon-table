import { btnDanger, btnInk, ctl } from "@/components/admin-ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { ConfirmButton } from "../../confirm-button";
import { emergencyAction } from "./actions";

type M = { id: string; name: string };
type T = { id: string; count: number; slot_id: string; slots: { starts_at: string; region: string }; venues: { name: string } | null };

const reasonInput = (
  <label className="block">
    <span className="text-[12px] font-semibold text-ink">사유 <span className="text-danger">(필수)</span></span>
    <input name="reason" required minLength={4} placeholder="예: 신고 접수로 분리, 당일 사정으로 불참 연락" className={`${ctl} mt-1 w-full`} />
    <span className="mt-1 block text-[12px] text-muted">4자 이상. 참가자 이력과 테이블 이력에 그대로 남아요.</span>
  </label>
);

function Op({ title, desc, children, danger }: { title: string; desc: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <details className="group rounded-xl border border-line open:bg-paper/60">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
        <span>
          <span className={`text-[14px] font-semibold ${danger ? "text-danger" : ""}`}>{title}</span>
          <span className="ml-2 text-[12px] text-muted">{desc}</span>
        </span>
        <span className="text-[12px] text-muted group-open:hidden">열기</span>
      </summary>
      <div className="space-y-2.5 px-4 pb-4">{children}</div>
    </details>
  );
}

/** 운영자 긴급 수정 (MAT-14). 확정 후 취소·안전 문제 같은 예외에서만 쓴다 */
export function OpsPanel({ tableId, slotId, members, siblings, active, exceptionId }: { tableId: string; slotId: string; members: M[]; siblings: T[]; active: boolean; exceptionId?: string }) {
  if (!active) return <p className="text-[13px] text-muted">끝났거나 해제된 테이블이라 수정할 수 없어요.</p>;
  const label = (t: T) => `${fmtDate(t.slots.starts_at)} ${fmtTime(t.slots.starts_at)} ${t.slots.region}${t.venues ? ` · ${t.venues.name}` : ""} (${t.count}명)`;
  const sameSlot = siblings.filter((t) => t.slot_id === slotId);
  const hidden = (op: string) => (
    <>
      <input type="hidden" name="table_id" value={tableId} />
      <input type="hidden" name="op" value={op} />
      {exceptionId ? (
        <input type="hidden" name="ex" value={exceptionId} />
      ) : (
        <label className="flex items-start gap-2 rounded-lg bg-warn-soft/60 px-3 py-2 text-[13px] text-ink">
          <input type="checkbox" name="no_ex" required className="mt-0.5" />
          <span>예외함에 올라온 건이 아니지만 예외 상황이 맞아요 (참가자 연락·현장 사정 등). 이력에 &lsquo;예외 없이 수정&rsquo;으로 남아요</span>
        </label>
      )}
    </>
  );
  return (
    <div className="space-y-2">
      <p className="mb-3 rounded-xl bg-candle/15 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink">
        정상 흐름은 자동으로 처리돼요. 확정 뒤 취소, 안전 문제처럼 자동으로 풀리지 않는 경우에만 쓰세요. 나이 차이·차단 관계는 여기서도 지켜요.
        {!exceptionId && " 예외함 카드에서 들어오지 않았다면, 예외 상황이 맞는지 한 번 더 확인받아요."}
      </p>
      <Op title="참가자 이동" desc="다른 테이블로 옮기기">
        <form action={emergencyAction} className="space-y-2.5">
          {hidden("move")}
          <select name="app_id" required className={`${ctl} w-full`}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <select name="target_id" required className={`${ctl} w-full`}>
            {siblings.length ? siblings.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>) : <option value="">같은 회차에 열린 테이블이 없어요</option>}
          </select>
          <label className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" name="allow_slot" /> 참가자가 고르지 않은 일정도 허용 (본인 동의 확인 후)</label>
          {reasonInput}
          <ConfirmButton confirm="이 참가자를 고른 테이블로 옮기고 두 단체방과 본인에게 바로 알려요. 계속할까요?" className={btnInk} disabled={!siblings.length}>옮기기</ConfirmButton>
        </form>
      </Op>
      <Op title="참가자 제외" desc="안전 문제 등으로 빼기">
        <form action={emergencyAction} className="space-y-2.5">
          {hidden("remove")}
          <select name="app_id" required className={`${ctl} w-full`}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <label className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" name="refund" /> 바로 전액 환불 (끄면 참가자가 다른 일정·보관·환불을 고름)</label>
          {reasonInput}
          <p className="text-[12px] text-muted">빈자리는 대기자에게 먼저 제안하고, 받을 사람이 없으면 인원 기준에 맞춰 자동 정리돼요.</p>
          <ConfirmButton confirm="이 참가자를 테이블에서 빼고 본인에게 바로 알려요. '바로 전액 환불'을 켰다면 환불도 진행돼 되돌릴 수 없어요. 계속할까요?" className={btnInk}>제외하기</ConfirmButton>
        </form>
      </Op>
      <Op title="테이블 병합" desc="같은 시간 테이블과 합치기">
        <form action={emergencyAction} className="space-y-2.5">
          {hidden("merge")}
          <select name="target_id" required className={`${ctl} w-full`}>
            {sameSlot.length ? sameSlot.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>) : <option value="">같은 시간·지역에 열린 테이블이 없어요</option>}
          </select>
          {reasonInput}
          <p className="text-[12px] text-muted">이 테이블 사람들이 고른 테이블로 옮기고, 이 테이블은 해제돼요.</p>
          <ConfirmButton confirm="이 테이블 사람들을 고른 테이블로 옮기고 이 테이블은 해제해요. 되돌릴 수 없어요. 계속할까요?" className={btnInk} disabled={!sameSlot.length}>합치기</ConfirmButton>
        </form>
      </Op>
      <Op title="테이블 분리" desc="일부를 새 테이블로 나누기">
        <form action={emergencyAction} className="space-y-2.5">
          {hidden("split")}
          <div className="grid grid-cols-2 gap-1.5">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-[13px]"><input type="checkbox" name="app_ids" value={m.id} /> {m.name}</label>
            ))}
          </div>
          {reasonInput}
          <p className="text-[12px] text-muted">고른 사람은 같은 시간 새 테이블로 가고 식당을 새로 배정해요. 나눈 뒤 두 테이블 모두 최소 인원 이상이어야 해요.</p>
          <ConfirmButton confirm="고른 사람들을 새 테이블로 나누고 식당을 새로 배정해요. 계속할까요?" className={btnInk}>나누기</ConfirmButton>
        </form>
      </Op>
      <Op title="테이블 해제" desc="모임 취소" danger>
        <form action={emergencyAction} className="space-y-2.5">
          {hidden("dissolve")}
          {reasonInput}
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="confirm" /> 참가자 {members.length}명 모두에게 취소를 알리고 다른 일정·보관·환불을 고르게 해요</label>
          <ConfirmButton confirm={`참가자 ${members.length}명 모두에게 모임 취소를 알리고 테이블을 해제해요. 되돌릴 수 없어요. 계속할까요?`} className={btnDanger}>해제하기</ConfirmButton>
        </form>
      </Op>
    </div>
  );
}
