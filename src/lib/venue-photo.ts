import { db } from "./supabase";

export const PHOTO_MAX_BYTES = 1_500_000; // 브라우저에서 1280px로 줄인 뒤라 보통 200~400KB
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** 사진을 저장하고 식당의 photo_url을 새 주소로 바꾼다. 실패하면 사람 말로 된 이유를 돌려준다 */
export async function saveVenuePhoto(venueId: string, file: File): Promise<string | null> {
  if (!PHOTO_TYPES.includes(file.type as (typeof PHOTO_TYPES)[number])) return "JPG·PNG·WEBP 사진만 올릴 수 있어요";
  if (file.size > PHOTO_MAX_BYTES) return "사진이 너무 커요(1.5MB까지). 다시 골라 주세요";
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const at = new Date();
  const { error } = await db().from("venue_photos").upsert({ venue_id: venueId, mime: file.type, data, bytes: file.size, updated_at: at.toISOString() });
  if (error) return "사진을 저장하지 못했어요. 잠시 뒤 다시 해 주세요";
  await db().from("venues").update({ photo_url: `/api/venue-photo/${venueId}?v=${at.getTime()}` }).eq("id", venueId);
  return null;
}
