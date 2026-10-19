import { AdminSkeleton } from "@/components/skeletons";

/** 자동 매칭 모니터 불러오는 동안 */
export default function Loading() {
  return <AdminSkeleton kind="cards" stats />;
}
