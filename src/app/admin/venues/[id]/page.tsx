import Link from "next/link";
import { reasonText } from "@/lib/admin-glossary";
import { notFound } from "next/navigation";
import { ImageOff } from "lucide-react";
import { Badge, PageHeader, Panel, btnLight } from "@/components/admin-ui";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtSlot } from "@/lib/format";
import { actorLabel } from "@/lib/labels";
import { db } from "@/lib/supabase";
import { toggleVenue, uploadVenuePhoto } from "../actions";
import { VenuePhotoButton } from "../photo-upload";
import { VenueForm } from "../venue-form";

export const dynamic = "force-dynamic";

/** 식당 한 곳: 정보 고치기, 사진, 배정 켜고 끄기, 일정별 재고, 처리 이력 */
export default async function VenueDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const me = await requireAdmin();
  const ro = me.level === "viewer";
  const { data: v } = await db().from("venues").select("id,name,region,category,address,price_range,rating,review_count,booking_channel,booking_url,phone,map_url,seats_per_table,active,photo_url").eq("id", id).maybeSingle();
  if (!v) notFound();
  const [{ data: inv }, { data: used }, { data: events }] = await Promise.all([
    db().from("venue_slots").select("slot_id,tables_available,slots!inner(starts_at,region,rounds!inner(title,status))").eq("venue_id", id).in("slots.rounds.status", ["open", "matching", "matched"]),
    db().from("dining_tables").select("slot_id").eq("venue_id", id).neq("status", "DISSOLVED"),
    db().from("status_events").select("id,field,from_value,to_value,actor,reason,created_at").eq("entity_type", "venue").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const adminIds = [...new Set((events ?? []).filter((e) => e.actor.startsWith("admin:")).map((e) => e.actor.slice(6)))];
  const { data: admins } = adminIds.length ? await db().from("users").select("id,name").in("id", adminIds) : { data: [] };
  const adminName = new Map((admins ?? []).map((a) => [a.id, a.name]));
  const rows = ((inv ?? []) as unknown as { slot_id: string; tables_available: number; slots: { starts_at: string; region: string; rounds: { title: string; status: string } } }[])
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  const usedIn = (sid: string) => (used ?? []).filter((u) => u.slot_id === sid).length;

  return (
    <div>
      <PageHeader
        title={v.name}
        desc={`${v.region} · ${v.active ? "새 테이블에 배정해요" : "쉬는 중이라 새 테이블에 배정하지 않아요"}`}
        actions={<Link href="/admin/venues" className="text-[14px] font-semibold text-accent underline underline-offset-4">식당 목록으로</Link>}
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="식당 정보"><VenueForm venue={v} ro={ro} /></Panel>
        <div className="flex flex-col gap-4">
          <Panel title="사진">
            {v.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.photo_url} alt={`${v.name} 사진`} className="aspect-[4/3] w-full rounded-xl object-cover" />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-field text-muted"><ImageOff size={22} aria-label="사진 없음" /></div>
            )}
            {!ro && <div className="mt-3"><VenuePhotoButton venueId={v.id} has={Boolean(v.photo_url)} action={uploadVenuePhoto} /></div>}
          </Panel>
          <Panel title="배정">
            <p className="text-[14px] text-ink2"><Badge v={v.active ? ["배정함", "leaf"] : ["쉬는 중", "muted"]} /> {v.active ? "확정되는 테이블에 이 식당을 배정할 수 있어요." : "새 테이블에는 배정하지 않아요. 이미 배정된 모임은 그대로예요."}</p>
            {!ro && (
              <form action={toggleVenue} className="mt-3">
                <input type="hidden" name="id" value={v.id} />
                <button className={btnLight}>{v.active ? "배정 끄기 (쉬는 중으로)" : "다시 배정하기"}</button>
              </form>
            )}
          </Panel>
          <Panel title={`일정별 재고 ${rows.length}곳`}>
            <ul className="space-y-1.5 text-[13px]">
              {rows.map((r) => (
                <li key={r.slot_id} className="flex justify-between gap-2">
                  <span className="text-ink2">{fmtSlot(r.slots.starts_at)} · {r.slots.rounds.title}</span>
                  <span className="whitespace-nowrap text-muted">{usedIn(r.slot_id)} / {r.tables_available}테이블</span>
                </li>
              ))}
              {!rows.length && <li className="text-muted">잡힌 일정이 없어요.</li>}
            </ul>
            <p className="mt-3 text-[13px] text-muted">테이블 수는 <Link href="/admin/rounds?tab=stock" className="font-semibold text-accent underline underline-offset-4">회차·식당 재고</Link>에서 바꿔요.</p>
          </Panel>
          <Panel title="처리 이력">
            <ul className="space-y-2 text-[13px]">
              {(events ?? []).map((e) => (
                <li key={e.id}>
                  <span className="text-muted">{fmtDateTime(e.created_at)} · {actorLabel(e.actor, adminName)}</span>
                  {reasonText(e.reason) && <span className="block text-ink">{reasonText(e.reason)}</span>}
                  {e.from_value && ["edit", "import"].includes(e.field) && <span className="block break-words text-[12px] text-muted">{e.from_value} → {e.to_value}</span>}
                </li>
              ))}
              {!events?.length && <li className="text-muted">기록이 없어요.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
