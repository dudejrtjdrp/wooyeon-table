"use client";

import { startTransition, useActionState } from "react";
import { AREAS, CHANNELS, CHANNEL_NAMES, SHEET_PRICES, venueToSheet, type VenueRow } from "@/lib/venue-sheet";
import { saveVenue } from "./actions";

// admin-ui.tsx는 서버 전용 모듈을 함께 불러와서, 클라이언트에서는 같은 클래스만 따로 둔다
const ctl = "h-11 rounded-xl border border-line bg-card px-3.5 text-[14px] text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10";
const btnPrimary = "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold transition active:scale-[.98] bg-accent text-white shadow-cta";

const label = "flex flex-col gap-1.5 text-[13px] font-semibold text-ink2";
const hint = "text-[12px] font-normal text-muted";

/** 식당 한 곳 추가·고치기 폼. 칸과 검사 기준은 엑셀 양식과 같다(venue-sheet.ts) */
export function VenueForm({ venue, ro }: { venue?: Partial<VenueRow> & { id: string }; ro?: boolean }) {
  const s = venue ? venueToSheet(venue) : {};
  const val = (k: string) => (s[k] === undefined ? "" : String(s[k]));
  const back = Object.fromEntries(Object.entries(CHANNELS).map(([k, v]) => [v, k]));
  const outside = venue?.region && !AREAS.includes(venue.region);
  const [res, run, pending] = useActionState(saveVenue, null);
  return (
    // 검사에 걸려도 입력한 값이 남게: 폼 액션의 자동 초기화를 쓰지 않고 직접 보낸다
    <form
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => run(fd)); }}
      className="grid gap-4 md:grid-cols-2"
    >
      {res?.error && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-[14px] font-semibold text-danger md:col-span-2">{res.error}</p>}
      {venue && <input type="hidden" name="id" value={venue.id} />}
      <label className={label}><span className="flex flex-wrap items-baseline gap-x-1.5">식당 이름 <span className="text-danger">*</span></span>
        <input name="name" required defaultValue={val("식당 이름")} className={ctl} disabled={ro} />
      </label>
      <label className={label}><span className="flex flex-wrap items-baseline gap-x-1.5">동네 묶음 <span className="text-danger">*</span></span>
        <select name="region" required defaultValue={outside ? "" : venue?.region ?? AREAS[0]} className={ctl} disabled={ro}>
          {outside && <option value="" disabled>{venue!.region} (지금은 운영하지 않는 동네, 다시 골라 주세요)</option>}
          {AREAS.map((a) => <option key={a}>{a}</option>)}
        </select>
      </label>
      <label className={`${label} md:col-span-2`}><span className="flex flex-wrap items-baseline gap-x-1.5">주소 <span className="text-danger">*</span></span>
        <input name="address" required defaultValue={val("주소")} placeholder="도로명 주소. 지도 버튼이 이 주소로 찾아요" className={ctl} disabled={ro} />
      </label>
      <label className={label}>업종
        <input name="category" defaultValue={val("업종")} placeholder="예: 한식 주점, 이탈리안" className={ctl} disabled={ro} />
      </label>
      <label className={label}>1인 가격대
        <select name="price_range" defaultValue={val("1인 가격대")} className={ctl} disabled={ro}>
          <option value="">정하지 않음</option>
          {SHEET_PRICES.map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <label className={label}><span className="flex flex-wrap items-baseline gap-x-1.5">리뷰 평점 <span className={hint}>0~5, 4.3 이상을 먼저 배정해요</span></span>
        <input name="rating" type="number" step="0.1" min="0" max="5" defaultValue={val("리뷰 평점")} className={ctl} disabled={ro} />
      </label>
      <label className={label}>리뷰 수
        <input name="review_count" type="number" min="0" step="1" defaultValue={val("리뷰 수")} className={ctl} disabled={ro} />
      </label>
      <label className={label}><span className="flex flex-wrap items-baseline gap-x-1.5">예약 채널 <span className={hint}>네이버 예약·캐치테이블이면 자동 예약 요청을 보내요</span></span>
        <select name="booking_channel" defaultValue={venue?.booking_channel ? back[venue.booking_channel] : ""} className={ctl} disabled={ro}>
          <option value="">정하지 않음</option>
          {CHANNEL_NAMES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className={label}>예약 페이지 주소
        <input name="booking_url" type="url" defaultValue={val("예약 페이지 주소")} placeholder="https://" className={ctl} disabled={ro} />
      </label>
      <label className={label}>전화번호
        <input name="phone" type="tel" defaultValue={val("전화번호")} placeholder="02-123-4567" className={ctl} disabled={ro} />
      </label>
      <label className={label}><span className="flex flex-wrap items-baseline gap-x-1.5">지도 링크 <span className={hint}>비우면 이름·주소로 찾아요</span></span>
        <input name="map_url" type="url" defaultValue={val("지도 링크")} placeholder="https://" className={ctl} disabled={ro} />
      </label>
      <label className={label}><span className="flex flex-wrap items-baseline gap-x-1.5">테이블당 좌석 <span className={hint}>4~8</span></span>
        <input name="seats_per_table" type="number" min="4" max="8" step="1" defaultValue={val("테이블당 좌석") || "6"} className={ctl} disabled={ro} />
      </label>
      <label className={label}>배정
        <select name="active" defaultValue={val("사용") || "예"} className={ctl} disabled={ro}>
          <option value="예">배정함</option>
          <option value="아니오">쉬는 중 (배정하지 않음)</option>
        </select>
      </label>
      {!ro && (
        <div className="flex items-center gap-3 md:col-span-2">
          <button disabled={pending} className={`${btnPrimary} disabled:opacity-60`}>{pending ? "저장하는 중" : venue ? "고친 내용 저장" : "식당 추가"}</button>
          <span className="text-[13px] text-muted">{venue ? "바뀐 칸은 처리 이력에 남아요." : "배정함이면 모집 중인 같은 동네 일정마다 2테이블씩 잡아요."}</span>
        </div>
      )}
    </form>
  );
}
