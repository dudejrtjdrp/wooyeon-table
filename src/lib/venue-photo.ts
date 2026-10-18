import { db } from "./supabase";

export const PHOTO_MAX_BYTES = 1_500_000; // 브라우저에서 1280px로 줄인 뒤라 보통 200~400KB
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** 사진을 저장하고 식당의 photo_url을 새 주소로 바꾼다. 실패하면 사람 말로 된 이유를 돌려준다 */
export async function saveVenuePhoto(venueId: string, file: File): Promise<string | null> {
  if (!PHOTO_TYPES.includes(file.type as (typeof PHOTO_TYPES)[number])) return "JPG·PNG·WEBP 사진만 올릴 수 있어요";
  if (file.size > PHOTO_MAX_BYTES) return "사진이 너무 커요(1.5MB까지). 다시 골라 주세요";
  const buf = Buffer.from(await file.arrayBuffer());
  // 브라우저가 알려 준 형식만 믿지 않고 파일 앞 바이트로 실제 형식을 확인한다
  const real = buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png" : buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
  if (!real) return "사진 파일이 아니에요. JPG·PNG·WEBP로 올려 주세요";
  const data = buf.toString("base64");
  const at = new Date();
  const { error } = await db().from("venue_photos").upsert({ venue_id: venueId, mime: real, data, bytes: file.size, updated_at: at.toISOString() });
  if (error) return "사진을 저장하지 못했어요. 잠시 뒤 다시 해 주세요";
  await db().from("venues").update({ photo_url: `/api/venue-photo/${venueId}?v=${at.getTime()}` }).eq("id", venueId);
  return null;
}
