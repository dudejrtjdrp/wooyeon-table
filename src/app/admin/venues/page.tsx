import { TableScroll } from "@/components/table-scroll";
import { Download, FileSpreadsheet, ImageOff, Images, Plus } from "lucide-react";
import Link from "next/link";
import { AdminModal } from "@/components/admin-modal";
import { Badge, PageHeader, Panel, Term, btn, btnLight, btnPrimary, ctl, td, th } from "@/components/admin-ui";
import { TIP } from "@/lib/admin-glossary";
import { requireAdmin } from "@/lib/auth";
import { CHANNEL_LABEL, type Channel } from "@/lib/reservations";
import { db } from "@/lib/supabase";
import { CHANNEL_NONE, filterVenues, parseVenueFilter, venueFiltered } from "@/lib/venue-list-rules";
import { importVenues, uploadPhotoByName, uploadVenuePhoto } from "./actions";
import { BulkPhotos, ExcelImport, VenuePhotoButton } from "./photo-upload";
import { VenueForm } from "./venue-form";

const linkBtn = `${btn} border border-line bg-card text-ink hover:bg-field`;

export const dynamic = "force-dynamic";
// 엑셀로 식당을 많이 넣을 때 서버 요청이 기본 시간 제한에 걸리지 않게
export const maxDuration = 60;

type V = { id: string; name: string; region: string; category: string | null; address: string; price_range: string | null; rating: number | null; review_count: number | null; booking_channel: string | null; photo_url: string | null; active: boolean };

/** 식당 관리: 제휴 식당 목록, 사진, 엑셀로 한 번에 넣기. 배정은 매칭 확정 때 이 목록에서 자동으로 한다 */
export default async function Venues({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdmin();
  const f = parseVenueFilter(await searchParams);
  const ro = me.level === "viewer";
  const { data } = await db().from("venues").select("id,name,region,category,address,price_range,rating,review_count,booking_channel,photo_url,active").order("region").order("name");
  const venues = (data ?? []) as V[];
  const noPhoto = venues.filter((v) => !v.photo_url).length;
  const regions = [...new Set(venues.map((v) => v.region))];
  const shown = filterVenues(venues, f);
  const filtered = venueFiltered(f);

  return (
    <div>
      <PageHeader
        title="식당 관리"
        desc="제휴 식당 목록이에요. 테이블이 확정되면 이 목록에서 동네·시간·인원·평점·예약 채널을 보고 자동으로 배정해요."
        how={["'식당 추가'로 한 곳씩, '엑셀로 가져오기'로 여러 곳 넣기", "아래 칸으로 찾고 거르기 (사진 없는 곳도)", "식당 이름을 눌러 고치기·배정 끄기·지우기", <>일정별 <Term tip={TIP.식당재고}>식당 재고</Term>는 회차·식당 재고에서</>]}
        actions={ro ? (
          <a href="/admin/venues/template?filled=1" download className={linkBtn}><Download size={16} aria-hidden="true" />지금 식당 내려받기</a>
        ) : (
          <>
            <AdminModal label="사진 여러 장" icon={<Images size={16} aria-hidden="true" />} triggerClassName={linkBtn} title="사진 여러 장 한 번에" desc="파일 이름을 식당 이름으로 맞춰 주세요. 같은 이름이 여러 동네에 있으면 '동네 묶음_식당 이름'으로요. 사진은 올리기 전에 자동으로 줄여요.">
              <BulkPhotos action={uploadPhotoByName} />
            </AdminModal>
            <AdminModal label="엑셀로 가져오기" icon={<FileSpreadsheet size={16} aria-hidden="true" />} triggerClassName={btnLight} title="엑셀로 여러 곳 한 번에" desc="올리면 먼저 바뀔 내용을 보여 드리고, '이대로 넣기'를 눌러야 반영해요." hash="import">
              <ol className="space-y-1.5 text-[14px] text-ink2">
                <li>1. 양식을 내려받아요. 동네·가격대·예약 채널은 목록에서 골라요.</li>
                <li>2. 한 줄에 식당 하나씩 채워요. 빨간 칸이 필수예요.</li>
                <li>3. 올리면 같은 동네·같은 이름은 고치고, 없으면 새로 만들어요.</li>
              </ol>
              <div className="mt-3 flex flex-wrap gap-2">
                {/* 파일 내려받기라 페이지 이동(Link)이 아니라 일반 링크를 쓴다 */}
                <a href="/admin/venues/template" download className={linkBtn}><Download size={16} aria-hidden="true" />빈 양식</a>
                <a href="/admin/venues/template?filled=1" download className={linkBtn}><Download size={16} aria-hidden="true" />지금 식당 내려받기</a>
              </div>
              <div className="mt-4 border-t border-line pt-4"><ExcelImport action={importVenues} /></div>
            </AdminModal>
            <AdminModal label="식당 추가" icon={<Plus size={16} aria-hidden="true" />} triggerClassName={btnPrimary} title="식당 추가" desc="한 곳씩 넣어요. 칸과 검사 기준은 엑셀 양식과 같아요." hash="new" wide>
              <VenueForm />
            </AdminModal>
          </>
        )}
      />

      <div className="mt-6">
        <Panel title={`제휴 식당 ${venues.length}곳 · ${regions.length}개 동네${noPhoto ? ` · 사진 없는 곳 ${noPhoto}곳` : ""}`}>
          {/* 거르기는 주소에 남는다(새로 고침·공유해도 같은 목록) */}
          <form className="mb-4 flex flex-wrap items-end gap-2" role="search" aria-label="식당 찾기">
            <label className="block min-w-48 flex-1"><span className="text-[12px] font-semibold text-muted">이름·주소</span><input name="q" defaultValue={f.q} placeholder="예: 을지로, 한식당" className={`${ctl} mt-1 w-full`} /></label>
            <label className="block"><span className="text-[12px] font-semibold text-muted">동네</span>
              <select name="region" defaultValue={f.region ?? ""} className={`${ctl} mt-1 block`}><option value="">모든 동네</option>{regions.map((r) => <option key={r} value={r}>{r}</option>)}</select>
            </label>
            <label className="block"><span className="text-[12px] font-semibold text-muted">배정</span>
              <select name="state" defaultValue={f.state ?? ""} className={`${ctl} mt-1 block`}><option value="">전체</option><option value="on">배정함</option><option value="off">쉬는 중</option></select>
            </label>
            <label className="block"><span className="text-[12px] font-semibold text-muted">사진</span>
              <select name="photo" defaultValue={f.photo ?? ""} className={`${ctl} mt-1 block`}><option value="">전체</option><option value="yes">있음</option><option value="no">없음</option></select>
            </label>
            <label className="block"><span className="text-[12px] font-semibold text-muted">예약 채널</span>
              <select name="ch" defaultValue={f.ch ?? ""} className={`${ctl} mt-1 block`}><option value="">전체</option>{(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}<option value={CHANNEL_NONE}>비어 있음</option></select>
            </label>
            <button className={btnLight}>찾기</button>
            {filtered && <Link href="/admin/venues" className="inline-flex h-11 items-center px-2 text-[13px] font-semibold text-muted hover:text-ink">거르기 풀기</Link>}
          </form>
          {filtered && <p className="mb-2 text-[13px] text-muted" aria-live="polite">{venues.length}곳 중 {shown.length}곳</p>}
          <TableScroll className="" label="식당 표">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead><tr>{["사진", "동네", "식당", "가격대", "평점", "예약", "상태", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {shown.map((v) => (
                  <tr key={v.id}>
                    <td className={td}>
                      {v.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.photo_url} alt={`${v.name} 사진`} className="size-14 rounded-lg object-cover" />
                      ) : (
                        <span className="flex size-14 items-center justify-center rounded-lg bg-field text-muted" title="사진 없음"><ImageOff size={18} aria-label="사진 없음" /></span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{v.region}</td>
                    <td className={td}>
                      <Link href={`/admin/venues/${v.id}`} className="block min-w-[160px] font-semibold text-ink underline-offset-4 hover:text-accent hover:underline">{v.name}</Link>
                      <p className="text-[12px] text-muted">{[v.category, v.address].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{v.price_range ?? "-"}</td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{v.rating ? `${v.rating}${v.review_count ? ` (후기 ${v.review_count}개)` : ""}` : "-"}</td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{v.booking_channel ? CHANNEL_LABEL[v.booking_channel as Channel] : "-"}</td>
                    <td className={td}><Badge v={v.active ? ["배정함", "leaf"] : ["쉬는 중", "muted"]} /></td>
                    <td className={td}>{!ro && <VenuePhotoButton venueId={v.id} has={Boolean(v.photo_url)} action={uploadVenuePhoto} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!!venues.length && !shown.length && <p className="p-8 text-center text-muted">찾는 조건에 맞는 식당이 없어요. <Link href="/admin/venues" className="font-semibold text-accent underline underline-offset-4">거르기 풀기</Link></p>}
            {!venues.length && <p className="p-8 text-center text-muted">아직 식당이 없어요. 위 &lsquo;식당 추가&rsquo;로 한 곳씩, 또는 &lsquo;엑셀로 가져오기&rsquo;로 한 번에 넣어 보세요.</p>}
          </TableScroll>
        </Panel>

        <div className="mt-3">
          <p className="px-1 text-[13px] text-muted">일정별 받을 수 있는 테이블 수는 <Link href="/admin/rounds?tab=stock" className="font-semibold text-accent underline underline-offset-4">회차·식당 재고</Link>에서 바꿔요.</p>
        </div>
      </div>
    </div>
  );
}
