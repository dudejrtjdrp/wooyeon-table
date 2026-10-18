import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { venueToSheet } from "@/lib/venue-sheet";
import { buildVenueWorkbook } from "@/lib/venue-xlsx";

/** 식당 엑셀 양식 내려받기. ?filled=1 이면 지금 식당이 채워진 채로 (고쳐서 다시 올릴 수 있게) */
export async function GET(req: Request) {
  await requireAdmin();
  const filled = new URL(req.url).searchParams.get("filled") === "1";
  const rows = filled
    ? ((await db().from("venues").select("name,region,category,address,price_range,rating,review_count,booking_channel,booking_url,phone,map_url,seats_per_table,active").order("region").order("name")).data ?? []).map(venueToSheet)
    : [];
  const buf = await buildVenueWorkbook(rows, !filled);
  const name = filled ? "우연한식탁_식당목록.xlsx" : "우연한식탁_식당양식.xlsx";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="venues.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
