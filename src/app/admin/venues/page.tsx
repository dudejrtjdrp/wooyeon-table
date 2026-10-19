import { Download, ImageOff } from "lucide-react";
import Link from "next/link";
import { Badge, PageHeader, Panel, btn, td, th } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { CHANNEL_LABEL, type Channel } from "@/lib/reservations";
import { db } from "@/lib/supabase";
import { importVenues, uploadPhotoByName, uploadVenuePhoto } from "./actions";
import { BulkPhotos, ExcelImport, VenuePhotoButton } from "./photo-upload";

const linkBtn = `${btn} border border-line bg-card text-ink hover:bg-field`;

export const dynamic = "force-dynamic";
// 엑셀로 식당을 많이 넣을 때 서버 요청이 기본 시간 제한에 걸리지 않게
export const maxDuration = 60;

type V = { id: string; name: string; region: string; category: string | null; address: string; price_range: string | null; rating: number | null; review_count: number | null; booking_channel: string | null; photo_url: string | null; active: boolean };

/** 식당 관리: 제휴 식당 목록, 사진, 엑셀로 한 번에 넣기. 배정은 매칭 확정 때 이 목록에서 자동으로 한다 */
export default async function Venues() {
  const me = await requireAdmin();
  const ro = me.level === "viewer";
  const { data } = await db().from("venues").select("id,name,region,category,address,price_range,rating,review_count,booking_channel,photo_url,active").order("region").order("name");
  const venues = (data ?? []) as V[];
  const noPhoto = venues.filter((v) => !v.photo_url).length;
  const regions = [...new Set(venues.map((v) => v.region))];

  return (
    <div>
      <PageHeader
        title="식당 관리"
        desc="제휴 식당 목록이에요. 테이블이 확정되면 이 목록에서 동네·시간·인원·평점·예약 채널을 보고 자동으로 배정해요. 일정별 받을 수 있는 테이블 수는 '회차·식당 재고'에서 바꿔요."
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title={`제휴 식당 ${venues.length}곳 · ${regions.length}개 동네${noPhoto ? ` · 사진 없는 곳 ${noPhoto}` : ""}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead><tr>{["사진", "동네", "식당", "가격대", "평점", "예약", "상태", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {venues.map((v) => (
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
                      <p className="min-w-[160px] font-semibold text-ink">{v.name}</p>
                      <p className="text-[12px] text-muted">{[v.category, v.address].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{v.price_range ?? "-"}</td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{v.rating ? `${v.rating}${v.review_count ? ` (${v.review_count})` : ""}` : "-"}</td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{v.booking_channel ? CHANNEL_LABEL[v.booking_channel as Channel] : "-"}</td>
                    <td className={td}><Badge v={v.active ? ["배정함", "leaf"] : ["쉬는 중", "muted"]} /></td>
                    <td className={td}>{!ro && <VenuePhotoButton venueId={v.id} has={Boolean(v.photo_url)} action={uploadVenuePhoto} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!venues.length && <p className="p-8 text-center text-muted">아직 식당이 없어요. 오른쪽에서 엑셀로 한 번에 넣어 보세요.</p>}
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="엑셀로 한 번에 넣기">
            <ol className="space-y-1.5 text-[14px] text-ink2">
              <li>1. 양식을 내려받아요. 동네·가격대·예약 채널은 목록에서 골라요.</li>
              <li>2. 한 줄에 식당 하나씩 채워요. 빨간 칸이 필수예요.</li>
              <li>3. 올리면 같은 동네·같은 이름은 고치고, 없으면 새로 만들어요.</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/admin/venues/template" className={linkBtn}><Download size={16} aria-hidden="true" />빈 양식</a>
              <a href="/admin/venues/template?filled=1" className={linkBtn}><Download size={16} aria-hidden="true" />지금 식당 내려받기</a>
            </div>
            {!ro && <div className="mt-4"><ExcelImport action={importVenues} /></div>}
          </Panel>

          {!ro && (
            <Panel title="사진 여러 장 한 번에">
              <p className="mb-3 text-[14px] text-ink2">파일 이름을 식당 이름으로 맞춰 주세요. 같은 이름이 여러 동네에 있으면 &lsquo;동네 묶음_식당 이름&rsquo;으로요. 사진은 올리기 전에 자동으로 줄여요.</p>
              <BulkPhotos action={uploadPhotoByName} />
            </Panel>
          )}

          <p className="px-1 text-[13px] text-muted">한 곳씩 추가하거나 일정별 테이블 수를 바꾸려면 <Link href="/admin/rounds" className="font-semibold text-accent underline underline-offset-4">회차·식당 재고</Link>로 가요.</p>
        </div>
      </div>
    </div>
  );
}
