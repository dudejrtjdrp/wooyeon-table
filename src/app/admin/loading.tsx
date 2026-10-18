import { Skeleton } from "@/components/ui";

/** 어드민 전용 로딩: 참가자 화면(미색) 로딩이 잠깐 보이지 않게 기존 흰 테마로 */
export default function Loading() {
  return (
    <div className="admin-theme min-h-dvh bg-paper px-6 pt-10" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-6 h-32 w-full rounded-2xl" />
      <Skeleton className="mt-4 h-64 w-full rounded-2xl" />
    </div>
  );
}
