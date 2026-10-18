import { db } from "@/lib/supabase";

/** 어드민에서 올린 식당 사진을 꺼내 준다. 주소에 저장 시각(?v=)이 붙어 있어 오래 캐시해도 바뀐 사진이 바로 보인다 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("not found", { status: 404 });
  const { data } = await db().from("venue_photos").select("mime,data").eq("venue_id", id).maybeSingle();
  if (!data) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(data.data, "base64"), {
    headers: { "Content-Type": data.mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
